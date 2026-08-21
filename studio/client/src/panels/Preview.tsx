import { useEffect, useRef } from "preact/hooks";
import { api } from "../lib/api.ts";
import { hugo, previewNonce } from "../lib/store.ts";
import type { Page } from "../lib/types.ts";

/**
 * The real Hugo render, mirrored onto the editor's own origin at its own paths.
 *
 * Reloading on save is Hugo's job: the mirror points LiveReload back at itself,
 * so the frame refreshes when a build actually finishes rather than after a
 * guessed delay — and it refreshes for changes the editor never saw, like a
 * layout edited in the terminal pane. What is left here is navigation, and the
 * reload button for when you want to insist.
 *
 * Because it is same-origin, the frame can be reloaded in place rather than
 * remounted, and the script the mirror injects restores the scroll position
 * afterwards — so saving mid-article does not throw you back to the top.
 */
export function Preview({ page }: { page: Page }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src = page.previewUrl;
  const status = hugo.value;
  const nonce = previewNonce.value;
  const shown = useRef(src);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;

    if (shown.current !== src) {
      shown.current = src;
      el.src = src;
      return;
    }

    // Same page, new content: reload rather than reassign, so the injected
    // scroll-restore script runs against the position it just saved.
    try {
      el.contentWindow?.location.reload();
    } catch {
      el.src = src;
    }
  }, [src, nonce]);

  return (
    <div class="preview">
      <div class={`preview-status preview-status--${status.state}`}>
        <span class="pill" />
        <span class="preview-state">hugo {status.state}</span>
        <span class="spacer" />
        <button class="btn btn--ghost" onClick={() => previewNonce.value++}>
          reload
        </button>
        <button class="btn btn--ghost" onClick={() => void api.restartHugo()}>
          restart
        </button>
      </div>

      {status.state === "failed" && (
        <pre class="preview-log">{status.log.slice(-12).join("\n")}</pre>
      )}

      <iframe ref={frame} class="preview-frame" src={src} title="preview" />
    </div>
  );
}
