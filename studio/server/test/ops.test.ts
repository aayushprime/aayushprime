import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ContentIndex } from "../src/content/index.ts";
import { createPage, duplicatePage, removePage, renamePage, saveBody, saveFields } from "../src/content/ops.ts";
import { makeSite, page, type Fixture } from "./fixture.ts";

let fx: Fixture;
afterEach(() => fx?.cleanup());

async function setup(files: Record<string, string>) {
  fx = makeSite(files);
  const index = new ContentIndex(fx.cfg);
  await index.scan();
  return { cfg: fx.cfg, index };
}

const read = (rel: string) => readFileSync(join(fx.root, rel), "utf8");
const has = (rel: string) => existsSync(join(fx.root, rel));

function withImage(rel: string, name = "1.png") {
  const dir = join(fx.root, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), "png-bytes");
}

describe("createPage", () => {
  it("renders the section archetype with title and date filled in", async () => {
    const { cfg, index } = await setup({
      "archetypes/notes.md": '---\ntitle: "{{ replace .Name "-" " " | title }}"\ndate: {{ .Date }}\ndraft: true\ntags: []\n---\n\nStart here.\n',
    });
    await createPage(cfg, index, { section: "notes", slug: "new-idea" });

    const text = read("content/notes/new-idea.md");
    expect(text).toContain('title: "New Idea"');
    expect(text).toContain("Start here.");
    expect(text).not.toContain("{{");
    expect(index.get("notes", "new-idea")!.draft).toBe(true);
  });

  it("refuses to overwrite an existing page", async () => {
    const { cfg, index } = await setup({ "content/notes/taken.md": page({ title: "Taken" }) });
    await expect(createPage(cfg, index, { section: "notes", slug: "taken" })).rejects.toThrow(/exists/i);
    expect(read("content/notes/taken.md")).toContain("Taken");
  });

  it("rejects a slug that would escape the content directory", async () => {
    const { cfg, index } = await setup({});
    await expect(createPage(cfg, index, { section: "notes", slug: "../../evil" })).rejects.toThrow();
  });
});

describe("saveBody and saveFields", () => {
  it("writes the body and leaves frontmatter byte-identical", async () => {
    const original = '---\ntitle: "Keep"\ndraft: false \ntags: [a, b]\n---\n\nold body\n';
    const { cfg, index } = await setup({ "content/notes/keep.md": original });

    await saveBody(cfg, index, { section: "notes", slug: "keep", body: "new body\n" });

    const text = read("content/notes/keep.md");
    expect(text).toContain("draft: false \n"); // trailing space survives
    expect(text).toContain("tags: [a, b]");
    expect(text.endsWith("\nnew body\n")).toBe(true);
    expect(text).not.toContain("old body");
  });

  it("updates a field without disturbing comments elsewhere", async () => {
    const original = [
      "---",
      'title: "Before"',
      "cover:",
      '    image: "/posts/x/a.png"',
      "    relative: false # keep me",
      "---",
      "",
      "body\n",
    ].join("\n");
    const { cfg, index } = await setup({ "content/posts/x.md": original });

    await saveFields(cfg, index, { section: "posts", slug: "x", fields: { title: "After" } });

    const text = read("content/posts/x.md");
    expect(text).toContain('title: "After"');
    expect(text).toContain("# keep me");
    expect(text).toContain('    image: "/posts/x/a.png"');
    expect(index.get("posts", "x")!.title).toBe("After");
  });

  it("refuses to edit fields of a file with unparseable frontmatter", async () => {
    const broken = "---\ntitle: [unclosed\n---\n\nbody\n";
    const { cfg, index } = await setup({ "content/notes/broken.md": broken });

    await expect(
      saveFields(cfg, index, { section: "notes", slug: "broken", fields: { title: "x" } }),
    ).rejects.toThrow(/frontmatter/i);
    expect(read("content/notes/broken.md")).toBe(broken);
  });
});

