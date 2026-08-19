/**
 * Note-to-note link extraction.
 *
 * This is a port of layouts/_partials/graph/topology.html, and it has to stay
 * a port: the editor's backlinks panel is worse than useless if it disagrees
 * with the edges the site actually renders into /notes/graph.json. The regexes
 * below are the same ones, and links.test.ts asserts the two agree on the real
 * content.
 */

export type ExtractOpts = {
  /**
   * Whether bare-token `[label](slug)` destinations count as note references.
   * True only for notes: render-link.html scopes that hook to the notes
   * section so a bare destination in a blog post keeps its literal meaning.
   */
  bareTokens: boolean;
};

const WIKILINK = /\[\[\s*([^\[\]|]+?)\s*(?:\|[^\[\]]*?)?\]\]/g;
const BARE_TOKEN = /\[[^\]]*\]\(\s*([a-z0-9][a-z0-9-]*)\s*\)/g;

/**
 * Remove code before matching, so a link written inside a fence or an inline
 * span does not become a phantom edge. Notes about markdown syntax are exactly
 * the ones most likely to contain `[[example]]` as a sample rather than a link.
 */
export function stripCode(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
}

/** Link targets in first-seen order, lowercased and deduped. */
export function extractTargets(raw: string, opts: ExtractOpts): string[] {
  const text = stripCode(raw);
  const seen = new Set<string>();
  const targets: string[] = [];

  const push = (value: string) => {
    const slug = value.toLowerCase();
    if (seen.has(slug)) return;
    seen.add(slug);
    targets.push(slug);
  };

  for (const m of text.matchAll(WIKILINK)) push(m[1]!);
  if (opts.bareTokens) for (const m of text.matchAll(BARE_TOKEN)) push(m[1]!);

  return targets;
}

/**
 * Split targets into those that name a real page and those that do not.
 * A self-link is neither: it is dropped, matching the graph, which would
 * otherwise draw every such note a loop.
 */
export function resolveTargets(
  targets: string[],
  known: Set<string>,
  from: string,
): { resolved: string[]; broken: string[] } {
  const resolved: string[] = [];
  const broken: string[] = [];

  for (const target of targets) {
    if (target === from) continue;
    if (known.has(target)) resolved.push(target);
    else broken.push(target);
  }

  return { resolved, broken };
}

export function buildBacklinks(outgoing: Map<string, string[]>): Map<string, string[]> {
  const backlinks = new Map<string, string[]>();

  for (const [from, targets] of outgoing) {
    for (const target of targets) {
      const existing = backlinks.get(target);
      if (existing) existing.push(from);
      else backlinks.set(target, [from]);
    }
  }

  return backlinks;
}

/** Fences first, so a backtick inside a fenced block cannot start an inline span. */
const CODE_SEGMENT = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g;

/**
 * Apply a transform to the prose in `text`, leaving code untouched.
 *
 * Rewriting links on rename has to skip code for the same reason extraction
 * does: a note explaining wikilink syntax contains `[[example]]` as a sample,
 * and silently editing someone's code block is a corruption.
 */
export function mapOutsideCode(text: string, fn: (prose: string) => string): string {
  let out = "";
  let last = 0;

  for (const m of text.matchAll(CODE_SEGMENT)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }

  return out + fn(text.slice(last));
}

const WIKILINK_PARTS = /\[\[\s*([^\[\]|]+?)\s*(?:\|([^\[\]]*?))?\]\]/g;
const BARE_TOKEN_PARTS = /\[([^\]]*)\]\(\s*([a-z0-9][a-z0-9-]*)\s*\)/g;

/** Repoint every reference to `from` at `to`, preserving link labels. */
export function rewriteLinkTarget(
  text: string,
  from: string,
  to: string,
  opts: ExtractOpts,
): string {
  const target = from.toLowerCase();

  return mapOutsideCode(text, (prose) => {
    let out = prose.replace(WIKILINK_PARTS, (full, raw: string, label?: string) =>
      raw.trim().toLowerCase() === target
        ? label === undefined
          ? `[[${to}]]`
          : `[[${to}|${label}]]`
        : full,
    );

    if (opts.bareTokens) {
      out = out.replace(BARE_TOKEN_PARTS, (full, label: string, dest: string) =>
        dest.toLowerCase() === target ? `[${label}](${to})` : full,
      );
    }

    return out;
  });
}
