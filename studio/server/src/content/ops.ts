import { cp, readFile, rename, rm } from "node:fs/promises";
import { sectionDef, type SectionName, type SiteConfig } from "../config.ts";
import type { ContentIndex } from "./index.ts";
import { pathExists, transaction, writeFileAtomic } from "./io.ts";
import { rewriteLinkTarget } from "./links.ts";
import { deleteField, parseFile, serializeFile, setField } from "./parse.ts";
import { assertSlug, contentPath, imageDir, imageUrlPrefix } from "./paths.ts";

export type PageRef = { section: SectionName; slug: string };

/**
 * `2026-08-14T12:25:00+0545` — the shape every date already in content/ uses.
 */
export function hugoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);

  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Fill in the handful of Go template actions the site's archetypes actually
 * use. This is not a template engine — anything else is left alone so it is
 * visible in the editor rather than silently dropped.
 */
function renderArchetype(template: string, v: { title: string; date: string; slug: string }): string {
  return template
    .replace(/\{\{-?\s*replace\s+\.Name[^}]*\}\}/g, v.title)
    .replace(/\{\{-?\s*\.Date\s*-?\}\}/g, v.date)
    .replace(/\{\{-?\s*\.Title\s*-?\}\}/g, v.title)
    .replace(/\{\{-?\s*\.Name\s*-?\}\}/g, v.slug);
}

const FALLBACK_ARCHETYPE = '---\ntitle: "{{ .Title }}"\ndate: {{ .Date }}\ndraft: true\ntags: []\n---\n\n';

async function loadArchetype(cfg: SiteConfig, section: SectionName): Promise<string> {
  const def = sectionDef(cfg, section);
  if (!def) throw new Error(`unknown section ${section}`);
  try {
    return await readFile(`${cfg.root}/${def.archetype}`, "utf8");
  } catch {
    return FALLBACK_ARCHETYPE;
  }
}

async function assertFree(path: string, what: string): Promise<void> {
  if (await pathExists(path)) throw new Error(`${what} already exists`);
}

export async function createPage(
  cfg: SiteConfig,
  index: ContentIndex,
  opts: { section: SectionName; slug: string; title?: string; date?: string },
): Promise<PageRef> {
  assertSlug(opts.slug);
  const target = contentPath(cfg, opts.section, opts.slug);
  await assertFree(target, `${opts.section}/${opts.slug}`);

  const title = opts.title ?? titleFromSlug(opts.slug);
  const text = renderArchetype(await loadArchetype(cfg, opts.section), {
    title,
    date: opts.date ?? hugoDate(),
    slug: opts.slug,
  });

  index.markSelfWrite(target);
  await writeFileAtomic(target, text);
  await index.refreshPath(target);

  return { section: opts.section, slug: opts.slug };
}

/** Replace the body, leaving the frontmatter block byte-identical. */
export async function saveBody(
  cfg: SiteConfig,
  index: ContentIndex,
  opts: { section: SectionName; slug: string; body: string },
): Promise<void> {
  const path = contentPath(cfg, opts.section, opts.slug);
  const parsed = parseFile(await readFile(path, "utf8"));

  // One blank line between the closing fence and the prose, which is what the
  // editor shows and what every file in content/ already looks like.
  parsed.body = parsed.doc ? `\n${opts.body.replace(/^\n+/, "")}` : opts.body;

  index.markSelfWrite(path);
  await writeFileAtomic(path, serializeFile(parsed));
  await index.refreshPath(path);
}

export async function saveFields(
  cfg: SiteConfig,
  index: ContentIndex,
  opts: { section: SectionName; slug: string; fields: Record<string, unknown> },
): Promise<void> {
  const path = contentPath(cfg, opts.section, opts.slug);
  const parsed = parseFile(await readFile(path, "utf8"));

  if (!parsed.doc || parsed.errors.length > 0) {
    throw new Error(
      `cannot edit fields: frontmatter does not parse (${parsed.errors[0] ?? "no frontmatter block"})`,
    );
  }

  // JSON cannot carry `undefined`, so null is how the client asks for a key to
  // be removed — which is what clearing a cover has to do. Leaving an empty
  // `cover:` map behind would still satisfy the theme's `with .Params.cover`
  // and render an <img> with no src.
  for (const [key, value] of Object.entries(opts.fields)) {
    if (value === null) deleteField(parsed.doc, key);
    else setField(parsed.doc, key, value);
  }

  index.markSelfWrite(path);
  await writeFileAtomic(path, serializeFile(parsed));
  await index.refreshPath(path);
}