describe("renamePage", () => {
  it("moves the markdown and its image directory together", async () => {
    const { cfg, index } = await setup({
      "content/posts/old-name.md": page({ title: "Old", body: "![](/posts/old-name/1.png)\n" }),
    });
    withImage("static/posts/old-name");

    await renamePage(cfg, index, { section: "posts", slug: "old-name", newSlug: "new-name" });

    expect(has("content/posts/old-name.md")).toBe(false);
    expect(has("static/posts/old-name")).toBe(false);
    expect(has("content/posts/new-name.md")).toBe(true);
    expect(has("static/posts/new-name/1.png")).toBe(true);
  });

  it("rewrites image paths inside the renamed file, frontmatter included", async () => {
    const original = [
      "---",
      'title: "Old"',
      "cover:",
      '    image: "/posts/old-name/cover.png"',
      "---",
      "",
      "![](/posts/old-name/1.png)\n",
    ].join("\n");
    const { cfg, index } = await setup({ "content/posts/old-name.md": original });

    await renamePage(cfg, index, { section: "posts", slug: "old-name", newSlug: "new-name" });

    const text = read("content/posts/new-name.md");
    expect(text).toContain('image: "/posts/new-name/cover.png"');
    expect(text).toContain("![](/posts/new-name/1.png)");
    expect(text).not.toContain("old-name");
  });

  it("rewrites inbound wikilinks in other notes, keeping labels", async () => {
    const { cfg, index } = await setup({
      "content/notes/target.md": page({ title: "Target" }),
      "content/notes/a.md": page({ title: "A", body: "see [[target]] here\n" }),
      "content/notes/b.md": page({ title: "B", body: "see [[target|the target]] here\n" }),
      "content/notes/c.md": page({ title: "C", body: "see [the target](target) here\n" }),
    });

    await renamePage(cfg, index, { section: "notes", slug: "target", newSlug: "renamed" });

    expect(read("content/notes/a.md")).toContain("[[renamed]]");
    expect(read("content/notes/b.md")).toContain("[[renamed|the target]]");
    expect(read("content/notes/c.md")).toContain("[the target](renamed)");
    expect(index.backlinks("renamed").map((e) => e.slug).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not rewrite a link that only appears inside a code sample", async () => {
    const { cfg, index } = await setup({
      "content/notes/target.md": page({ title: "Target" }),
      "content/notes/doc.md": page({
        title: "Doc",
        body: "Write it like this:\n\n```\n[[target]]\n```\n\nand inline `[[target]]` too.\n",
      }),
    });

    await renamePage(cfg, index, { section: "notes", slug: "target", newSlug: "renamed" });

    const text = read("content/notes/doc.md");
    expect(text).toContain("```\n[[target]]\n```");
    expect(text).toContain("`[[target]]`");
    expect(text).not.toContain("renamed");
  });

  it("leaves a bare-token link in a blog post alone", async () => {
    // render-link.html only resolves bare tokens inside notes, so `(target)`
    // in a post is an ordinary link and renaming a note must not touch it.
    const { cfg, index } = await setup({
      "content/notes/target.md": page({ title: "Target" }),
      "content/posts/p.md": page({ title: "P", body: "see [x](target) and [[target]]\n" }),
    });

    await renamePage(cfg, index, { section: "notes", slug: "target", newSlug: "renamed" });

    const text = read("content/posts/p.md");
    expect(text).toContain("[x](target)");
    expect(text).toContain("[[target]]");
  });

  it("refuses when the target slug is taken, changing nothing", async () => {
    const { cfg, index } = await setup({
      "content/notes/a.md": page({ title: "A" }),
      "content/notes/b.md": page({ title: "B" }),
    });

    await expect(
      renamePage(cfg, index, { section: "notes", slug: "a", newSlug: "b" }),
    ).rejects.toThrow(/exists/i);

    expect(read("content/notes/a.md")).toContain("A");
    expect(read("content/notes/b.md")).toContain("B");
  });
});

describe("duplicatePage", () => {
  it("copies content and images, and marks the copy a draft", async () => {
    const { cfg, index } = await setup({
      "content/posts/orig.md": page({ title: "Orig", draft: false, body: "![](/posts/orig/1.png)\n" }),
    });
    withImage("static/posts/orig");

    await duplicatePage(cfg, index, { section: "posts", slug: "orig", newSlug: "copy" });

    const text = read("content/posts/copy.md");
    expect(text).toContain("draft: true");
    expect(text).toContain("![](/posts/copy/1.png)");
    expect(has("static/posts/copy/1.png")).toBe(true);
    expect(read("content/posts/orig.md")).toContain("draft: false");
    expect(has("static/posts/orig/1.png")).toBe(true);
  });

  it("does not rewrite links pointing at the original", async () => {
    const { cfg, index } = await setup({
      "content/notes/orig.md": page({ title: "Orig", body: "text\n" }),
      "content/notes/other.md": page({ title: "Other", body: "see [[orig]]\n" }),
    });

    await duplicatePage(cfg, index, { section: "notes", slug: "orig", newSlug: "orig-copy" });

    expect(read("content/notes/other.md")).toContain("[[orig]]");
  });
});

describe("removePage", () => {
  it("deletes the markdown and the image directory", async () => {
    const { cfg, index } = await setup({ "content/posts/gone.md": page({ title: "Gone" }) });
    withImage("static/posts/gone");

    await removePage(cfg, index, { section: "posts", slug: "gone" });

    expect(has("content/posts/gone.md")).toBe(false);
    expect(has("static/posts/gone")).toBe(false);
    expect(index.get("posts", "gone")).toBeUndefined();
  });

  it("reports which inbound links the deletion would break", async () => {
    const { cfg, index } = await setup({
      "content/notes/doomed.md": page({ title: "Doomed" }),
      "content/notes/a.md": page({ title: "A", body: "see [[doomed]]\n" }),
    });

    const impact = index.backlinks("doomed").map((e) => e.slug);
    expect(impact).toEqual(["a"]);

    await removePage(cfg, index, { section: "notes", slug: "doomed" });
    expect(index.brokenLinks("notes", "a")).toEqual(["doomed"]);
  });
});

describe("clearing fields", () => {
  it("removes a key when the value is null", async () => {
    const original = [
      "---",
      'title: "Has cover"',
      "cover:",
      '    image: "/posts/x/a.png"',
      '    alt: "something"',
      "---",
      "",
      "body\n",
    ].join("\n");
    const { cfg, index } = await setup({ "content/posts/x.md": original });

    await saveFields(cfg, index, { section: "posts", slug: "x", fields: { cover: null } });

    const text = read("content/posts/x.md");
    expect(text).not.toContain("cover:");
    expect(text).not.toContain("/posts/x/a.png");
    expect(text).toContain('title: "Has cover"');
  });

  it("leaves the rest of the frontmatter alone when clearing", async () => {
    const { cfg, index } = await setup({
      "content/posts/x.md": '---\ntitle: "T"\ntags: [a, b]\ncover:\n    image: "/posts/x/a.png"\n---\n\nbody\n',
    });

    await saveFields(cfg, index, { section: "posts", slug: "x", fields: { cover: null } });

    expect(read("content/posts/x.md")).toContain("tags: [a, b]");
    expect(index.get("posts", "x")!.tags).toEqual(["a", "b"]);
  });
});
