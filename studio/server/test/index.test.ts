import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { ContentIndex } from "../src/content/index.ts";
import { makeSite, page, type Fixture } from "./fixture.ts";

let fx: Fixture;
afterEach(() => fx?.cleanup());

async function indexOf(files: Record<string, string>) {
  fx = makeSite(files);
  const index = new ContentIndex(fx.cfg);
  await index.scan();
  return index;
}

describe("scanning", () => {
  it("reads pages from every configured section", async () => {
    const index = await indexOf({
      "content/posts/first.md": page({ title: "First" }),
      "content/notes/pty.md": page({ title: "Pty" }),
    });
    expect(index.list().map((e) => `${e.section}/${e.slug}`).sort()).toEqual([
      "notes/pty",
      "posts/first",
    ]);
  });

  it("skips section pages and non-markdown files", async () => {
    const index = await indexOf({
      "content/notes/_index.md": page({ title: "Notes" }),
      "content/notes/real.md": page({ title: "Real" }),
      "content/notes/notes.txt": "not markdown",
    });
    expect(index.list().map((e) => e.slug)).toEqual(["real"]);
  });

  it("captures frontmatter fields", async () => {
    const index = await indexOf({
      "content/posts/x.md": page({ title: "Title Here", draft: true, tags: ["go", "db"] }),
    });
    const entry = index.get("posts", "x")!;
    expect(entry.title).toBe("Title Here");
    expect(entry.draft).toBe(true);
    expect(entry.tags).toEqual(["go", "db"]);
    expect(entry.date).toBe("2026-01-01T00:00:00+0545");
  });

  it("falls back to the slug when a page has no title", async () => {
    const index = await indexOf({ "content/notes/no-title.md": "---\ndraft: false\n---\n\nbody\n" });
    expect(index.get("notes", "no-title")!.title).toBe("no-title");
  });

  it("survives a file whose frontmatter is malformed", async () => {
    const index = await indexOf({
      "content/notes/broken.md": "---\ntitle: [unclosed\n---\n\nbody\n",
      "content/notes/fine.md": page({ title: "Fine" }),
    });
    expect(index.list().map((e) => e.slug).sort()).toEqual(["broken", "fine"]);
    expect(index.get("notes", "broken")!.title).toBe("broken");
  });
});

describe("queries", () => {
  const site = {
    "content/posts/alpha.md": page({ title: "Alpha", tags: ["go"], draft: true }),
    "content/posts/beta.md": page({ title: "Beta", tags: ["go", "db"] }),
    "content/notes/gamma.md": page({ title: "Gamma", tags: ["db"], body: "see [[delta]]\n" }),
    "content/notes/delta.md": page({ title: "Delta", tags: [], body: "see [[gamma]] and [[ghost]]\n" }),
  };

  it("filters by section", async () => {
    const index = await indexOf(site);
    expect(index.list({ section: "notes" }).map((e) => e.slug).sort()).toEqual(["delta", "gamma"]);
  });

  it("filters by draft state", async () => {
    const index = await indexOf(site);
    expect(index.list({ draft: true }).map((e) => e.slug)).toEqual(["alpha"]);
  });

  it("filters by tag", async () => {
    const index = await indexOf(site);
    expect(index.list({ tag: "go" }).map((e) => e.slug).sort()).toEqual(["alpha", "beta"]);
  });

  it("counts tags across sections", async () => {
    const index = await indexOf(site);
    const counts = Object.fromEntries(index.tagCounts().map((t) => [t.tag, t.count]));
    expect(counts).toEqual({ go: 2, db: 2 });
  });

  it("searches title, slug and body", async () => {
    const index = await indexOf(site);
    expect(index.search("alph").map((e) => e.slug)).toEqual(["alpha"]);
    expect(index.search("ghost").map((e) => e.slug)).toEqual(["delta"]);
  });

  it("sorts newest first by default", async () => {
    const index = await indexOf({
      "content/posts/old.md": page({ title: "Old", date: "2020-01-01T00:00:00+0545" }),
      "content/posts/new.md": page({ title: "New", date: "2026-06-01T00:00:00+0545" }),
    });
    expect(index.list().map((e) => e.slug)).toEqual(["new", "old"]);
  });
});

describe("graph", () => {
  const site = {
    "content/notes/gamma.md": page({ title: "Gamma", body: "see [[delta]]\n" }),
    "content/notes/delta.md": page({ title: "Delta", body: "see [[gamma]] and [[ghost]]\n" }),
    "content/posts/blog.md": page({ title: "Blog", body: "see [[gamma]]\n" }),
  };

  it("resolves outbound links between notes", async () => {
    const index = await indexOf(site);
    expect(index.outboundLinks("notes", "gamma")).toEqual(["delta"]);
  });

  it("reports unresolved targets as broken rather than dropping them", async () => {
    const index = await indexOf(site);
    expect(index.brokenLinks("notes", "delta")).toEqual(["ghost"]);
  });

  it("gives backlinks for a note", async () => {
    const index = await indexOf(site);
    expect(index.backlinks("delta").map((e) => e.slug)).toEqual(["gamma"]);
  });

  it("does not let a post into the note graph", async () => {
    // topology.html only ranges over content/notes, so a wikilink in a blog
    // post is not an edge and must not appear as a backlink.
    const index = await indexOf(site);
    expect(index.backlinks("gamma").map((e) => e.slug)).toEqual(["delta"]);
  });
});

