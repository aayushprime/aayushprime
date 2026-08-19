import { isAbsolute, join, relative, sep } from "node:path";
import { isSectionName, type SectionName, type SiteConfig } from "../config.ts";

/**
 * The shape a filename must have to be an editable page.
 *
 * Deliberately the same pattern the notes graph uses for bare-token link
 * destinations (`^[a-z0-9][a-z0-9-]*$` in layouts/_markup/render-link.html),
 * so every note the editor can create is also a note another note can link
 * to. It doubles as the guard against path traversal: no dots, no separators.
 */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export function assertSlug(slug: string): void {
  if (!isValidSlug(slug)) {
    throw new Error(
      `invalid slug ${JSON.stringify(slug)}: expected lowercase letters, digits and hyphens`,
    );
  }
}

/** `<root>/content/<section>/<slug>.md` */
export function contentPath(cfg: SiteConfig, section: SectionName, slug: string): string {
  assertSlug(slug);
  return join(cfg.contentDir, section, `${slug}.md`);
}

/** `<root>/static/<section>/<slug>` — where this page's images live. */
export function imageDir(cfg: SiteConfig, section: SectionName, slug: string): string {
  assertSlug(slug);
  return join(cfg.staticDir, section, slug);
}

/** The URL Hugo serves an image at, which is what goes in the markdown. */
export function imageUrl(section: SectionName, slug: string, filename: string): string {
  return `/${section}/${slug}/${filename}`;
}

export function imageUrlPrefix(section: SectionName, slug: string): string {
  return `/${section}/${slug}/`;
}

/** The inverse of contentPath. Null for anything that is not an editable page. */
export function parseContentPath(
  cfg: SiteConfig,
  absPath: string,
): { section: SectionName; slug: string } | null {
  const rel = relative(cfg.contentDir, absPath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;

  const parts = rel.split(sep);
  if (parts.length !== 2) return null;

  const [section, file] = parts as [string, string];
  if (!isSectionName(section) || !file.endsWith(".md")) return null;

  // Excludes _index.md, which is a section page rather than a page.
  const slug = file.slice(0, -".md".length);
  if (!isValidSlug(slug)) return null;

  return { section, slug };
}
