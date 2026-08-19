import { useState } from "preact/hooks";
import { createIn, deletePage, duplicatePage, renamePage } from "../lib/actions.ts";
import { current, filter, openPage, pages, sections, setFilter, view } from "../lib/store.ts";
import type { SectionName } from "../lib/types.ts";

function formatDate(date: string | null): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date.slice(0, 10);
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function Sidebar() {
  const active = filter.value;
  const list = pages.value;
  const open = current.value;
  const [query, setQuery] = useState("");

  // No "all" tab: blog and notes are different kinds of writing with different
  // frontmatter, and mixing them made the list harder to scan than either.
  const setSection = (section: SectionName) => setFilter({ ...active, section });

  const currentSection = active.section ?? "posts";
  const label = sections.value.find((s) => s.name === currentSection)?.label ?? "";

  return (
    <aside class="sidebar">
      <header class="sidebar-head">
        <div class="sidebar-title">
          <strong>studio</strong>
          <button
            class={`btn btn--ghost ${view.value === "tags" ? "is-active" : ""}`}
            onClick={() => (view.value = view.value === "tags" ? "editor" : "tags")}
            title="Manage tags"
          >
            tags
          </button>
        </div>

        <input
          class="search"
          type="search"
          placeholder="Search title, tag, body…"
          value={query}
          onInput={(e) => {
            const q = (e.target as HTMLInputElement).value;
            setQuery(q);
            setFilter({ ...active, q: q || undefined });
          }}
        />

        <div class="seg">
          {sections.value.map((s) => (
            <button
              key={s.name}
              class={active.section === s.name ? "is-active" : ""}
              onClick={() => setSection(s.name)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div class="sidebar-row">
          <div class="chips">
            <button
              class={`chip ${active.draft === true ? "is-active" : ""}`}
              onClick={() =>
                setFilter({ ...active, draft: active.draft === true ? undefined : true })
              }
            >
              drafts
            </button>
            <button
              class={`chip ${active.draft === false ? "is-active" : ""}`}
              onClick={() =>
                setFilter({ ...active, draft: active.draft === false ? undefined : false })
              }
            >
              published
            </button>
            {active.tag && (
              <button
                class="chip is-active"
                onClick={() => setFilter({ ...active, tag: undefined })}
              >
                #{active.tag} ✕
              </button>
            )}
          </div>

          {/* One button: the section tabs above already say what it will make. */}
          <button
            class="btn btn--add"
            onClick={() => void createIn(currentSection)}
            title={`New ${label.toLowerCase()} entry`}
          >
            ＋ add
          </button>
        </div>
      </header>

      <div class="page-list">
        {list.length === 0 && <p class="empty">Nothing matches.</p>}

        {list.map((page) => {
          const isOpen = open?.section === page.section && open.slug === page.slug;
          return (
            <div
              key={`${page.section}/${page.slug}`}
              class={`page-item ${isOpen ? "is-open" : ""}`}
              onClick={() => void openPage(page.section, page.slug)}
            >
              <div class="page-item-main">
                <span class="page-item-title">{page.title}</span>
                <span class="page-item-meta">
                  {formatDate(page.date)}
                  {page.draft && <span class="badge">draft</span>}
                </span>
                {page.tags.length > 0 && (
                  <span class="page-item-tags">
                    {page.tags.map((tag) => (
                      <button
                        key={tag}
                        class="tag"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilter({ ...active, tag });
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </span>
                )}
              </div>

              {/* Absolutely positioned, so appearing on hover cannot reflow the
                  title underneath and make the row jump. */}
              <div class="page-item-actions" onClick={(e) => e.stopPropagation()}>
                <button title="Duplicate" onClick={() => void duplicatePage(page)}>
                  ⧉
                </button>
                <button title="Rename" onClick={() => void renamePage(page)}>
                  ✎
                </button>
                <button title="Delete" class="danger" onClick={() => void deletePage(page)}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
