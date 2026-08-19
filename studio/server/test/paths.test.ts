import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import {
  contentPath,
  imageDir,
  imageUrl,
  imageUrlPrefix,
  parseContentPath,
  isValidSlug,
  assertSlug,
} from "../src/content/paths.ts";

const cfg = loadConfig("/site");

describe("slug validation", () => {
  it("accepts the shapes Hugo and the graph regex agree on", () => {
    for (const s of ["tmux", "force-layouts", "a1", "2024-recap"]) {
      expect(isValidSlug(s), s).toBe(true);
    }
  });

  it("rejects anything that could escape the content directory", () => {
    for (const s of ["..", "../etc", "a/b", "a\\b", "/abs", "a.md", "a b", "Tmux", "-lead", ""]) {
      expect(isValidSlug(s), s).toBe(false);
    }
  });

  it("assertSlug throws on a traversal attempt", () => {
    expect(() => assertSlug("../../etc/passwd")).toThrow();
    expect(() => assertSlug("ok")).not.toThrow();
  });
});

describe("path mapping", () => {
  it("maps a slug to its markdown file", () => {
    expect(contentPath(cfg, "posts", "fstab-problem")).toBe("/site/content/posts/fstab-problem.md");
  });

  it("maps a slug to its static image directory", () => {
    expect(imageDir(cfg, "posts", "fstab-problem")).toBe("/site/static/posts/fstab-problem");
  });

  it("builds the URL Hugo will serve the image at", () => {
    expect(imageUrl("posts", "fstab-problem", "ro.png")).toBe("/posts/fstab-problem/ro.png");
    expect(imageUrlPrefix("notes", "pty")).toBe("/notes/pty/");
  });

  it("round-trips a content path back to section and slug", () => {
    expect(parseContentPath(cfg, "/site/content/notes/pty.md")).toEqual({ section: "notes", slug: "pty" });
    expect(parseContentPath(cfg, "/site/content/posts/first.md")).toEqual({ section: "posts", slug: "first" });
  });

  it("refuses paths that are not editable content", () => {
    for (const p of [
      "/site/content/notes/_index.md",   // section page, not a note
      "/site/content/about.md",          // top-level page, no section
      "/site/content/posts/draft.txt",   // not markdown
      "/site/static/posts/x/1.png",      // not content at all
      "/elsewhere/content/posts/x.md",   // outside the site
    ]) {
      expect(parseContentPath(cfg, p), p).toBeNull();
    }
  });
});
