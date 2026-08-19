import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { sectionDef, type SectionName, type SiteConfig } from "../config.ts";
import { extractTargets, resolveTargets } from "./links.ts";
import { getField, parseFile } from "./parse.ts";
import { parseContentPath } from "./paths.ts";

export type ContentEntry = {
  section: SectionName;
  slug: string;
  path: string;
  title: string;
  date: string | null;
  draft: boolean;
  tags: string[];
  /**
   * Link targets as written, before resolution. Resolving needs the full set
   * of known slugs, so it is done at query time rather than stored — that way
   * adding or deleting a note cannot leave stale edges behind on its
   * neighbours.
   */
  targets: string[];
  body: string;
  mtime: number;
};

export type ChangeEvent = {
  kind: "add" | "change" | "unlink";
  section: SectionName;
  slug: string;
  /** False when the change came from the editor's own write. */
  external: boolean;
};

export type ListFilter = {
  section?: SectionName;
  tag?: string;
  draft?: boolean;
  query?: string;
};

export type TagCount = { tag: string; count: number; sections: SectionName[] };

/** How long a path stays attributed to the editor after it writes to it. */
const SELF_WRITE_WINDOW_MS = 2_000;

/**
 * How often the index is checked against the filesystem.
 *
 * fsevents on macOS drops the occasional notification — measurably, a few
 * percent of creations right after a watcher starts — and a missed one would
 * otherwise mean a file created outside the editor never appears until
 * restart. Re-listing two directories is cheap enough to do on a timer, so a
 * missed event costs a few seconds of staleness instead of being permanent.
 */
const RECONCILE_MS = 3_000;

export class ContentIndex {
  private entries = new Map<string, ContentEntry>();
  private selfWrites = new Map<string, number>();
  private watcher: FSWatcher | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(private cfg: SiteConfig) {}

  private static key(section: SectionName, slug: string): string {
    return `${section}/${slug}`;
  }

