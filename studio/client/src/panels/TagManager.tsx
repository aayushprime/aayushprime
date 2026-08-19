import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.ts";
import { askConfirm, askText } from "../lib/dialogs.ts";
import {
  banner,
  filter,
  openPage,
  refreshPages,
  refreshTags,
  setFilter,
  tags,
  view,
} from "../lib/store.ts";
import type { PageSummary, TagEdit } from "../lib/types.ts";

function report(action: string, result: TagEdit): void {
  const changed = `${result.changed.length} file${result.changed.length === 1 ? "" : "s"}`;
  banner.value =
    result.skipped.length === 0
      ? `${action} in ${changed}.`
      : `${action} in ${changed}. Skipped ${result.skipped
          .map((s) => `${s.page} (${s.reason})`)
          .join(", ")}.`;
}

export function TagManager() {
  const list = tags.value;
  const [selected, setSelected] = useState<string | null>(null);
  const [pagesForTag, setPagesForTag] = useState<PageSummary[]>([]);

  useEffect(() => {
    if (!selected) {
      setPagesForTag([]);
      return;
    }
    void api.tagPages(selected).then(setPagesForTag);
  }, [selected, list]);

  const rename = async (tag: string) => {
    const to = await askText({
      title: `Rename “${tag}”`,
      label: "New name",
      initial: tag,
      confirmLabel: "Rename",
      validate: (v) => (v.trim() === "" ? "A tag needs a name" : null),
    });
    if (to === null || to === tag) return;

    const exists = list.some((t) => t.tag === to.trim());
    if (exists) {
      const ok = await askConfirm({
        title: `Merge into “${to.trim()}”?`,
        message: `“${to.trim()}” already exists, so this merges the two tags.`,
        detail: ["Pages carrying both end up with one.", "This reshapes the notes graph."],
        confirmLabel: "Merge",
      });
      if (!ok) return;
    }

    report(exists ? "Merged" : "Renamed", await api.renameTag(tag, to.trim()));
    if (selected === tag) setSelected(to.trim());
    await refreshTags();
    await refreshPages();
  };

  const remove = async (tag: string, count: number) => {
    const ok = await askConfirm({
      title: `Remove “${tag}”?`,
      message: `Drops the tag from ${count} page${count === 1 ? "" : "s"}. The pages themselves are untouched.`,
      detail: ["Its node disappears from the notes graph, along with any edges through it."],
      confirmLabel: "Remove tag",
      danger: true,
    });
    if (!ok) return;

    report("Removed", await api.deleteTag(tag));
    if (selected === tag) setSelected(null);
    await refreshTags();
    await refreshPages();
  };

  return (
    <div class="tag-manager">
      <header class="view-head">
        <h1>Tags</h1>
        <p class="hint">
          Tags are taxonomy terms and graph nodes at once, so renaming one here rewrites every file
          that carries it and reshapes <code>/notes/graph.json</code>.
        </p>
        <button class="btn" onClick={() => (view.value = "editor")}>
          ← back to editor
        </button>
      </header>

      <div class="tag-columns">
        <div class="tag-list">
          {list.length === 0 && <p class="empty">No tags yet.</p>}

          {list.map((t) => (
            <div
              key={t.tag}
              class={`tag-row ${selected === t.tag ? "is-selected" : ""}`}
              onClick={() => setSelected(t.tag === selected ? null : t.tag)}
            >
              <span class="tag-row-name">{t.tag}</span>
              <span class="tag-row-count">{t.count}</span>
              <span class="tag-row-sections">{t.sections.join(", ")}</span>
              <span class="tag-row-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => void rename(t.tag)}>rename</button>
                <button class="danger" onClick={() => void remove(t.tag, t.count)}>
                  remove
                </button>
              </span>
            </div>
          ))}
        </div>

        <div class="tag-detail">
          {!selected && <p class="empty">Select a tag to see what carries it.</p>}

          {selected && (
            <>
              <h2>
                #{selected}
                <button
                  class="btn btn--ghost"
                  onClick={() => {
                    setFilter({ ...filter.value, tag: selected });
                    view.value = "editor";
                  }}
                >
                  filter sidebar
                </button>
              </h2>
              <ul>
                {pagesForTag.map((p) => (
                  <li key={`${p.section}/${p.slug}`}>
                    <button
                      class="link-row"
                      onClick={() => {
                        view.value = "editor";
                        void openPage(p.section, p.slug);
                      }}
                    >
                      <span>{p.title}</span>
                      <code>
                        {p.section}/{p.slug}
                      </code>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
