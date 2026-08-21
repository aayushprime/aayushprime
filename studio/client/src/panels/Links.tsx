import { api } from "../lib/api.ts";
import { askConfirm } from "../lib/dialogs.ts";
import { insertAtCursor, openPage, reloadCurrent } from "../lib/store.ts";
import type { Page } from "../lib/types.ts";

function Section({ title, count, children }: { title: string; count: number; children: unknown }) {
  return (
    <section class="links-section">
      <h3>
        {title} <span class="count">{count}</span>
      </h3>
      {children}
    </section>
  );
}

export function Links({ page }: { page: Page }) {
  return (
    <div class="links">
      <Section title="Backlinks" count={page.backlinks.length}>
        {page.backlinks.length === 0 ? (
          <p class="empty">
            Nothing links here yet — in the graph this note is an isolated dot.
          </p>
        ) : (
          <ul>
            {page.backlinks.map((b) => (
              <li key={`${b.section}/${b.slug}`}>
                <button class="link-row" onClick={() => void openPage(b.section, b.slug)}>
                  <span>{b.title}</span>
                  <code>{b.slug}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Links out" count={page.outboundLinks.length}>
        {page.outboundLinks.length === 0 ? (
          <p class="empty">No note references.</p>
        ) : (
          <ul>
            {page.outboundLinks.map((slug) => (
              <li key={slug}>
                <button class="link-row" onClick={() => void openPage("notes", slug)}>
                  <code>{slug}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {page.brokenLinks.length > 0 && (
        <Section title="Broken" count={page.brokenLinks.length}>
          <ul>
            {page.brokenLinks.map((slug) => (
              <li key={slug} class="broken">
                <code>{slug}</code>
                <span class="hint">no note with that filename</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function Images({ page }: { page: Page }) {
  const remove = async (filename: string) => {
    const ok = await askConfirm({
      title: `Delete ${filename}?`,
      message: `Removes static/${page.section}/${page.slug}/${filename} from disk.`,
      detail: ["Any reference to it in the text will show as a missing image."],
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;

    await api.deleteImage(page.section, page.slug, filename);
    await reloadCurrent();
  };

  if (page.images.length === 0) {
    return (
      <div class="images">
        <p class="empty">
          No images yet. Paste or drop one into the editor and it lands in
          <code> static/{page.section}/{page.slug}/</code>.
        </p>
      </div>
    );
  }

  return (
    <div class="images">
      <div class="image-grid">
        {page.images.map((img) => (
          <figure key={img.filename}>
            <img src={img.url} alt={img.filename} loading="lazy" />
            <figcaption>
              <span class="image-name" title={img.filename}>
                {img.filename}
              </span>
              <span class="image-size">{Math.max(1, Math.round(img.bytes / 1024))} KB</span>
            </figcaption>
            <div class="image-actions">
              <button onClick={() => insertAtCursor(`![](${img.url})`)}>insert</button>
              <button class="danger" onClick={() => void remove(img.filename)}>
                delete
              </button>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
