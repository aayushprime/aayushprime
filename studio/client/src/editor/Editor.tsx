import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap } from "@codemirror/search";
import { useEffect, useRef } from "preact/hooks";
import { api } from "../lib/api.ts";
import { editBody, flushSave, pages, setInserter } from "../lib/store.ts";
import type { Page, SectionDef } from "../lib/types.ts";
import { imagePaste } from "./imagePaste.ts";
import { livePreview } from "./livePreview.ts";
import { studioTheme } from "./theme.ts";
import { wikilinkCompletion } from "./wikilink.ts";

type Props = {
  page: Page;
  sections: SectionDef[];
};

export function Editor({ page, sections }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // Keyed on the file, so switching pages builds a fresh editor rather than
  // trying to reconcile one document's history onto another's text.
  const key = `${page.section}/${page.slug}`;

  useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: page.body,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        closeBrackets(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        livePreview(),
        studioTheme(),
        wikilinkCompletion(
          () => pages.value,
          () => sections,
        ),
        imagePaste(async (file) => {
          try {
            const saved = await api.uploadImage(page.section, page.slug, file, file.name);
            return saved.markdown;
          } catch {
            return null;
          }
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void flushSave();
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) editBody(update.state.doc.toString());
        }),
      ],
    });

    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    editor.focus();

    setInserter((text) => {
      const at = editor.state.selection.main;
      editor.dispatch({
        changes: { from: at.from, to: at.to, insert: text },
        selection: { anchor: at.from + text.length },
      });
      editor.focus();
    });

    return () => {
      setInserter(() => {});
      editor.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The document is built on mount and keyed by file, so a reload of the same
  // file — after an external edit, or after discarding a conflict — would
  // otherwise leave the old text on screen. Only reachable when the store has
  // decided there is nothing unsaved to lose.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;

    const shown = editor.state.doc.toString();
    if (shown === page.body) return;

    const cursor = Math.min(editor.state.selection.main.head, page.body.length);
    editor.dispatch({
      changes: { from: 0, to: shown.length, insert: page.body },
      selection: { anchor: cursor },
    });
  }, [page.body]);

  return <div class="editor-surface" ref={host} />;
}
