import { isCollection, parseDocument, type Document } from "yaml";

/**
 * A markdown file split into its frontmatter and body.
 *
 * The raw frontmatter text is kept alongside the parsed document so that a
 * file nobody edited can be written back byte for byte. Re-stringifying YAML
 * is faithful about comments and key order but not about trailing whitespace,
 * and a formatting-only diff on every file the editor merely opened would be
 * noise in `git status`.
 */
export type ParsedFile = {
  /** Text between the fences, exactly as read, without the surrounding newlines. */
  frontmatterText: string;
  /** Parsed frontmatter. Null when the file has no frontmatter block at all. */
  doc: Document.Parsed | null;
  /** Everything after the closing fence line, verbatim. */
  body: string;
  eol: "\n" | "\r\n";
  /**
   * Serialization of `doc` as it was at parse time; see serializeFile.
   * Null when the frontmatter could not be parsed cleanly, which also marks
   * the block as unsafe to re-emit.
   */
  pristine: string | null;
  /** YAML parse errors, if any. A file with errors is readable but not editable. */
  errors: string[];
};

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m;

/**
 * YAML emitter options chosen to match the conventions already in content/:
 * four-space nesting under `cover:`, unpadded flow sequences for `tags`, and
 * unindented block sequences under `outputs:`. With these, every one of the
 * site's existing frontmatter blocks re-stringifies to itself.
 */
function emitOptions(sourceText: string) {
  return {
    indent: detectIndent(sourceText),
    indentSeq: false,
    flowCollectionPadding: false,
    lineWidth: 0,
  } as const;
}

/** Nesting width already used by a block, so an edit does not reindent it. */
function detectIndent(sourceText: string): number {
  const m = sourceText.match(/^( +)\S/m);
  return m ? m[1]!.length : 2;
}

export function stringifyFrontmatter(doc: Document, sourceText: string): string {
  return doc.toString(emitOptions(sourceText)).replace(/\r?\n$/, "");
}

/** stringifyFrontmatter, but null instead of throwing on a document with errors. */
function tryStringify(doc: Document, sourceText: string): string | null {
  try {
    return stringifyFrontmatter(doc, sourceText);
  } catch {
    return null;
  }
}

export function parseFile(text: string): ParsedFile {
  const eol: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const m = text.startsWith("---") ? FRONTMATTER.exec(text) : null;

  if (!m) {
    return { frontmatterText: "", doc: null, body: text, eol, pristine: null, errors: [] };
  }

  const frontmatterText = m[1]!.replace(/\r?\n$/, "");
  const doc = parseDocument(frontmatterText);
  return {
    frontmatterText,
    doc,
    body: text.slice(m[0].length),
    eol,
    pristine: tryStringify(doc, frontmatterText),
    errors: doc.errors.map((e) => e.message),
  };
}

/**
 * Rebuild the file. The frontmatter is re-emitted only if the document
 * actually changed since parsing — comparing serializations rather than
 * tracking a dirty flag, so it stays correct no matter who mutated the doc.
 */
export function serializeFile(p: ParsedFile): string {
  if (!p.doc) return p.body;

  // A block that failed to parse has no trustworthy serialization, so it is
  // written back exactly as it was read. Losing a malformed file's contents
  // while trying to tidy it would be the worst thing this code could do.
  const now = p.pristine === null ? null : tryStringify(p.doc, p.frontmatterText);
  const fm = now === null || now === p.pristine ? p.frontmatterText : now;
  const gap = fm === "" ? "" : p.eol;

  return `---${p.eol}${fm}${gap}---${p.eol}${p.body}`;
}

export function getField(doc: Document, key: string): unknown {
  const v = doc.getIn(key.split("."));
  return isCollection(v) ? v.toJSON() : v;
}

export function setField(doc: Document, key: string, value: unknown): void {
  const path = key.split(".");

  if (value === undefined) {
    doc.deleteIn(path);
    return;
  }

  // Replacing a collection yields a fresh node in block style. The site writes
  // tags as `[a, b]`, so editing a tag should not silently rewrite every list
  // it touches into a block sequence. The node has to be built up front —
  // setIn stores a plain array as-is, leaving nothing to carry the flag on.
  const before = doc.getIn(path, true);
  if (value !== null && typeof value === "object") {
    const node = doc.createNode(value);
    if (isCollection(before) && isCollection(node) && before.flow) node.flow = true;
    doc.setIn(path, node);
    return;
  }

  doc.setIn(path, value);
}

export function deleteField(doc: Document, key: string): void {
  doc.deleteIn(key.split("."));
}
