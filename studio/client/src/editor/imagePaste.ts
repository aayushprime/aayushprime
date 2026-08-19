import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type ImageUploader = (file: File) => Promise<string | null>;

function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];

  const files: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && file.type.startsWith("image/")) files.push(file);
  }

  return files;
}

/**
 * Paste and drop of images.
 *
 * This is the reason the editor exists: the file goes to the page's own
 * directory under static/ and the markdown reference is written at the cursor,
 * so an image never has to be filed by hand.
 *
 * A placeholder is inserted immediately and rewritten when the upload lands,
 * so a large paste does not look like nothing happened, and so the cursor can
 * move on in the meantime.
 */
export function imagePaste(upload: ImageUploader): Extension {
  const handle = (view: EditorView, files: File[], at: number): boolean => {
    if (files.length === 0) return false;

    for (const file of files) {
      const token = `![uploading ${file.name || "image"}…]()`;

      view.dispatch({
        changes: { from: at, to: at, insert: token },
        selection: { anchor: at + token.length },
      });

      void upload(file).then((markdown) => {
        // The document may have changed while the upload was in flight, so the
        // placeholder is located by searching rather than by remembered offset.
        const text = view.state.doc.toString();
        const index = text.indexOf(token);
        if (index === -1) return;

        view.dispatch({
          changes: { from: index, to: index + token.length, insert: markdown ?? "" },
        });
      });
    }

    return true;
  };

  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFilesFrom(event.clipboardData);
      if (files.length === 0) return false;

      event.preventDefault();
      return handle(view, files, view.state.selection.main.from);
    },

    drop(event, view) {
      const files = imageFilesFrom(event.dataTransfer);
      if (files.length === 0) return false;

      event.preventDefault();
      const at = view.posAtCoords({ x: event.clientX, y: event.clientY });
      return handle(view, files, at ?? view.state.selection.main.from);
    },
  });
}
