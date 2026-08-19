import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { PageSummary, SectionDef } from "../lib/types.ts";

/** Text between an unclosed `[[` and the cursor. */
const OPEN_WIKILINK = /\[\[([^\[\]|]*)$/;

/**
 * Completion for `[[`.
 *
 * Only pages in graph-participating sections are offered, because those are
 * the only ones a wikilink can actually resolve to — the site renders a
 * reference to anything else as a broken span. Matching is on title as well as
 * slug, since the title is what you remember and the slug is what gets
 * written.
 */
export function wikilinkCompletion(
  getPages: () => PageSummary[],
  getSections: () => SectionDef[],
): Extension {
  const source = (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(OPEN_WIKILINK);
    if (!before) return null;

    const typed = before.text.slice(2).toLowerCase();
    if (typed === "" && !context.explicit && before.from === before.to - 2) {
      // Just typed the second bracket: offer everything.
    }

    const linkable = new Set(
      getSections()
        .filter((s) => s.inGraph)
        .map((s) => s.name),
    );

    // The cursor may already sit before a closing `]]` the editor auto-inserted.
    const after = context.state.sliceDoc(context.pos, context.pos + 2);
    const closing = after === "]]" ? "" : "]]";

    const options: Completion[] = getPages()
      .filter((page) => linkable.has(page.section))
      .filter(
        (page) =>
          typed === "" ||
          page.slug.includes(typed) ||
          page.title.toLowerCase().includes(typed),
      )
      .map((page) => ({
        label: page.slug,
        detail: page.title,
        type: "class",
        apply: page.slug + closing,
      }));

    if (options.length === 0) return null;

    return {
      from: before.from + 2,
      options,
      validFor: /^[^\[\]|]*$/,
    };
  };

  return autocompletion({
    override: [source],
    activateOnTyping: true,
    icons: false,
  });
}
