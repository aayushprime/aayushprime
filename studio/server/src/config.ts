import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SectionName = "posts" | "notes";

export type FieldType = "text" | "date" | "boolean" | "tags" | "image";

/**
 * Where a field appears in the editor.
 *
 * The document header is deliberately thin — a title, a cover, and the two
 * facts you change most — so that nothing but the writing occupies the middle
 * of the screen. Everything else is either at the end of the page or behind a
 * disclosure.
 */
export type FieldSlot = "title" | "cover" | "meta" | "tags" | "more";

export type FieldDef = {
  /** Dotted path into the frontmatter map, e.g. "title" or "cover.image". */
  key: string;
  label: string;
  type: FieldType;
  slot: FieldSlot;
  /** Shown in the editor as help text. */
  hint?: string;
};

export type SectionDef = {
  name: SectionName;
  label: string;
  /** Archetype path, relative to the site root. */
  archetype: string;
  /**
   * Whether a bare-token destination — `[the pty note](pty)` — resolves to
   * another page in this section. Mirrors layouts/_markup/render-link.html,
   * which scopes the hook to notes deliberately so that a bare destination in
   * a blog post keeps its literal meaning.
   */
  resolvesBareLinks: boolean;
  /** Whether this section's pages are nodes in /notes/graph.json. */
  inGraph: boolean;
  fields: FieldDef[];
};

/**
 * Fields every section carries.
 *
 * Only what the site actually reads is offered. Frontmatter keys the theme no
 * longer looks at are left alone in files that already have them, but are not
 * surfaced as something to fill in.
 */
const COMMON_FIELDS: FieldDef[] = [
  { key: "title", label: "Title", type: "text", slot: "title" },
  { key: "date", label: "Date", type: "date", slot: "meta" },
  { key: "draft", label: "Draft", type: "boolean", slot: "meta" },
  { key: "tags", label: "Tags", type: "tags", slot: "tags" },
  {
    key: "searchHidden",
    label: "Hide from search",
    type: "boolean",
    slot: "more",
    hint: "Excludes the page from /index.json and llms.txt.",
  },
];

export const SECTIONS: SectionDef[] = [
  {
    name: "posts",
    label: "Blog",
    archetype: "archetypes/post.md",
    resolvesBareLinks: false,
    inGraph: false,
    fields: [
      ...COMMON_FIELDS,
      {
        key: "cover.image",
        label: "Cover",
        type: "image",
        slot: "cover",
        hint: "Shown on the article, on cards, and as the OpenGraph image.",
      },
      {
        key: "cover.alt",
        label: "Cover alt text",
        type: "text",
        slot: "more",
        hint: "Read out in place of the image.",
      },
      {
        key: "cover.caption",
        label: "Cover caption",
        type: "text",
        slot: "more",
        hint: "Rendered as markdown under the cover.",
      },
      {
        key: "cover.hidden",
        label: "Hide cover on the page",
        type: "boolean",
        slot: "more",
        hint: "Keeps it for cards and social previews, but not on the article itself.",
      },
      {
        key: "ShowToc",
        label: "Table of contents",
        type: "boolean",
        slot: "more",
        hint: "Renders the heading outline above the article.",
      },
      {
        key: "ShowBreadCrumbs",
        label: "Breadcrumbs",
        type: "boolean",
        slot: "more",
        hint: "Shows the Home / Blog trail above the title.",
      },
    ],
  },
  {
    name: "notes",
    label: "Notes",
    archetype: "archetypes/notes.md",
    resolvesBareLinks: true,
    inGraph: true,
    fields: COMMON_FIELDS,
  },
];

export type SiteConfig = {
  root: string;
  contentDir: string;
  staticDir: string;
  sections: SectionDef[];
};

export function isSectionName(v: string): v is SectionName {
  return SECTIONS.some((s) => s.name === v);
}

export function sectionDef(cfg: SiteConfig, name: string): SectionDef | undefined {
  return cfg.sections.find((s) => s.name === name);
}

/**
 * Resolve symlinks as well as relative segments.
 *
 * The file watcher reports real paths — on macOS a temp dir handed out as
 * /var/folders/… arrives back as /private/var/folders/… — and every path the
 * index holds is compared against this root. If the two disagree, changes are
 * computed as being outside the site and silently ignored.
 */
function canonical(path: string): string {
  const abs = resolve(path);
  try {
    return realpathSync(abs);
  } catch {
    return abs; // Not created yet; resolve() is the best available answer.
  }
}

/** studio/server/src → the site root three levels up. */
function defaultRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function loadConfig(root: string = process.env.STUDIO_SITE_ROOT ?? defaultRoot()): SiteConfig {
  const abs = canonical(root);
  return {
    root: abs,
    contentDir: resolve(abs, "content"),
    staticDir: resolve(abs, "static"),
    sections: SECTIONS,
  };
}

export const PORT = Number(process.env.STUDIO_PORT ?? 4000);
export const HUGO_PORT = Number(process.env.STUDIO_HUGO_PORT ?? 1313);

/** Records the running Hugo, so the next studio adopts it instead of rebuilding. */
export const PID_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../.hugo-studio.pid");

/** Hugo's stdout and stderr. Tailed for the build log the editor shows. */
export const LOG_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../.hugo.log");

/**
 * What Hugo binds to.
 *
 * Loopback by default, as Hugo's own default is. Set this to 0.0.0.0 to read
 * the site from a phone on the same network — the point of giving Hugo a
 * normal baseURL is that doing so actually works.
 */
export const HUGO_BIND = process.env.STUDIO_HUGO_BIND ?? "127.0.0.1";
