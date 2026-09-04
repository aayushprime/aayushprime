import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { filter, saveFields, setFilter, tags as allTags } from "../lib/store.ts";
import type { FieldDef, Page, SectionDef } from "../lib/types.ts";

const COMMIT_MS = 700;

/** Hugo dates are RFC3339; the input wants `YYYY-MM-DDTHH:mm`. */
function toDateInput(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  return m ? `${m[1]}T${m[2]}` : "";
}

/**
 * Put a datetime-local value back into the file's own format, keeping the
 * timezone offset the file already carried so an edit does not silently
 * restate the date in another zone.
 */
function fromDateInput(input: string, previous: unknown): string {
  const offset =
    typeof previous === "string" ? (/([+-]\d{2}:?\d{2}|Z)$/.exec(previous)?.[1] ?? "") : "";
  return `${input}:00${offset}`;
}

type Commit = (key: string, value: unknown) => void;

const commitFields: Commit = (key, value) => void saveFields({ [key]: value });

/* ── Tags ──────────────────────────────────────────────────────────────── */

export function TagEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const suggestions = useMemo(
    () => allTags.value.map((t) => t.tag).filter((t) => !value.includes(t)),
    [allTags.value, value],
  );

  const add = (raw: string) => {
    const tag = raw.trim();
    if (tag === "" || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div class="tag-editor">
      {value.map((tag) => (
        <span key={tag} class="tag tag--chip">
          <button
            class="tag-name"
            title={`Filter by ${tag}`}
            onClick={() => setFilter({ ...filter.value, tag })}
          >
            {tag}
          </button>
          <button class="tag-remove" title="Remove" onClick={() => onChange(value.filter((t) => t !== tag))}>
            ✕
          </button>
        </span>
      ))}

      <input
        class="tag-input"
        list="studio-tag-suggestions"
        placeholder={value.length === 0 ? "add a tag…" : "add…"}
        value={draft}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={() => add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
      />

      <datalist id="studio-tag-suggestions">
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}

/** Tags live at the end of the document, where you reach for them last. */
export function TagFooter({ page, section }: { page: Page; section: SectionDef }) {
  const def = section.fields.find((f) => f.slot === "tags");
  // Tags cannot be written before the page has a file to write them into.
  if (!def || page.slug === "") return null;

  const value = page.fields[def.key];

  return (
    <footer class="doc-footer">
      <span class="doc-footer-label">Tags</span>
      <TagEditor
        value={Array.isArray(value) ? value.map(String) : []}
        onChange={(next) => commitFields(def.key, next)}
      />
    </footer>
  );
}

/* ── Cover ─────────────────────────────────────────────────────────────── */

function CoverField({ page, def }: { page: Page; def: FieldDef }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const value = typeof page.fields[def.key] === "string" ? (page.fields[def.key] as string) : "";

  useEffect(() => setPath(value), [value]);

  const choose = (url: string) => {
    commitFields(def.key, url);
    setOpen(false);
  };

  // Clearing removes the whole `cover` map, not just the image. The theme
  // renders the block with `with .Params.cover`, so an empty map left behind
  // would still emit an <img> with no source.
  const clear = () => {
    void saveFields({ cover: null });
    setOpen(false);
  };

  return (
    <div class="cover">
      {value === "" ? (
        <button class="cover-empty" onClick={() => setOpen(!open)} title="Add a cover image">
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <rect x="2.5" y="4" width="15" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" />
            <circle cx="7.2" cy="8.4" r="1.3" fill="currentColor" />
            <path d="M3.4 14.2l3.9-3.6 3 2.7 2.6-2.2 3.7 3.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
          </svg>
        </button>
      ) : (
        <div class="cover-set">
          <button class="cover-thumb" onClick={() => setOpen(!open)} title={value}>
            <img src={value} alt="" />
          </button>
          <button class="cover-clear" onClick={clear} title="Remove cover">
            ✕
          </button>
        </div>
      )}

      {open && (
        <>
          <div class="popover-scrim" onClick={() => setOpen(false)} />
          <div class="popover cover-popover">
            <h3>Cover image</h3>

            {page.images.length > 0 ? (
              <div class="cover-choices">
                {page.images.map((img) => (
                  <button
                    key={img.url}
                    class={img.url === value ? "is-active" : ""}
                    onClick={() => choose(img.url)}
                    title={img.filename}
                  >
                    <img src={img.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p class="hint">
                No images on this page yet. Paste one into the editor and it will show up here.
              </p>
            )}

            <label class="prop">
              <span class="prop-label">Or a path</span>
              <input
                type="text"
                value={path}
                placeholder="/posts/slug/cover.png"
                onInput={(e) => setPath((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === "Enter" && choose(path.trim())}
              />
            </label>

            <div class="popover-actions">
              {value !== "" && (
                <button class="btn btn--danger" onClick={clear}>
                  Remove cover
                </button>
              )}
              <button class="btn" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Fields ────────────────────────────────────────────────────────────── */

/** Text needs local state so typing is not fighting the debounced save. */
function TextField({ def, value, commit }: { def: FieldDef; value: string; commit: Commit }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(value), [value]);

  const schedule = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(def.key, next), COMMIT_MS);
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (draft !== value) commit(def.key, draft);
  };

  return (
    <label class="prop">
      <span class="prop-label">{def.label}</span>
      <input type="text" value={draft} onInput={(e) => schedule((e.target as HTMLInputElement).value)} onBlur={flush} />
      {def.hint && <span class="prop-hint">{def.hint}</span>}
    </label>
  );
}

function MoreField({ def, page, commit }: { def: FieldDef; page: Page; commit: Commit }) {
  const value = page.fields[def.key];

  if (def.type === "boolean") {
    return (
      <label class="prop prop--check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => commit(def.key, (e.target as HTMLInputElement).checked)}
        />
        <span>
          <span class="prop-check-label">{def.label}</span>
          {def.hint && <span class="prop-hint">{def.hint}</span>}
        </span>
      </label>
    );
  }

  return <TextField def={def} value={typeof value === "string" ? value : ""} commit={commit} />;
}

/* ── Document header ───────────────────────────────────────────────────── */

/**
 * Title, cover and the two facts worth seeing at a glance.
 *
 * Everything else is behind "more", and tags are at the foot of the page. The
 * header is the only chrome between the tab bar and the prose, so it stays two
 * lines tall no matter how many parameters the section defines.
 */
export function DocHeader({ page, section }: { page: Page; section: SectionDef }) {
  const [more, setMore] = useState(false);

  if (page.frontmatterErrors.length > 0) {
    return (
      <div class="doc-header doc-header--broken">
        <strong>Frontmatter does not parse.</strong>
        <p>{page.frontmatterErrors[0]}</p>
        <p class="hint">
          Fields are read-only until this is fixed, and the file is never rewritten while it is in
          this state — nothing has been lost. Repair the YAML directly.
        </p>
        <pre>{page.frontmatter}</pre>
      </div>
    );
  }

  const titleDef = section.fields.find((f) => f.slot === "title");
  const coverDef = section.fields.find((f) => f.slot === "cover");
  const dateDef = section.fields.find((f) => f.key === "date");
  const draftDef = section.fields.find((f) => f.key === "draft");
  const moreDefs = section.fields.filter((f) => f.slot === "more");

  return (
    <div class="doc-header">
      <div class="doc-title-row">
        {titleDef && (
          <TitleInput
            value={typeof page.fields[titleDef.key] === "string" ? (page.fields[titleDef.key] as string) : ""}
            onCommit={(v) => commitFields(titleDef.key, v)}
          />
        )}
        {coverDef && page.slug !== "" && <CoverField page={page} def={coverDef} />}
      </div>

      {/*
       * A page with no file yet has no archetype defaults to show, and guessing
       * them would only have the real values snap in over the guesses a moment
       * later. The title box keeps its place so typing into it is not
       * interrupted when the file does appear.
       */}
      {page.slug === "" ? (
        <p class="doc-pending">Not saved yet — give it a title, or just start writing.</p>
      ) : (
      <div class="doc-meta">
        {dateDef && (
          <label class="meta-item" title="Publication date">
            <input
              class="meta-date"
              type="datetime-local"
              value={toDateInput(page.fields[dateDef.key])}
              onChange={(e) => {
                const next = (e.target as HTMLInputElement).value;
                if (next) commitFields(dateDef.key, fromDateInput(next, page.fields[dateDef.key]));
              }}
            />
          </label>
        )}

        <div class="meta-right">
          {draftDef && (
            <label class="meta-item meta-toggle">
              <input
                type="checkbox"
                checked={page.fields[draftDef.key] === true}
                onChange={(e) => commitFields(draftDef.key, (e.target as HTMLInputElement).checked)}
              />
              <span>Draft</span>
            </label>
          )}

          {moreDefs.length > 0 && (
            <div class="meta-more">
              <button
                class={`meta-item meta-button ${more ? "is-active" : ""}`}
                onClick={() => setMore(!more)}
              >
                ⋯ more
              </button>

              {more && (
                <>
                  <div class="popover-scrim" onClick={() => setMore(false)} />
                  <div class="popover more-popover">
                    <h3>{section.label} options</h3>
                    {moreDefs.map((def) => (
                      <MoreField key={def.key} def={def} page={page} commit={commitFields} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * A textarea rather than an input, so a long title wraps the way it does on
 * the published page instead of scrolling out of sight behind the cover. It
 * grows to fit its content and swallows Enter, so it still behaves like a
 * single-value field.
 */
function TitleInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    setDraft(value);
    // After the value lands, and again once the webfont has swapped in, since
    // the wrapped height changes with the face.
    queueMicrotask(fit);
    void document.fonts?.ready.then(fit);
  }, [value]);

  return (
    <textarea
      ref={box}
      class="doc-title"
      rows={1}
      spellcheck={false}
      placeholder="Untitled"
      value={draft}
      onInput={(e) => {
        const next = (e.target as HTMLTextAreaElement).value;
        setDraft(next);
        fit();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(next), COMMIT_MS);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      onBlur={() => {
        if (timer.current) clearTimeout(timer.current);
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}
