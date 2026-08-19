import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * Colours come from CSS custom properties defined in styles.css, so the theme
 * lives in one place rather than being split between a stylesheet and a
 * JavaScript object.
 */
/**
 * Type set to match the published article.
 *
 * The values come from assets/css/typeset.css `.typeset-article`: 1.0625rem at
 * 1.85 leading in dark mode, h1/h2/h3 at 1.75/1.25/1.125em with the same
 * letter-spacing, inline code at 0.85em and fenced code at 0.875em/1.5. The
 * column is 720px, which is what max-w-3xl minus px-6 gives the site. Writing
 * at a different size or measure than the page will be read at is the whole
 * thing this avoids.
 *
 * --text-scale multiplies the base; everything else is in em, so the whole
 * scale moves together.
 */
const editorTheme = EditorView.theme(
  {
    "&": {
      color: "var(--fg)",
      backgroundColor: "transparent",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-prose)",
      fontSize: "calc(1.0625rem * var(--text-scale, 1))",
      lineHeight: "1.85",
      padding: "0 0 45vh 0",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      maxWidth: "720px",
      margin: "0 auto",
      padding: "8px 0 24px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--selection)",
    },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-gutters": { display: "none" },

    // Rendered markdown. Spacing above a heading is padding, never margin:
    // CodeMirror maps screen coordinates to document positions using measured
    // line boxes, and a margin falls outside that box — with one, clicking a
    // heading lands the caret on the following line.
    ".cm-md-heading": {
      fontFamily: "var(--font-display)",
      fontWeight: "600",
      color: "var(--fg-bright)",
    },
    ".cm-md-h1": {
      fontSize: "1.75em",
      lineHeight: "1.25",
      letterSpacing: "-0.02em",
      paddingTop: "0.5em",
    },
    ".cm-md-h2": {
      fontSize: "1.25em",
      lineHeight: "1.3",
      letterSpacing: "-0.015em",
      paddingTop: "0.6em",
    },
    ".cm-md-h3": { fontSize: "1.125em", lineHeight: "1.35", paddingTop: "0.4em" },
    ".cm-md-h4": { fontSize: "1em", lineHeight: "1.4", paddingTop: "0.3em" },
    ".cm-md-h5": { fontSize: "1em" },
    ".cm-md-h6": { fontSize: "1em", color: "var(--fg-dim)" },

    ".cm-md-em": { fontStyle: "italic" },
    ".cm-md-strong": { fontWeight: "650", color: "var(--fg-bright)" },
    ".cm-md-strike": { textDecoration: "line-through", color: "var(--fg-dim)" },

    ".cm-md-code": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.85em",
      background: "var(--code-bg)",
      borderRadius: "0.35em",
      padding: "0.125em 0.3em",
    },
    ".cm-md-fence": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.875em",
      lineHeight: "1.5",
      background: "var(--code-bg)",
    },
    ".cm-md-quote": {
      borderLeft: "3px solid var(--border-strong)",
      paddingLeft: "1em",
      color: "var(--fg-dim)",
      fontStyle: "italic",
    },
    ".cm-md-link": { color: "var(--fg-bright)", textDecoration: "underline", cursor: "pointer" },

    ".cm-wikilink": {
      color: "var(--accent)",
      background: "var(--accent-soft)",
      borderRadius: "3px",
      padding: "0.05em 0.25em",
      cursor: "pointer",
    },
    ".cm-wikilink--raw": { background: "transparent", padding: "0" },

    // pointer-events: none so a click lands on the editor rather than on the
    // picture, which has no document position of its own.
    // Padding, never margin. CodeMirror measures a block widget's box to build
    // its height map; a margin sits outside that box, so every position below
    // the picture maps to the wrong line.
    ".cm-image": {
      display: "block",
      padding: "0.8em 0 0.2em",
      pointerEvents: "none",
      userSelect: "none",
    },
    ".cm-image img": {
      maxWidth: "100%",
      borderRadius: "6px",
      border: "1px solid var(--border)",
      display: "block",
    },
    // The markdown that produced the picture above it, kept quiet.
    ".cm-md-imgsrc": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.78em",
      color: "var(--fg-faint)",
    },
    ".cm-image--broken::after": {
      content: '"image not found"',
      display: "block",
      font: "12px var(--font-mono)",
      color: "var(--danger)",
      padding: "8px 12px",
      border: "1px dashed var(--danger)",
      borderRadius: "6px",
    },

    ".cm-rule": {
      display: "block",
      borderTop: "1px solid var(--border-strong)",
      margin: "0.9em 0",
    },
    ".cm-bullet": { color: "var(--accent)" },

    // Completion popup.
    ".cm-tooltip": {
      background: "var(--bg-raised)",
      border: "1px solid var(--border-strong)",
      borderRadius: "8px",
      boxShadow: "0 12px 32px rgb(0 0 0 / 0.4)",
      overflow: "hidden",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-ui)",
      fontSize: "13px",
      maxHeight: "16em",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "5px 10px" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "var(--accent)",
      color: "var(--bg)",
    },
    ".cm-completionDetail": { color: "var(--fg-dim)", fontStyle: "normal", marginLeft: "8px" },
  },
  { dark: true },
);

/** Syntax colours, used mostly inside fenced code blocks. */
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--syn-keyword)" },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: "var(--syn-name)" },
  { tag: [t.function(t.variableName), t.labelName], color: "var(--syn-function)" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "var(--syn-constant)" },
  { tag: [t.definition(t.name), t.separator], color: "var(--fg)" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.self, t.namespace], color: "var(--syn-type)" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link], color: "var(--syn-operator)" },
  { tag: [t.meta, t.comment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: t.string, color: "var(--syn-string)" },
  { tag: t.invalid, color: "var(--danger)" },
  // Markdown's own tokens are handled by livePreview decorations; keeping these
  // neutral stops the two from fighting over the same text.
  { tag: [t.heading, t.strong, t.emphasis], color: "inherit" },
]);

export function studioTheme(): Extension {
  return [editorTheme, syntaxHighlighting(highlight)];
}
