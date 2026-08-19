import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getField,
  parseFile,
  serializeFile,
  setField,
  stringifyFrontmatter,
} from "../src/content/parse.ts";

const SITE = join(import.meta.dirname, "../../..");

function realFiles(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const sec of ["posts", "notes"]) {
    const dir = join(SITE, "content", sec);
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md")) out.push({ name: `${sec}/${f}`, text: readFileSync(join(dir, f), "utf8") });
    }
  }
  return out;
}

describe("splitting", () => {
  it("separates frontmatter from body", () => {
    const p = parseFile('---\ntitle: "Hi"\n---\n\nBody text\n');
    expect(p.frontmatterText).toBe('title: "Hi"');
    expect(p.body).toBe("\nBody text\n");
    expect(getField(p.doc!, "title")).toBe("Hi");
  });

  it("handles a file with no frontmatter", () => {
    const p = parseFile("Just a body\n");
    expect(p.doc).toBeNull();
    expect(p.body).toBe("Just a body\n");
  });

  it("handles an empty body", () => {
    const p = parseFile("---\ntitle: x\n---\n");
    expect(p.body).toBe("");
    expect(getField(p.doc!, "title")).toBe("x");
  });

  it("does not treat a --- inside the body as a fence", () => {
    const p = parseFile("---\ntitle: x\n---\n\nintro\n\n---\n\nmore\n");
    expect(p.frontmatterText).toBe("title: x");
    expect(p.body).toBe("\nintro\n\n---\n\nmore\n");
  });
});

describe("round-trip", () => {
  it("is byte-identical for every real file in content/ when nothing is edited", () => {
    for (const { name, text } of realFiles()) {
      expect(serializeFile(parseFile(text)), name).toBe(text);
    }
  });

  it("re-stringifies every real frontmatter block with at most trailing-whitespace loss", () => {
    for (const { name, text } of realFiles()) {
      const p = parseFile(text);
      if (!p.doc) continue;
      const out = stringifyFrontmatter(p.doc, p.frontmatterText);
      const withoutTrailingWs = p.frontmatterText
        .split("\n")
        .map((l) => l.replace(/[ \t]+$/, ""))
        .join("\n");
      expect(out, name).toBe(withoutTrailingWs);
    }
  });
});

describe("editing", () => {
  it("preserves comments in the cover block when an unrelated field changes", () => {
    const src = [
      "---",
      'title: "Old"',
      "draft: true",
      "cover:",
      '    image: "/posts/x/a.png"',
      "    relative: false # To use relative path for cover image",
      "---",
      "",
      "body",
      "",
    ].join("\n");
    const p = parseFile(src);
    setField(p.doc!, "title", "New");
    const out = serializeFile(p);
    expect(out).toContain("# To use relative path for cover image");
    expect(out).toContain('title: "New"');
    // The four-space nesting the file already used is kept.
    expect(out).toContain('    image: "/posts/x/a.png"');
    expect(out).toContain("\n\nbody\n");
  });

  it("keeps flow sequences flow and without added padding", () => {
    const p = parseFile("---\ntags: [a, b]\ntitle: x\n---\n\nbody\n");
    setField(p.doc!, "title", "y");
    expect(serializeFile(p)).toContain("tags: [a, b]");
  });

  it("writes nested keys that do not exist yet", () => {
    const p = parseFile("---\ntitle: x\n---\n\nbody\n");
    setField(p.doc!, "cover.image", "/posts/x/1.png");
    const out = serializeFile(p);
    expect(out).toContain("cover:");
    expect(out).toContain("image: /posts/x/1.png");
  });

  it("round-trips tags as a real list", () => {
    const p = parseFile("---\ntags: [a, b]\n---\n\nbody\n");
    expect(getField(p.doc!, "tags")).toEqual(["a", "b"]);
    setField(p.doc!, "tags", ["c", "d", "e"]);
    expect(getField(parseFile(serializeFile(p)).doc!, "tags")).toEqual(["c", "d", "e"]);
  });

  it("leaves the body untouched by frontmatter edits", () => {
    const body = "\n\nLine one\n\n```js\nconst x = 1\n```\n\nLine two\n";
    const p = parseFile(`---\ntitle: x\n---${body}`);
    setField(p.doc!, "title", "changed");
    expect(serializeFile(p).endsWith(body)).toBe(true);
  });
});

describe("flow style", () => {
  it("keeps a flow tag list flow when its contents change", () => {
    const p = parseFile("---\ntitle: x\ntags: [a, b]\n---\n\nbody\n");
    setField(p.doc!, "tags", ["a", "b", "c"]);
    expect(serializeFile(p)).toContain("tags: [a, b, c]");
  });

  it("keeps a block tag list block when its contents change", () => {
    const p = parseFile("---\ntitle: x\ntags:\n- a\n- b\n---\n\nbody\n");
    setField(p.doc!, "tags", ["a", "b", "c"]);
    const out = serializeFile(p);
    expect(out).toContain("- c");
    expect(out).not.toContain("[a, b, c]");
  });
});

describe("malformed frontmatter", () => {
  const broken = "---\ntitle: [unclosed\n---\n\nbody\n";

  it("parses without throwing and reports the error", () => {
    const p = parseFile(broken);
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.pristine).toBeNull();
  });

  it("writes the file back untouched rather than trying to repair it", () => {
    expect(serializeFile(parseFile(broken))).toBe(broken);
  });
});
