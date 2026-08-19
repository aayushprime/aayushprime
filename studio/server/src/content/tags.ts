import { readFile } from "node:fs/promises";
import type { SiteConfig } from "../config.ts";
import type { ContentIndex } from "./index.ts";
import { writeFileAtomic } from "./io.ts";
import { parseFile, serializeFile, setField } from "./parse.ts";

export type TagEdit = {
  /** `section/slug` for each page rewritten. */
  changed: string[];
  /** Pages carrying the tag that could not be rewritten, with the reason. */
  skipped: { page: string; reason: string }[];
};

/**
 * Apply a transform to the tag list of every page carrying `tag`.
 *
 * Tags are graph nodes as well as taxonomy terms, so an edit here reshapes
 * /notes/graph.json. A file whose frontmatter does not parse is reported
 * rather than guessed at — rewriting YAML we could not read is how content
 * gets destroyed.
 */
async function editTagged(
  index: ContentIndex,
  tag: string,
  transform: (tags: string[]) => string[],
): Promise<TagEdit> {
  const result: TagEdit = { changed: [], skipped: [] };

  for (const entry of index.all()) {
    if (!entry.tags.includes(tag)) continue;
    const page = `${entry.section}/${entry.slug}`;

    const parsed = parseFile(await readFile(entry.path, "utf8"));
    if (!parsed.doc || parsed.errors.length > 0) {
      result.skipped.push({ page, reason: parsed.errors[0] ?? "no frontmatter block" });
      continue;
    }

    setField(parsed.doc, "tags", dedupe(transform(entry.tags)));

    index.markSelfWrite(entry.path);
    await writeFileAtomic(entry.path, serializeFile(parsed));
    result.changed.push(page);
  }

  await index.scan();
  return result;
}

export async function renameTag(
  _cfg: SiteConfig,
  index: ContentIndex,
  opts: { from: string; to: string },
): Promise<TagEdit> {
  const to = opts.to.trim();
  if (to === "") throw new Error("a tag needs a name");

  // Renaming onto a tag that already exists is a merge; dedupe absorbs it.
  return editTagged(index, opts.from, (tags) => tags.map((t) => (t === opts.from ? to : t)));
}

export async function removeTag(
  _cfg: SiteConfig,
  index: ContentIndex,
  tag: string,
): Promise<TagEdit> {
  return editTagged(index, tag, (tags) => tags.filter((t) => t !== tag));
}

function dedupe(tags: string[]): string[] {
  return [...new Set(tags)];
}
