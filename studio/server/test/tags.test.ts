import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ContentIndex } from "../src/content/index.ts";
import { renameTag, removeTag } from "../src/content/tags.ts";
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

describe("renameTag", () => {
  it("renames the tag in every file that carries it", async () => {
    const { cfg, index } = await setup({
      "content/posts/a.md": page({ title: "A", tags: ["golang", "systems"] }),
      "content/notes/b.md": page({ title: "B", tags: ["golang"] }),
      "content/notes/c.md": page({ title: "C", tags: ["other"] }),
    });

    const r = await renameTag(cfg, index, { from: "golang", to: "go" });

    expect(r.changed.sort()).toEqual(["notes/b", "posts/a"]);
    expect(read("content/posts/a.md")).toContain("tags: [go, systems]");
    expect(read("content/notes/b.md")).toContain("tags: [go]");
    expect(read("content/notes/c.md")).toContain("tags: [other]");
    expect(index.tagCounts().find((t) => t.tag === "go")!.count).toBe(2);
    expect(index.tagCounts().find((t) => t.tag === "golang")).toBeUndefined();
  });

  it("merges into an existing tag without leaving a duplicate", async () => {
    const { cfg, index } = await setup({
      "content/posts/a.md": page({ title: "A", tags: ["golang", "go", "db"] }),
    });

    await renameTag(cfg, index, { from: "golang", to: "go" });

    expect(read("content/posts/a.md")).toContain("tags: [go, db]");
    expect(index.get("posts", "a")!.tags).toEqual(["go", "db"]);
  });

  it("keeps a block tag list in block style", async () => {
    const { cfg, index } = await setup({
      "content/notes/a.md": '---\ntitle: "A"\ntags:\n- golang\n- db\n---\n\nbody\n',
    });

    await renameTag(cfg, index, { from: "golang", to: "go" });

    const text = read("content/notes/a.md");
    expect(text).toContain("- go");
    expect(text).toContain("- db");
    expect(text).not.toContain("[go, db]");
  });

  it("preserves comments in the frontmatter it rewrites", async () => {
    const { cfg, index } = await setup({
      "content/notes/a.md": [
        "---",
        'title: "A"',
        "# Tags become nodes in the notes graph",
        "tags: [golang]",
        "---",
        "",
        "body\n",
      ].join("\n"),
    });

    await renameTag(cfg, index, { from: "golang", to: "go" });

    expect(read("content/notes/a.md")).toContain("# Tags become nodes in the notes graph");
    expect(read("content/notes/a.md")).toContain("tags: [go]");
  });

  it("touches no file when the tag is unused", async () => {
    const { cfg, index } = await setup({ "content/notes/a.md": page({ title: "A", tags: ["x"] }) });
    const before = read("content/notes/a.md");

    const r = await renameTag(cfg, index, { from: "nonexistent", to: "y" });

    expect(r.changed).toEqual([]);
    expect(read("content/notes/a.md")).toBe(before);
  });

  it("rejects an empty target tag", async () => {
    const { cfg, index } = await setup({ "content/notes/a.md": page({ title: "A", tags: ["x"] }) });
    await expect(renameTag(cfg, index, { from: "x", to: "  " })).rejects.toThrow();
  });
});

describe("removeTag", () => {
  it("drops the tag everywhere and leaves the rest in order", async () => {
    const { cfg, index } = await setup({
      "content/posts/a.md": page({ title: "A", tags: ["keep", "drop", "also"] }),
      "content/notes/b.md": page({ title: "B", tags: ["drop"] }),
    });

    const r = await removeTag(cfg, index, "drop");

    expect(r.changed.sort()).toEqual(["notes/b", "posts/a"]);
    expect(read("content/posts/a.md")).toContain("tags: [keep, also]");
    expect(read("content/notes/b.md")).toContain("tags: []");
  });
});
