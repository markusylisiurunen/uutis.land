import { makeArticlesProvider, makeStaticArticlesProvider } from "./data";
import { HorizontalCard, VerticalCard, html } from "./render";

const CACHE_STALE_CONTROL_HEADER = "X-Cache-Stale-Control";

const CACHE_STALE_AFTER_SECONDS = 30;
const CACHE_EXPIRED_AFTER_SECONDS = 1800;

function toCacheKey(request: Request) {
  return new Request(request.url, { method: request.method });
}

// helpers for handling requests
// ---

async function handleGetIndex(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // fetch the articles
  const articleProvider = env.ENV === "dev" ? makeStaticArticlesProvider() : makeArticlesProvider(env);
  const articles = await articleProvider.getArticles();
  // render the articles into HTML
  const idToHref = (id: string) => (env.ENV === "dev" ? `/article` : `/a/${id}`);
  const html = articles
    .flatMap((article, idx) =>
      idx >= 3
        ? HorizontalCard({
            id: article.id,
            href: idToHref(article.id),
            headline: article.data.headline,
            publishedAt: article.data.published_at,
          })
        : VerticalCard({
            id: article.id,
            href: idToHref(article.id),
            headline: article.data.headline,
            publishedAt: article.data.published_at,
          }),
    )
    .join("");
  // in dev mode, just return the partial HTML
  if (new URL(request.url).searchParams.has("dev")) {
    return new Response(html, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/html",
      },
    });
  }
  // otherwise, render the entire HTML page
  const indexHtmlObject = await env.BUCKET.get("index.html");
  if (indexHtmlObject === null) return new Response(null, { status: 404 });
  let indexHtml = await indexHtmlObject.text();
  indexHtml = indexHtml.replaceAll('<div id="content"></div>', `<div id="content">${html}</div>`);
  // construct the response
  const headers = new Headers();
  indexHtmlObject.writeHttpMetadata(headers);
  headers.set("Cache-Control", `max-age=${CACHE_EXPIRED_AFTER_SECONDS}`);
  headers.set(CACHE_STALE_CONTROL_HEADER, String(Date.now() + CACHE_STALE_AFTER_SECONDS * 1000));
  return new Response(indexHtml, { headers });
}

async function handleGetTag(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // fetch the articles
  const articleProvider = env.ENV === "dev" ? makeStaticArticlesProvider() : makeArticlesProvider(env);
  const articles = await articleProvider.getArticlesByTag(new URL(request.url).searchParams.get("tag") ?? "");
  // render the articles into HTML
  const idToHref = (id: string) => (env.ENV === "dev" ? `/article` : `/a/${id}`);
  const html = articles
    .flatMap((article, idx) =>
      idx >= 3
        ? HorizontalCard({
            id: article.id,
            href: idToHref(article.id),
            headline: article.data.headline,
            publishedAt: article.data.published_at,
          })
        : VerticalCard({
            id: article.id,
            href: idToHref(article.id),
            headline: article.data.headline,
            publishedAt: article.data.published_at,
          }),
    )
    .join("");
  // in dev mode, just return the partial HTML
  if (new URL(request.url).searchParams.has("dev")) {
    return new Response(html, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/html",
      },
    });
  }
  // otherwise, render the entire HTML page
  const tagHtmlObject = await env.BUCKET.get("tag.html");
  if (tagHtmlObject === null) return new Response(null, { status: 404 });
  let tagHtml = await tagHtmlObject.text();
  tagHtml = tagHtml.replaceAll('<div id="content"></div>', `<div id="content">${html}</div>`);
  // construct the response
  const headers = new Headers();
  tagHtmlObject.writeHttpMetadata(headers);
  headers.set("Cache-Control", `max-age=${CACHE_EXPIRED_AFTER_SECONDS}`);
  headers.set(CACHE_STALE_CONTROL_HEADER, String(Date.now() + CACHE_STALE_AFTER_SECONDS * 1000));
  return new Response(tagHtml, { headers });
}

