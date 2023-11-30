import matter from "gray-matter";
import fs from "node:fs/promises";
import { z } from "zod";

const ArticleMeta = z.object({
  headline: z.string().min(1),
  excerpt: z.string().min(1).nullable(),
  published_at: z.string().datetime(),
  tags: z.array(z.string()).min(1),
});
type ArticleMeta = z.infer<typeof ArticleMeta>;

async function createIndexByPublishedAt() {
  const ids = await fs
    .readdir("./articles", { encoding: "utf-8" })
    .then((dirs) => dirs.filter((dir) => !dir.startsWith(".")));
  const meta = new Map<string, ArticleMeta>();
  for (const id of ids) {
    const content = await fs.readFile(`./articles/${id}/article.md`, { encoding: "utf-8" });
    const { data } = matter(content);
    const _meta = ArticleMeta.parse(data);
    meta.set(id, _meta);
  }
  const index = [...meta.entries()]
    .sort((a, b) => new Date(b[1].published_at).getTime() - new Date(a[1].published_at).getTime())
    .map(([id, _meta]) => ({ id, publishedAt: _meta.published_at }));
  await fs.writeFile("./articles/.meta/index/by-published-at.json", JSON.stringify(index), { encoding: "utf-8" });
}

async function createIndexByTag() {
  const ids = await fs
    .readdir("./articles", { encoding: "utf-8" })
    .then((dirs) => dirs.filter((dir) => !dir.startsWith(".")));
  const meta = new Map<string, ArticleMeta>();
  for (const id of ids) {
    const content = await fs.readFile(`./articles/${id}/article.md`, { encoding: "utf-8" });
    const { data } = matter(content);
    const _meta = ArticleMeta.parse(data);
    meta.set(id, _meta);
  }
  const index = {} as Record<string, { id: string; publishedAt: string }[]>;
  for (const [id, _meta] of meta.entries()) {
    for (const tag of _meta.tags) {
      if (!index[tag]) index[tag] = [];
      index[tag].push({ id, publishedAt: _meta.published_at });
    }
  }
  for (const tag of Object.keys(index)) {
    index[tag].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }
  await fs.writeFile("./articles/.meta/index/by-tag.json", JSON.stringify(index), { encoding: "utf-8" });
}

(async () => {
  await fs.rm("./articles/.meta", { recursive: true }).catch(() => {});
  await fs.mkdir("./articles/.meta/index", { recursive: true });
  await createIndexByPublishedAt();
  await createIndexByTag();
})();
