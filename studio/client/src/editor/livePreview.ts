import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/**
 * Obsidian-style live preview.
 *
 * Markdown renders in place, except on the lines the selection touches, where
 * the raw source is revealed so it can be edited. Everything here is
 * decoration only — the document always holds the real markdown, which is what
 * gets written to disk.
 *
 * Fenced code deliberately keeps its source visible. In a post about tmux
 * configuration, the thing you need to see is exactly what you typed.
 */

const HIDDEN = Decoration.replace({});

class ImageWidget extends WidgetType {
  readonly url: string;
  readonly alt: string;

  constructor(url: string, alt: string) {
    super();
    this.url = url;
    this.alt = alt;
  }

  eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt;
  }

  /**
   * Keeps CodeMirror from trying to turn a click on the picture into a
   * document position. The markdown underneath is the thing you click.
   */
  ignoreEvent(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-image";

    const img = document.createElement("img");
    img.src = toPreviewUrl(this.url);
    img.alt = this.alt;
    // A missing image should look missing rather than collapse to nothing.
    img.onerror = () => wrap.classList.add("cm-image--broken");
    wrap.appendChild(img);

    return wrap;
  }
}

class RuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const hr = document.createElement("span");
    hr.className = "cm-rule";
    return hr;
  }
}

class BulletWidget extends WidgetType {
  readonly marker: string;

  constructor(marker: string) {
    super();
    this.marker = marker;
  }

  eq(other: BulletWidget): boolean {
    return other.marker === this.marker;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-bullet";
    dot.textContent = this.marker;
    return dot;
  }
}

/**
 * Site-absolute image paths are served by Hugo, which the editor proxies at
 * /preview. Anything already absolute or external is left alone.
 */
function toPreviewUrl(url: string): string {
  if (/^[a-z]+:/i.test(url) || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `/preview${url}`;
  return url;
}

/** Line numbers the selection touches; these render as source. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }

  return lines;
}

function nodeIsActive(state: EditorState, active: Set<number>, from: number, to: number): boolean {
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;

  for (let n = first; n <= last; n++) if (active.has(n)) return true;
  return false;
}

/** Extend a mark's hidden range over the whitespace that follows it. */
function throughSpaces(state: EditorState, to: number): number {
  let end = to;
  while (end < state.doc.length && state.sliceDoc(end, end + 1) === " ") end++;
  return end;
}

function isInsideCode(state: EditorState, pos: number): boolean {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent!) {
    if (/Code|FencedCode|InlineCode|CodeText|CodeBlock/.test(node.name)) return true;
    if (!node.parent) return false;
  }
  return false;
}

const WIKILINK = /\[\[\s*([^\[\]|]+?)\s*(?:\|\s*([^\[\]]*?)\s*)?\]\]/g;

/**
 * `[[slug]]` and `[[slug|label]]`.
 *
 * Goldmark has no wikilink syntax and neither does the markdown parser here,
 * so these are found by the same pattern the site's own template uses and
 * decorated directly. Matches inside code are skipped, exactly as the site
 * skips them when it rewrites links.
 */