/**
 * fsevents on macOS drops a small percentage of notifications, so the index
 * also reconciles against the filesystem on a timer. These tests run that
 * timer fast, and allow well past it: a dropped event costs one reconcile
 * interval, and vitest's own per-test timeout (5s by default) has to be
 * raised alongside waitFor's or it fires first.
 */
const RECONCILE_MS = 150;
const WATCH_TIMEOUT = 20_000;

describe("watching", () => {
  it("picks up a file created after the initial scan", async () => {
    fx = makeSite({ "content/notes/a.md": page({ title: "A" }) });
    const index = new ContentIndex(fx.cfg);
    await index.scan();
    const changes: string[] = [];
    await index.watch((e) => changes.push(`${e.kind}:${e.slug}`), { reconcileMs: RECONCILE_MS });

    try {
      fx.write("content/notes/b.md", page({ title: "B" }));
      await vi.waitFor(() => expect(index.get("notes", "b")).toBeDefined(), { timeout: WATCH_TIMEOUT });
      expect(changes.some((c) => c === "add:b")).toBe(true);
    } finally {
      await index.close();
    }
  }, WATCH_TIMEOUT);

  it("marks the editor's own writes as internal", async () => {
    fx = makeSite({ "content/notes/a.md": page({ title: "A" }) });
    const index = new ContentIndex(fx.cfg);
    await index.scan();
    const events: { slug: string; external: boolean }[] = [];
    await index.watch((e) => events.push({ slug: e.slug, external: e.external }), { reconcileMs: RECONCILE_MS });

    try {
      index.markSelfWrite(join(fx.root, "content/notes/a.md"));
      fx.write("content/notes/a.md", page({ title: "A edited" }));
      await vi.waitFor(() => expect(index.get("notes", "a")!.title).toBe("A edited"), {
        timeout: WATCH_TIMEOUT,
      });
      expect(events.every((e) => !e.external)).toBe(true);
    } finally {
      await index.close();
    }
  }, WATCH_TIMEOUT);

  it("drops a deleted file from the index", async () => {
    fx = makeSite({
      "content/notes/a.md": page({ title: "A" }),
      "content/notes/b.md": page({ title: "B" }),
    });
    const index = new ContentIndex(fx.cfg);
    await index.scan();
    await index.watch(() => {}, { reconcileMs: RECONCILE_MS });

    try {
      rmSync(join(fx.root, "content/notes/b.md"));
      await vi.waitFor(() => expect(index.get("notes", "b")).toBeUndefined(), { timeout: WATCH_TIMEOUT });
    } finally {
      await index.close();
    }
  }, WATCH_TIMEOUT);
});

describe("reconcile", () => {
  it("picks up a change the watcher never reported", async () => {
    // Written with no watcher running at all, which is what a dropped
    // fsevents notification looks like from the index's point of view.
    fx = makeSite({ "content/notes/a.md": page({ title: "A" }) });
    const index = new ContentIndex(fx.cfg);
    await index.scan();

    fx.write("content/notes/ghost.md", page({ title: "Ghost" }));
    expect(index.get("notes", "ghost")).toBeUndefined();

    const seen: string[] = [];
    await index.reconcile((e) => seen.push(`${e.kind}:${e.slug}`));

    expect(index.get("notes", "ghost")!.title).toBe("Ghost");
    expect(seen).toContain("add:ghost");
  });

  it("notices a file that disappeared", async () => {
    fx = makeSite({
      "content/notes/a.md": page({ title: "A" }),
      "content/notes/b.md": page({ title: "B" }),
    });
    const index = new ContentIndex(fx.cfg);
    await index.scan();

    rmSync(join(fx.root, "content/notes/b.md"));
    const seen: string[] = [];
    await index.reconcile((e) => seen.push(`${e.kind}:${e.slug}`));

    expect(index.get("notes", "b")).toBeUndefined();
    expect(seen).toContain("unlink:b");
  });

  it("stays quiet when the editor's own write already updated the index", async () => {
    fx = makeSite({ "content/notes/a.md": page({ title: "A" }) });
    const index = new ContentIndex(fx.cfg);
    await index.scan();

    const seen: string[] = [];
    await index.reconcile((e) => seen.push(`${e.kind}:${e.slug}`));

    expect(seen).toEqual([]);
  });
});