/** Repoint this page's own image URLs after its slug changes. */
function repointImages(text: string, section: SectionName, from: string, to: string): string {
  return text.split(imageUrlPrefix(section, from)).join(imageUrlPrefix(section, to));
}

export async function renamePage(
  cfg: SiteConfig,
  index: ContentIndex,
  opts: { section: SectionName; slug: string; newSlug: string },
): Promise<PageRef> {
  const { section, slug, newSlug } = opts;
  assertSlug(slug);
  assertSlug(newSlug);
  if (slug === newSlug) return { section, slug };

  const from = contentPath(cfg, section, slug);
  const to = contentPath(cfg, section, newSlug);
  const fromImages = imageDir(cfg, section, slug);
  const toImages = imageDir(cfg, section, newSlug);

  if (!(await pathExists(from))) throw new Error(`${section}/${slug} does not exist`);
  await assertFree(to, `${section}/${newSlug}`);
  await assertFree(toImages, `${section}/${newSlug} images`);

  const original = await readFile(from, "utf8");

  await transaction(async (step) => {
    if (await pathExists(fromImages)) {
      await step(
        () => rename(fromImages, toImages),
        () => rename(toImages, fromImages),
      );
    }

    await step(
      () => writeFileAtomic(to, repointImages(original, section, slug, newSlug)),
      () => rm(to, { force: true }),
    );

    await step(
      () => rm(from),
      () => writeFileAtomic(from, original),
    );
  });

  await rewriteInboundLinks(cfg, index, section, slug, newSlug);
  await index.scan();

  return { section, slug: newSlug };
}

/**
 * Repoint every note that referenced the old slug.
 *
 * Skipped entirely when the renamed page is not a graph node, and applied
 * only to sections that are: a `[[slug]]` in a blog post renders as literal
 * text, so rewriting it would change what the page says.
 */
async function rewriteInboundLinks(
  cfg: SiteConfig,
  index: ContentIndex,
  section: SectionName,
  from: string,
  to: string,
): Promise<void> {
  if (!sectionDef(cfg, section)?.inGraph) return;

  for (const entry of index.all()) {
    const def = sectionDef(cfg, entry.section);
    if (!def?.inGraph) continue;
    if (entry.section === section && entry.slug === from) continue;
    if (!entry.targets.includes(from)) continue;

    const text = await readFile(entry.path, "utf8");
    const rewritten = rewriteLinkTarget(text, from, to, { bareTokens: def.resolvesBareLinks });
    if (rewritten === text) continue;

    index.markSelfWrite(entry.path);
    await writeFileAtomic(entry.path, rewritten);
  }
}

export async function duplicatePage(
  cfg: SiteConfig,
  index: ContentIndex,
  opts: { section: SectionName; slug: string; newSlug: string; title?: string },
): Promise<PageRef> {
  const { section, slug, newSlug } = opts;
  assertSlug(slug);
  assertSlug(newSlug);

  const from = contentPath(cfg, section, slug);
  const to = contentPath(cfg, section, newSlug);
  if (!(await pathExists(from))) throw new Error(`${section}/${slug} does not exist`);
  await assertFree(to, `${section}/${newSlug}`);

  const parsed = parseFile(repointImages(await readFile(from, "utf8"), section, slug, newSlug));

  if (parsed.doc && parsed.errors.length === 0) {
    // A duplicate is a starting point, not a published page.
    setField(parsed.doc, "draft", true);
    setField(parsed.doc, "date", hugoDate());
    setField(parsed.doc, "title", opts.title ?? `${index.get(section, slug)?.title ?? newSlug} (copy)`);
  }

  await transaction(async (step) => {
    const fromImages = imageDir(cfg, section, slug);
    if (await pathExists(fromImages)) {
      const toImages = imageDir(cfg, section, newSlug);
      await step(
        () => cp(fromImages, toImages, { recursive: true }),
        () => rm(toImages, { recursive: true, force: true }),
      );
    }

    await step(
      () => writeFileAtomic(to, serializeFile(parsed)),
      () => rm(to, { force: true }),
    );
  });

  await index.scan();
  return { section, slug: newSlug };
}

export async function removePage(
  cfg: SiteConfig,
  index: ContentIndex,
  opts: { section: SectionName; slug: string },
): Promise<void> {
  const path = contentPath(cfg, opts.section, opts.slug);
  await rm(path, { force: true });
  await rm(imageDir(cfg, opts.section, opts.slug), { recursive: true, force: true });
  await index.scan();
}
