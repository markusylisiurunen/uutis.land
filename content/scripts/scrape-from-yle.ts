import matter from "gray-matter";
import fs from "node:fs";
import prettier from "prettier";
import puppeteer, { Browser, Page } from "puppeteer";
import TurndownService from "turndown";
import YAML from "yaml";
import { z } from "zod";

const config = {
  HEADLESS: true,
  COUNT: 64,
};

const YleArticleMeta = z.object({
  headline: z.string().transform((s) => s.trim()),
  excerpt: z
    .string()
    .transform((s) => s.trim())
    .nullable()
    .default(null),
  published: z.string().datetime(),
  tags: z.array(z.string()).default([]),
});
type YleArticleMeta = z.infer<typeof YleArticleMeta>;

class YleScraper {
  private browser?: Browser;

  async destroy() {
    if (!this.browser) return;
    this.log("destroying browser...");
    await this.browser.close();
  }

  // methods for scraping the URLs of the latest news articles
  // ---

  public async getLatestUrls(maxCount: number): Promise<string[]> {
    async function getUrls(page: Page): Promise<string[]> {
      return page.$eval("main", (el) => {
        const links = el.querySelectorAll("a[href^='/a/']");
        const urls = Array.from(links).map((el) => `https://yle.fi${el.getAttribute("href")}`);
        return [...new Set(urls)];
      });
    }
    async function getCount(page: Page): Promise<number> {
      const urls = await getUrls(page);
      return urls.length;
    }
    return this.withPage(async (page) => {
      // open the latest news page
      this.log("opening https://yle.fi/uutiset/tuoreimmat...");
      await page.goto(`https://yle.fi/uutiset/tuoreimmat`, { waitUntil: "domcontentloaded" });
      // the page uses lazy loading, scroll down until there are at least `maxCount` articles
      while (true) {
        const count = await getCount(page);
        this.log(`found ${count} articles`);
        if (count >= maxCount) break;
        this.log("scrolling down...");
        await page.evaluate(() => {
          window.scrollBy(0, 9999);
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      // get the URLs of the articles
      const urls = await getUrls(page);
      return urls.slice(0, maxCount);
    });
  }

  public async getArticleAsMarkdown(url: string): Promise<null | {
    meta: YleArticleMeta;
    markdown: string;
  }> {
    const selectors = {
      article: "article.yle__article",
      header: "article.yle__article > header.yle__article__header",
      headerHeadline: "article.yle__article > header.yle__article__header > h1",
      headerExcerpt: "article.yle__article > header.yle__article__header > p:first-of-type",
      headerPublished: "article.yle__article > header.yle__article__header time.yle__article__date--published",
      content: "article.yle__article > section.yle__article__content",
      footer: "article.yle__article > footer.yle__article__footer",
    };
    async function isValidArticle(page: Page): Promise<boolean> {
      try {
        return page.evaluate((selectors) => {
          const article = document.querySelector(selectors.article);
          const header = document.querySelector(selectors.header);
          const content = document.querySelector(selectors.content);
          const footer = document.querySelector(selectors.footer);
          return Boolean(article && header && content && footer);
        }, selectors);
      } catch (error) {
        return false;
      }
    }
    return this.withPage(async (page) => {
      // open the article page
      this.log(`opening ${url}...`);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      // check if the page is a valid article
      const isValid = await isValidArticle(page);
      if (!isValid) {
        this.log("skipping because the article was not in the expected format");
        return null;
      }
      // extract the metadata from the page
      const headline = await this.extractOrNull(page, selectors.headerHeadline, (e) => e.textContent);
      const excerpt = await this.extractOrNull(page, selectors.headerExcerpt, (e) => e.textContent);
      const published = await this.extractOrNull(page, selectors.headerPublished, (e) => {
        if (!e.hasAttribute("datetime")) return null;
        return new Date(e.getAttribute("datetime")!).toISOString();
      });
      const primaryTag = await this.extractOrNull(
        page,
        `${selectors.header} a[aria-label^='Lisää artikkeleita aiheesta']`,
        (el) => el.textContent?.trim() ?? null,
      );
      await page.click(`button[aria-label='Näytä kaikki aiheet']`).catch(() => {});
      const footerTags = await this.extractMany(
        page,
        `${selectors.footer} a[aria-label^='Lisää artikkeleita aiheesta']`,
        (el) => el.map((el) => el.textContent?.trim()).filter((tag): tag is string => Boolean(tag)),
      );
      const tags = [...new Set([primaryTag, ...(footerTags ?? [])])];
      // remove the unnecessary elements from the page
      await page.$eval(selectors.content, (el) => {
        function removeAllBut(tags: string[]) {
          el.querySelectorAll(`& > ${tags.map((tag) => `:not(${tag})`).join("")}`).forEach((el) => el.remove());
        }
        removeAllBut(["p", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote"]);
      });
      // make sure there is enough content
      const pCount = await page.$$eval(`${selectors.content} > p`, (el) => el.length);
      if (pCount < 3) {
        this.log("skipping because not enough content");
        return null;
      }
      // parse the content into markdown
      const turndown = new TurndownService({ codeBlockStyle: "fenced", headingStyle: "atx", hr: "---" });
      const html = await page.$eval(selectors.content, (el) => el.innerHTML);
      const markdown = turndown.turndown(html);
      // return the article
      const meta = YleArticleMeta.safeParse({
        headline: headline,
        excerpt: excerpt,
        published: published,
        tags: tags,
      });
      if (!meta.success) {
        this.log("skipping because the metadata was not in the expected format");
        return null;
      }
      const prettierOptions: prettier.Options = {
        parser: "markdown",
        proseWrap: "never",
      };
      return {
        meta: meta.data,
        markdown: await prettier.format(
          [
            "---",
            YAML.stringify(
              {
                headline: meta.data.headline,
                excerpt: meta.data.excerpt,
                published_at: meta.data.published,
                tags: meta.data.tags,
                meta_yle_url: url,
              },
              { version: "1.1", lineWidth: 0 },
            ).trim(),
            "---",
            "",
            markdown,
          ].join("\n"),
          prettierOptions,
        ),
      };
    });
  }

  // generic private helpers
  // ---

  private log(msg: string) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  private async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    if (!this.browser) {
      this.log("launching browser...");
      this.browser = await puppeteer.launch({ headless: config.HEADLESS ? "new" : false });
    }
    this.log("opening a new page...");
    const page = await this.browser!.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    try {
      const result = await fn(page);
      return result;
    } finally {
      await page.close();
    }
  }

  private async extractOrNull<T>(page: Page, selector: string, fn: (el: Element) => T) {
    try {
      const result = await page.$eval(selector, fn);
      return result;
    } catch (err) {
      return null;
    }
  }

  private async extractMany<T>(page: Page, selector: string, fn: (el: Element[]) => T) {
    try {
      const result = await page.$$eval(selector, fn);
      return result;
    } catch (err) {
      return null;
    }
  }
}

(async () => {
  // get the counter per date
  const existing = new Set<string>();
  const counters = new Map<string, number>();
  fs.readdirSync("./articles").forEach((dir) => {
    const match = /[0-9]{8}-[0-9]{3}/.test(dir);
    if (!match) return;
    const [date, counter] = dir.split("-");
    counters.set(date, parseInt(counter, 10));
    const file = fs.readFileSync(`./articles/${dir}/article.md`, { encoding: "utf-8" });
    const { data } = matter(file);
    const meta = z.object({ meta_yle_url: z.string().url() }).safeParse(data);
    if (!meta.success) return;
    existing.add(meta.data.meta_yle_url);
  });
  // fetch the latest news articles from Yle
  const yle = new YleScraper();
  let urls = await yle.getLatestUrls(config.COUNT);
  urls = urls.filter((url) => !existing.has(url));
  // one by one, get the markdown article and write it to the articles directory
  const BATCH_SIZE = 3;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const u = i + BATCH_SIZE > urls.length ? urls.length : i + BATCH_SIZE;
    const batch = urls.slice(i, u);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const result = await yle.getArticleAsMarkdown(url);
          if (!result) return;
          const { meta, markdown } = result;
          // create the directory for the article
          const dateString = meta.published.split("T").at(0)?.split("-").join("");
          if (!dateString) throw new Error("Invalid published date");
          const counter = counters.get(dateString) ?? 0;
          counters.set(dateString, counter + 1);
          const dirPath = `./articles/${dateString}-${(counter + 1).toString().padStart(3, "0")}`;
          fs.mkdirSync(dirPath);
          // write the markdown file
          fs.writeFileSync(`${dirPath}/article.md`, markdown, { encoding: "utf-8" });
        } catch (error) {
          console.error(error);
        }
      }),
    );
  }
  await yle.destroy();
})();
