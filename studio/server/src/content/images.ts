import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { SectionName, SiteConfig } from "../config.ts";
import { pathExists, writeFileAtomic } from "./io.ts";
import { imageDir, imageUrl } from "./paths.ts";

export type SavedImage = { filename: string; url: string; markdown: string };
export type ImageInfo = { filename: string; url: string; bytes: number; mtime: number };

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * Reduce an incoming name to a bare filename.
 *
 * Deliberately permissive about the characters it keeps — the site already
 * has `{TMUX} Snippets.png` — and strict only about the ones that would let a
 * paste write outside the page's own directory.
 */
function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();

  if (cleaned === "" || cleaned === "." || cleaned === "..") {
    throw new Error(`unusable image filename ${JSON.stringify(raw)}`);
  }

  return cleaned;
}

/** `1.png`, `2.png`, … continuing past whatever the directory already holds. */
async function nextSequentialName(dir: string, ext: string): Promise<string> {
  let highest = 0;

  try {
    for (const name of await readdir(dir)) {
      const m = /^(\d+)\./.exec(name);
      if (m) highest = Math.max(highest, Number(m[1]));
    }
  } catch {
    // No directory yet, so numbering starts at 1.
  }

  return `${highest + 1}.${ext}`;
}

/** Append -2, -3 … rather than overwriting an image that is already there. */
async function uniqueName(dir: string, filename: string): Promise<string> {
  const ext = extname(filename);
  const stem = ext === "" ? filename : filename.slice(0, -ext.length);

  let candidate = filename;
  for (let n = 2; await pathExists(join(dir, candidate)); n++) {
    candidate = `${stem}-${n}${ext}`;
  }

  return candidate;
}

export async function saveImage(
  cfg: SiteConfig,
  opts: {
    section: SectionName;
    slug: string;
    data: Buffer;
    filename?: string | undefined;
    mimeType?: string | undefined;
  },
): Promise<SavedImage> {
  const dir = imageDir(cfg, opts.section, opts.slug);
  await mkdir(dir, { recursive: true });

  const requested = opts.filename
    ? sanitizeFilename(opts.filename)
    : await nextSequentialName(dir, EXTENSION_BY_MIME[opts.mimeType ?? ""] ?? "png");

  const filename = await uniqueName(dir, requested);
  await writeFileAtomic(join(dir, filename), opts.data);

  const url = imageUrl(opts.section, opts.slug, filename);
  return { filename, url, markdown: `![](${url})` };
}

export async function listImages(
  cfg: SiteConfig,
  section: SectionName,
  slug: string,
): Promise<ImageInfo[]> {
  const dir = imageDir(cfg, section, slug);

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const out: ImageInfo[] = [];

  for (const filename of names.sort()) {
    if (filename.startsWith(".")) continue;
    const s = await stat(join(dir, filename));
    if (!s.isFile()) continue;
    out.push({
      filename,
      url: imageUrl(section, slug, filename),
      bytes: s.size,
      mtime: s.mtimeMs,
    });
  }

  return out;
}

export async function removeImage(
  cfg: SiteConfig,
  section: SectionName,
  slug: string,
  filename: string,
): Promise<void> {
  const dir = imageDir(cfg, section, slug);

  // resolve() collapses any traversal inside `filename`; comparing against the
  // sanitized join is what catches a name that tried to climb out.
  const target = resolve(dir, filename);
  if (target !== join(dir, sanitizeFilename(filename))) {
    throw new Error(`refusing to delete outside ${section}/${slug}`);
  }

  await rm(target, { force: true });
}