async function handleGetArticle(id: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // fetch the article
  const articleProvider = env.ENV === "dev" ? makeStaticArticlesProvider() : makeArticlesProvider(env);
  const article = await articleProvider.getArticle(id);
  // render the article into HTML
  const content = [
    html`
      <article>
        <header>
          ${article.data.tags.length > 0
            ? html`<div class="tag">
                <a href="${`/tag?${new URLSearchParams({ tag: article.data.tags[0] }).toString()}`}">
                  ${article.data.tags[0] ?? ""}
                </a>
              </div>`
            : ""}
          <h1>${article.data.headline}</h1>
          ${article.data.excerpt ? html`<p>${article.data.excerpt}</p>` : ""}
          <figure>
            <img src="https://picsum.photos/seed/${article.id}/1440/960" />
          </figure>
        </header>
        <section>{{ html }}</section>
        <footer>
          <div class="tags">
            ${article.data.tags.map(
              (tag) =>
                html`<span>
                  <a href="${`/tag?${new URLSearchParams({ tag }).toString()}`}">${tag}</a>
                </span>`,
            )}
          </div>
        </footer>
      </article>
    `,
  ]
    .flat()
    .map((v) => v.replaceAll("{{ html }}", article.html))
    .join("");
  // in dev mode, just return the partial HTML
  if (new URL(request.url).searchParams.has("dev")) {
    return new Response(content, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/html",
      },
    });
  }
  // otherwise, render the entire HTML page
  const articleHtmlObject = await env.BUCKET.get("article.html");
  if (articleHtmlObject === null) return new Response(null, { status: 404 });
  let articleHtml = await articleHtmlObject.text();
  articleHtml = articleHtml.replaceAll('<div id="content"></div>', `<div id="content">${content}</div>`);
  // construct the response
  const headers = new Headers();
  articleHtmlObject.writeHttpMetadata(headers);
  headers.set("Cache-Control", `max-age=${CACHE_EXPIRED_AFTER_SECONDS}`);
  headers.set(CACHE_STALE_CONTROL_HEADER, String(Date.now() + CACHE_STALE_AFTER_SECONDS * 1000));
  return new Response(articleHtml, { headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    async function _fetch() {
      const url = new URL(request.url);
      if (url.pathname === "/") {
        // construct the cache key
        const cacheKey = toCacheKey(request);
        // check if the response was in cache
        const cacheResp = await caches.default.match(cacheKey);
        if (cacheResp) {
          // revalidate if stale
          ctx.waitUntil(
            Promise.resolve().then(async () => {
              const staleAt = cacheResp.headers.get(CACHE_STALE_CONTROL_HEADER);
              if (!staleAt) return;
              const shouldRevalidate = parseInt(staleAt, 10) <= Date.now();
              if (!shouldRevalidate) return;
              // revalidate and update the cache
              const resp = await handleGetIndex(request, env, ctx);
              await caches.default.put(cacheKey, resp);
            }),
          );
          return cacheResp;
        }
        // otherwise, construct the page
        const resp = await handleGetIndex(request, env, ctx);
        ctx.waitUntil(caches.default.put(cacheKey, resp.clone()));
        return resp;
      }
      if (url.pathname === "/tag") {
        // construct the cache key
        const cacheKey = toCacheKey(request);
        // check if the response was in cache
        const cacheResp = await caches.default.match(cacheKey);
        if (cacheResp) {
          // revalidate if stale
          ctx.waitUntil(
            Promise.resolve().then(async () => {
              const staleAt = cacheResp.headers.get(CACHE_STALE_CONTROL_HEADER);
              if (!staleAt) return;
              const shouldRevalidate = parseInt(staleAt, 10) <= Date.now();
              if (!shouldRevalidate) return;
              // revalidate and update the cache
              const resp = await handleGetTag(request, env, ctx);
              await caches.default.put(cacheKey, resp);
            }),
          );
          return cacheResp;
        }
        // otherwise, construct the page
        const resp = await handleGetTag(request, env, ctx);
        ctx.waitUntil(caches.default.put(cacheKey, resp.clone()));
        return resp;
      }
      if (url.pathname.startsWith("/a/")) {
        const id = url.pathname.slice(1).split("/")[1];
        if (!id) return new Response("not found", { status: 404 });
        // construct the cache key
        const cacheKey = toCacheKey(request);
        // check if the response was in cache
        const cacheResp = await caches.default.match(cacheKey);
        if (cacheResp) {
          // revalidate if stale
          ctx.waitUntil(
            Promise.resolve().then(async () => {
              const staleAt = cacheResp.headers.get(CACHE_STALE_CONTROL_HEADER);
              if (!staleAt) return;
              const shouldRevalidate = parseInt(staleAt, 10) <= Date.now();
              if (!shouldRevalidate) return;
              // revalidate and update the cache
              const resp = await handleGetArticle(id, request, env, ctx);
              await caches.default.put(cacheKey, resp);
            }),
          );
          return cacheResp;
        }
        // otherwise, construct the page
        const resp = await handleGetArticle(id, request, env, ctx);
        ctx.waitUntil(caches.default.put(cacheKey, resp.clone()));
        return resp;
      }
      return new Response("not found", { status: 404 });
    }
    // never instruct the browser to cache the HTML page, always serve it from the edge
    const resp = await _fetch();
    const headers = new Headers(resp.headers);
    headers.delete("Cache-Control");
    headers.delete(CACHE_STALE_CONTROL_HEADER);
    return new Response(resp.body, { ...resp, headers });
  },
};
