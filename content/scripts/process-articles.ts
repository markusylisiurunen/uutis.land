import matter from "gray-matter";
import fs from "node:fs/promises";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import z from "zod";

const processor = unified().use(remarkParse).use(remarkRehype).use(rehypeStringify);

const FrontmatterSchema = z.object({
  headline: z.string().min(1),
  excerpt: z.string().min(1).nullable(),
  published_at: z.string().datetime(),
  tags: z.array(z.string()).default([]),
  meta_yle_url: z.string().url().optional(),
});

const ArticleSchema = z.object({
  data: FrontmatterSchema,
  html: z.string(),
});

const config = {
  SRC_DIR: "./articles",
  OUT_DIR: "./dist/articles",
};

(async () => {
  if (await exists(config.OUT_DIR)) {
    await fs.rm(config.OUT_DIR, { recursive: true });
  }
  await fs.mkdir(config.OUT_DIR);
  await fs.cp(`${config.SRC_DIR}/.meta`, `${config.OUT_DIR}/.meta`, { recursive: true });
  const articleDirs = await fs.readdir(config.SRC_DIR, { encoding: "utf-8" });
  const articleIds = articleDirs.filter((d) => !d.startsWith("."));
  for (const id of articleIds) {
    const markdown = await fs.readFile(`./articles/${id}/article.md`, { encoding: "utf-8" });
    const { content, data } = matter(markdown);
    const frontmatter = FrontmatterSchema.parse(data);
    const html = String(await processor.process(content));
    await fs.mkdir(`${config.OUT_DIR}/${id}`);
    await fs.writeFile(
      `${config.OUT_DIR}/${id}/article.json`,
      JSON.stringify(ArticleSchema.parse({ data: frontmatter, html })),
    );
  }
})();

async function exists(path: string) {
  return fs.stat(path).then(
    () => true,
    () => false,
  );
}