function wikilinkDecorations(
  state: EditorState,
  from: number,
  to: number,
  active: Set<number>,
  out: Range<Decoration>[],
): void {
  const text = state.sliceDoc(from, to);

  for (const m of text.matchAll(WIKILINK)) {
    const start = from + m.index;
    const end = start + m[0].length;
    if (isInsideCode(state, start + 2)) continue;

    const target = m[1] ?? "";
    const label = m[2];

    if (nodeIsActive(state, active, start, end)) {
      out.push(Decoration.mark({ class: "cm-wikilink cm-wikilink--raw" }).range(start, end));
      continue;
    }

    // Hide the brackets, and the target too when a label is shown instead.
    const shownFrom = label === undefined ? start + 2 : start + 2 + target.length + 1;
    out.push(HIDDEN.range(start, shownFrom));
    out.push(Decoration.mark({ class: "cm-wikilink" }).range(shownFrom, end - 2));
    out.push(HIDDEN.range(end - 2, end));
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(state);
  const out: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    wikilinkDecorations(state, from, to, active, out);

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const live = nodeIsActive(state, active, node.from, node.to);
        const name = node.name;

        // Headings: hide the hashes, scale the line.
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          out.push(
            Decoration.line({ class: `cm-md-heading cm-md-h${heading[1]}` }).range(
              state.doc.lineAt(node.from).from,
            ),
          );
          return;
        }

        if (name === "HeaderMark") {
          if (!live) out.push(HIDDEN.range(node.from, throughSpaces(state, node.to)));
          return;
        }

        if (name === "Emphasis") {
          out.push(Decoration.mark({ class: "cm-md-em" }).range(node.from, node.to));
          return;
        }

        if (name === "StrongEmphasis") {
          out.push(Decoration.mark({ class: "cm-md-strong" }).range(node.from, node.to));
          return;
        }

        if (name === "Strikethrough") {
          out.push(Decoration.mark({ class: "cm-md-strike" }).range(node.from, node.to));
          return;
        }

        if (name === "EmphasisMark" || name === "StrikethroughMark") {
          if (!live) out.push(HIDDEN.range(node.from, node.to));
          return;
        }

        if (name === "InlineCode") {
          out.push(Decoration.mark({ class: "cm-md-code" }).range(node.from, node.to));
          return;
        }

        if (name === "FencedCode" || name === "CodeBlock") {
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            out.push(Decoration.line({ class: "cm-md-fence" }).range(line.from));
            pos = line.to + 1;
          }
          // Descend anyway: the nested language highlighter lives in here.
          return;
        }

        // Inline code delimiters hide; fence delimiters stay, because the
        // source of a code block is the point of a code block.
        if (name === "CodeMark") {
          const parent = node.node.parent?.name;
          if (!live && parent === "InlineCode") out.push(HIDDEN.range(node.from, node.to));
          return;
        }

        // The picture is drawn above the line as a block widget and the
        // markdown stays where it is, rather than the source being replaced.
        // A replaced range is atomic: clicking inside one makes the caret jump
        // to whichever edge CodeMirror picks, and the text you wanted to edit
        // is not there to click. This way the source is always visible, always
        // editable, and the image re-renders as you change it.
        // The picture itself is a block widget, which CodeMirror only accepts
        // from a state field (see imageBlocks below). All that happens here is
        // quieting the markdown, which stays visible and editable.
        if (name === "Image") {
          out.push(Decoration.mark({ class: "cm-md-imgsrc" }).range(node.from, node.to));
          return false; // Its marks and URL stay visible, so do not descend.
        }

        if (name === "Link") {
          out.push(Decoration.mark({ class: "cm-md-link" }).range(node.from, node.to));
          return;
        }

        if (name === "URL" || name === "LinkTitle") {
          // Links only: an image's URL is deliberately left on screen.
          if (!live && node.node.parent?.name === "Link") {
            // Also swallow the surrounding parentheses.
            out.push(HIDDEN.range(node.from - 1, node.to + 1));
          }
          return;
        }

        if (name === "LinkMark") {
          if (!live && node.node.parent?.name === "Link") {
            const char = state.sliceDoc(node.from, node.to);
            if (char === "[" || char === "]") out.push(HIDDEN.range(node.from, node.to));
          }
          return;
        }

        if (name === "HorizontalRule") {
          if (!live) {
            out.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
          }
          return false;
        }

        if (name === "Blockquote") {
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos);
            out.push(Decoration.line({ class: "cm-md-quote" }).range(line.from));
            pos = line.to + 1;
          }
          return;
        }

        if (name === "QuoteMark") {
          if (!live) out.push(HIDDEN.range(node.from, throughSpaces(state, node.to)));
          return;
        }

        if (name === "ListMark") {
          const parent = node.node.parent?.parent?.name;
          if (!live && parent === "BulletList") {
            out.push(
              Decoration.replace({ widget: new BulletWidget("•") }).range(node.from, node.to),
            );
          }
          return;
        }

        return;
      },
    });
  }

  return Decoration.set(out, true);
}

/**
 * Pictures, drawn above the line that produces them.
 *
 * A state field rather than part of the view plugin: CodeMirror rejects block
 * decorations from plugins, because block widgets change the document's height
 * map and the viewport has to be measured with them already in place.
 *
 * Drawn above rather than in place of the markdown. A replaced range is
 * atomic — clicking inside one sends the caret to an edge, and the text you
 * meant to edit is not on screen to click.
 */
function buildImageBlocks(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Image") return;

      const url = node.node.getChild("URL");
      if (!url) return false;

      const alt = state.sliceDoc(node.from + 2, url.from - 2);
      out.push(
        Decoration.widget({
          widget: new ImageWidget(state.sliceDoc(url.from, url.to), alt),
          block: true,
          side: -1,
        }).range(state.doc.lineAt(node.from).from),
      );

      return false;
    },
  });

  return Decoration.set(out, true);
}

const imageBlocks = StateField.define<DecorationSet>({
  create: buildImageBlocks,
  update(value, tr) {
    // Also on a tree change: the first parse can finish after the field is
    // created, and an image in the tail of a long file would never appear.
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildImageBlocks(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function livePreview(): Extension {
  return [imageBlocks, inlinePreview()];
}

function inlinePreview(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        // Selection matters as much as content here: moving the cursor onto a
        // line is what reveals its source.
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // Clicking a rendered image or bullet should put the cursor there rather
      // than doing nothing.
      eventHandlers: {},
    },
  );
}