  async scan(): Promise<void> {
    this.entries.clear();
    for (const section of this.cfg.sections) {
      const dir = join(this.cfg.contentDir, section.name);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue; // A section with no directory yet is simply empty.
      }
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        await this.refreshPath(join(dir, file));
      }
    }
  }

  /** Re-read one file into the index. Returns null if it is not an editable page. */
  async refreshPath(absPath: string): Promise<ContentEntry | null> {
    const loc = parseContentPath(this.cfg, absPath);
    if (!loc) return null;

    let text: string;
    let mtime: number;
    try {
      [text, mtime] = await Promise.all([
        readFile(absPath, "utf8"),
        stat(absPath).then((s) => s.mtimeMs),
      ]);
    } catch {
      this.entries.delete(ContentIndex.key(loc.section, loc.slug));
      return null;
    }

    const def = sectionDef(this.cfg, loc.section);
    const parsed = parseFile(text);
    const doc = parsed.doc;

    // A file with unparseable frontmatter still belongs in the list — hiding
    // it would make the one file you need to go fix invisible.
    const entry: ContentEntry = {
      section: loc.section,
      slug: loc.slug,
      path: absPath,
      title: asString(doc && getField(doc, "title")) ?? loc.slug,
      date: asDate(doc && getField(doc, "date")),
      draft: asBoolean(doc && getField(doc, "draft")),
      tags: asTags(doc && getField(doc, "tags")),
      targets: extractTargets(parsed.body, { bareTokens: def?.resolvesBareLinks ?? false }),
      body: parsed.body,
      mtime,
    };

    this.entries.set(ContentIndex.key(loc.section, loc.slug), entry);
    return entry;
  }

  get(section: SectionName, slug: string): ContentEntry | undefined {
    return this.entries.get(ContentIndex.key(section, slug));
  }

  all(): ContentEntry[] {
    return [...this.entries.values()];
  }

  list(filter: ListFilter = {}): ContentEntry[] {
    let out = this.all();

    if (filter.section) out = out.filter((e) => e.section === filter.section);
    if (filter.draft !== undefined) out = out.filter((e) => e.draft === filter.draft);
    if (filter.tag) out = out.filter((e) => e.tags.includes(filter.tag!));
    if (filter.query) out = matches(out, filter.query);

    return out.sort(newestFirst);
  }

  search(query: string): ContentEntry[] {
    return matches(this.all(), query).sort(newestFirst);
  }

  tagCounts(): TagCount[] {
    const byTag = new Map<string, { count: number; sections: Set<SectionName> }>();

    for (const entry of this.all()) {
      for (const tag of entry.tags) {
        const seen = byTag.get(tag) ?? { count: 0, sections: new Set<SectionName>() };
        seen.count += 1;
        seen.sections.add(entry.section);
        byTag.set(tag, seen);
      }
    }

    return [...byTag.entries()]
      .map(([tag, v]) => ({ tag, count: v.count, sections: [...v.sections] }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  /** Slugs of pages that are nodes in the notes graph. */
  private graphSlugs(): Set<string> {
    return new Set(
      this.all()
        .filter((e) => sectionDef(this.cfg, e.section)?.inGraph)
        .map((e) => e.slug),
    );
  }

  private resolveFor(entry: ContentEntry) {
    if (!sectionDef(this.cfg, entry.section)?.inGraph) {
      // Matches the site: topology.html only ranges over content/notes, so a
      // wikilink written in a blog post is not an edge and is not a warning.
      return { resolved: [], broken: [] };
    }
    return resolveTargets(entry.targets, this.graphSlugs(), entry.slug);
  }

  outboundLinks(section: SectionName, slug: string): string[] {
    const entry = this.get(section, slug);
    return entry ? this.resolveFor(entry).resolved : [];
  }

  brokenLinks(section: SectionName, slug: string): string[] {
    const entry = this.get(section, slug);
    return entry ? this.resolveFor(entry).broken : [];
  }

  backlinks(slug: string): ContentEntry[] {
    return this.all()
      .filter((e) => sectionDef(this.cfg, e.section)?.inGraph)
      .filter((e) => e.slug !== slug && this.resolveFor(e).resolved.includes(slug))
      .sort(newestFirst);
  }

  /** Every broken reference in the site, for the editor to surface. */
  allBrokenLinks(): { section: SectionName; slug: string; target: string }[] {
    const out: { section: SectionName; slug: string; target: string }[] = [];
    for (const entry of this.all()) {
      for (const target of this.resolveFor(entry).broken) {
        out.push({ section: entry.section, slug: entry.slug, target });
      }
    }
    return out;
  }

  /**
   * Tell the index that the next change to this path is ours. The index still
   * re-reads the file — disk stays the source of truth — but the change is
   * reported as internal so the client does not warn about an external edit
   * to a file it just saved itself.
   */
  markSelfWrite(absPath: string): void {
    this.selfWrites.set(absPath, Date.now());
  }

  private claimSelfWrite(absPath: string): boolean {
    const at = this.selfWrites.get(absPath);
    if (at === undefined) return false;
    this.selfWrites.delete(absPath);
    return Date.now() - at < SELF_WRITE_WINDOW_MS;
  }

  /**
   * Bring the index back in line with the filesystem, reporting anything the
   * watcher failed to deliver. A write the editor made itself has already
   * updated the entry, so its mtime matches and nothing is emitted.
   */
  async reconcile(onChange: (event: ChangeEvent) => void = () => {}): Promise<void> {
    const present = new Set<string>();

    for (const section of this.cfg.sections) {
      const dir = join(this.cfg.contentDir, section.name);

      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".md")) continue;

        const absPath = join(dir, file);
        const loc = parseContentPath(this.cfg, absPath);
        if (!loc) continue;

        const key = ContentIndex.key(loc.section, loc.slug);
        present.add(key);

        const known = this.entries.get(key);
        const stats = await stat(absPath).catch(() => null);
        if (!stats) continue;
        if (known && known.mtime === stats.mtimeMs) continue;

        await this.refreshPath(absPath);
        onChange({
          kind: known ? "change" : "add",
          section: loc.section,
          slug: loc.slug,
          external: true,
        });
      }
    }

    for (const [key, entry] of [...this.entries]) {
      if (present.has(key)) continue;
      this.entries.delete(key);
      onChange({ kind: "unlink", section: entry.section, slug: entry.slug, external: true });
    }
  }

  async watch(
    onChange: (event: ChangeEvent) => void,
    opts: { reconcileMs?: number } = {},
  ): Promise<void> {
    this.watcher = chokidar.watch(this.cfg.contentDir, {
      ignoreInitial: true,
      // Editors and our own temp-file renames can produce a burst of events;
      // wait for the size to settle before reading.
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    });

    const handle = (kind: ChangeEvent["kind"]) => async (absPath: string) => {
      if (!absPath.endsWith(".md")) return;
      const loc = parseContentPath(this.cfg, absPath);
      if (!loc) return;

      const external = !this.claimSelfWrite(absPath);

      if (kind === "unlink") this.entries.delete(ContentIndex.key(loc.section, loc.slug));
      else await this.refreshPath(absPath);

      onChange({ kind, section: loc.section, slug: loc.slug, external });
    };

    this.watcher.on("add", handle("add"));
    this.watcher.on("change", handle("change"));
    this.watcher.on("unlink", handle("unlink"));

    await new Promise<void>((resolve) => this.watcher!.once("ready", () => resolve()));

    this.reconcileTimer = setInterval(() => {
      void this.reconcile(onChange);
    }, opts.reconcileMs ?? RECONCILE_MS);
    // A background sweep should never be the reason the process stays alive.
    this.reconcileTimer.unref();
  }

  async close(): Promise<void> {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    await this.watcher?.close();
    this.watcher = null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function asBoolean(v: unknown): boolean {
  return v === true;
}

function asDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" ? v : null;
}

function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t) => t !== null && t !== undefined).map(String);
}

function matches(entries: ContentEntry[], query: string): ContentEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return entries;
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.slug.includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      e.body.toLowerCase().includes(q),
  );
}

function newestFirst(a: ContentEntry, b: ContentEntry): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  return a.slug.localeCompare(b.slug);
}
