import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { saveImage, listImages, removeImage } from "../src/content/images.ts";
import { makeSite, type Fixture } from "./fixture.ts";

let fx: Fixture;
afterEach(() => fx?.cleanup());

const bytes = (s: string) => Buffer.from(s);

describe("saveImage", () => {
  it("writes into the section's static directory and returns the URL Hugo serves", async () => {
    fx = makeSite();
    const r = await saveImage(fx.cfg, {
      section: "posts",
      slug: "my-post",
      filename: "diagram.png",
      data: bytes("a"),
    });

    expect(r.url).toBe("/posts/my-post/diagram.png");
    expect(r.markdown).toBe("![](/posts/my-post/diagram.png)");
    expect(readFileSync(join(fx.root, "static/posts/my-post/diagram.png"), "utf8")).toBe("a");
  });

  it("creates the directory for a page that has no images yet", async () => {
    fx = makeSite();
    await saveImage(fx.cfg, { section: "notes", slug: "fresh", filename: "a.png", data: bytes("x") });
    expect(existsSync(join(fx.root, "static/notes/fresh/a.png"))).toBe(true);
  });

  it("numbers a clipboard paste sequentially, matching the existing convention", async () => {
    fx = makeSite();
    const opts = { section: "posts", slug: "p", data: bytes("x"), mimeType: "image/png" } as const;

    expect((await saveImage(fx.cfg, opts)).url).toBe("/posts/p/1.png");
    expect((await saveImage(fx.cfg, opts)).url).toBe("/posts/p/2.png");
    expect((await saveImage(fx.cfg, opts)).url).toBe("/posts/p/3.png");
  });

  it("continues numbering past images that already exist", async () => {
    fx = makeSite();
    mkdirSync(join(fx.root, "static/posts/p"), { recursive: true });
    for (const n of [1, 2, 7]) writeFileSync(join(fx.root, `static/posts/p/${n}.png`), "x");

    const r = await saveImage(fx.cfg, { section: "posts", slug: "p", data: bytes("x"), mimeType: "image/png" });
    expect(r.url).toBe("/posts/p/8.png");
  });

  it("suffixes rather than overwriting when a name is taken", async () => {
    fx = makeSite();
    const opts = { section: "posts", slug: "p", filename: "shot.png", data: bytes("first") } as const;
    expect((await saveImage(fx.cfg, opts)).url).toBe("/posts/p/shot.png");
    expect((await saveImage(fx.cfg, { ...opts, data: bytes("second") })).url).toBe("/posts/p/shot-2.png");
    expect(readFileSync(join(fx.root, "static/posts/p/shot.png"), "utf8")).toBe("first");
  });

  it("keeps spaces and case, which existing filenames rely on", async () => {
    fx = makeSite();
    const r = await saveImage(fx.cfg, {
      section: "posts",
      slug: "p",
      filename: "{TMUX} Snippets.png",
      data: bytes("x"),
    });
    expect(r.url).toBe("/posts/p/{TMUX} Snippets.png");
  });

  it("strips any path from an incoming filename", async () => {
    fx = makeSite();
    const r = await saveImage(fx.cfg, {
      section: "posts",
      slug: "p",
      filename: "../../../etc/passwd.png",
      data: bytes("x"),
    });
    expect(r.url).toBe("/posts/p/passwd.png");
    expect(existsSync(join(fx.root, "static/posts/p/passwd.png"))).toBe(true);
  });

  it("picks the extension from the mime type when the paste has no filename", async () => {
    fx = makeSite();
    const r = await saveImage(fx.cfg, { section: "posts", slug: "p", data: bytes("x"), mimeType: "image/jpeg" });
    expect(r.url).toBe("/posts/p/1.jpg");
  });

  it("rejects a slug that would escape the static directory", async () => {
    fx = makeSite();
    await expect(
      saveImage(fx.cfg, { section: "posts", slug: "../../evil", filename: "a.png", data: bytes("x") }),
    ).rejects.toThrow();
  });
});

describe("listImages and removeImage", () => {
  it("lists a page's images alphabetically", async () => {
    fx = makeSite();
    await saveImage(fx.cfg, { section: "posts", slug: "p", filename: "b.png", data: bytes("x") });
    await saveImage(fx.cfg, { section: "posts", slug: "p", filename: "a.png", data: bytes("x") });

    expect((await listImages(fx.cfg, "posts", "p")).map((i) => i.filename)).toEqual(["a.png", "b.png"]);
  });

  it("returns nothing for a page with no image directory", async () => {
    fx = makeSite();
    expect(await listImages(fx.cfg, "notes", "none")).toEqual([]);
  });

  it("deletes a single image", async () => {
    fx = makeSite();
    await saveImage(fx.cfg, { section: "posts", slug: "p", filename: "a.png", data: bytes("x") });
    await removeImage(fx.cfg, "posts", "p", "a.png");
    expect(existsSync(join(fx.root, "static/posts/p/a.png"))).toBe(false);
  });

  it("refuses to delete outside the page's image directory", async () => {
    fx = makeSite();
    writeFileSync(join(fx.root, "static/secret.txt"), "x");
    await expect(removeImage(fx.cfg, "posts", "p", "../../secret.txt")).rejects.toThrow();
    expect(existsSync(join(fx.root, "static/secret.txt"))).toBe(true);
  });
});
