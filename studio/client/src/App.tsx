import { useEffect, useState } from "preact/hooks";
import { createIn } from "./lib/actions.ts";
import { Editor } from "./editor/Editor.tsx";
import { Dialogs } from "./panels/Dialogs.tsx";
import { Images, Links } from "./panels/Links.tsx";
import { Preview } from "./panels/Preview.tsx";
import { DocHeader, TagFooter } from "./panels/Properties.tsx";
import { Sidebar } from "./panels/Sidebar.tsx";
import { TagManager } from "./panels/TagManager.tsx";
import { Terminal } from "./panels/Terminal.tsx";
import {
  banner,
  conflict,
  connectEvents,
  current,
  dirty,
  dockOpen,
  flushSave,
  loadConfig,
  refreshPages,
  refreshTags,
  reloadCurrent,
  saveError,
  saveState,
  sections,
  sidebarOpen,
  stepTextScale,
  textScale,
  toggleDock,
  toggleSidebar,
  view,
} from "./lib/store.ts";

type DockTab = "preview" | "links" | "images" | "terminal";

function SaveIndicator() {
  const state = saveState.value;

  if (saveError.value) return <span class="save save--error">save failed: {saveError.value}</span>;
  if (state === "saving") return <span class="save">saving…</span>;
  if (dirty.value) return <span class="save save--dirty">unsaved</span>;
  if (state === "saved") return <span class="save save--ok">saved</span>;
  return <span class="save" />;
}

function TextSize() {
  const scale = textScale.value;

  return (
    <div class="text-size" title="Text size">
      <button onClick={() => stepTextScale(-1)} aria-label="Smaller text">
        A<span class="text-size-minus">−</span>
      </button>
      <span class="text-size-value">{Math.round(scale * 100)}%</span>
      <button onClick={() => stepTextScale(1)} aria-label="Larger text">
        A<span class="text-size-plus">+</span>
      </button>
    </div>
  );
}

function ConflictBanner() {
  if (!conflict.value) return null;

  return (
    <div class="conflict">
      <span>
        This file changed on disk while you had unsaved edits here. Nothing has been overwritten.
      </span>
      <button class="btn" onClick={() => void reloadCurrent()}>
        Load from disk
      </button>
      <button
        class="btn btn--primary"
        onClick={() => {
          conflict.value = false;
          void flushSave();
        }}
      >
        Keep mine
      </button>
    </div>
  );
}

function Banner() {
  if (!banner.value) return null;

  return (
    <div class="banner">
      <span>{banner.value}</span>
      <button onClick={() => (banner.value = null)}>✕</button>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<DockTab>("preview");
  // Mounted once and kept alive behind CSS, so the shell keeps its scrollback
  // and any long-running command survives switching tabs.
  const [terminalUsed, setTerminalUsed] = useState(false);

  useEffect(() => {
    void loadConfig();
    void refreshPages();
    void refreshTags();
    return connectEvents();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "s") {
        e.preventDefault();
        void flushSave();
      } else if (e.key === "\\") {
        e.preventDefault();
        if (e.shiftKey) toggleDock();
        else toggleSidebar();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        stepTextScale(1);
      } else if (e.key === "-") {
        e.preventDefault();
        stepTextScale(-1);
      }
    };

    // Unsaved work should not be lost to a reflexive Cmd-W.
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!dirty.value) return;
      void flushSave();
      e.preventDefault();
    };

    addEventListener("keydown", onKey);
    addEventListener("beforeunload", onLeave);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("beforeunload", onLeave);
    };
  }, []);

  useEffect(() => {
    if (tab === "terminal") setTerminalUsed(true);
  }, [tab]);

  const page = current.value;
  const section = sections.value.find((s) => s.name === page?.section);

  if (view.value === "tags") {
    return (
      <div class="app app--single">
        <Banner />
        <TagManager />
        <Dialogs />
      </div>
    );
  }

  const columns = [
    sidebarOpen.value ? "var(--sidebar-w)" : "0px",
    "minmax(0, 1fr)",
    dockOpen.value ? "var(--dock-w)" : "0px",
  ].join(" ");

  return (
    <div
      class={`app ${sidebarOpen.value ? "" : "app--no-sidebar"} ${dockOpen.value ? "" : "app--no-dock"}`}
      style={{ gridTemplateColumns: columns, "--text-scale": String(textScale.value) }}
    >
      <Sidebar />

      <main class="main">
        <header class="top-bar">
          <button
            class="rail-toggle"
            onClick={toggleSidebar}
            title={`${sidebarOpen.value ? "Hide" : "Show"} sidebar  (⌘\\)`}
          >
            {sidebarOpen.value ? "⟨" : "⟩"}
          </button>

          <div class="top-bar-id">
            {page ? (
              <code>
                content/{page.section}/{page.slug}.md
              </code>
            ) : (
              <code class="muted">studio</code>
            )}
            {page?.draft && <span class="badge">draft</span>}
          </div>

          <div class="top-bar-right">
            <SaveIndicator />
            <TextSize />
            <button
              class="rail-toggle"
              onClick={toggleDock}
              title={`${dockOpen.value ? "Hide" : "Show"} preview  (⌘⇧\\)`}
            >
              {dockOpen.value ? "⟩" : "⟨"}
            </button>
          </div>
        </header>

        <Banner />
        <ConflictBanner />

        {!page || !section ? (
          <div class="placeholder">
            <h1>studio</h1>
            <p>Pick something on the left, or start writing.</p>
            <div class="placeholder-actions">
              {sections.value.map((s) => (
                <button key={s.name} class="btn btn--primary" onClick={() => void createIn(s.name)}>
                  Create a new {s.name === "posts" ? "blog post" : "note"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div class="doc">
            <DocHeader page={page} section={section} />
            <Editor page={page} sections={sections.value} />
            <TagFooter page={page} section={section} />
          </div>
        )}
      </main>

      <aside class="dock">
        <nav class="dock-tabs">
          {(["preview", "links", "images", "terminal"] as DockTab[]).map((name) => (
            <button key={name} class={tab === name ? "is-active" : ""} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </nav>

        <div class="dock-body">
          <div class="dock-pane" hidden={tab !== "preview"}>
            {page ? <Preview page={page} /> : <p class="empty">Open a page to preview it.</p>}
          </div>

          <div class="dock-pane" hidden={tab !== "links"}>
            {page ? <Links page={page} /> : <p class="empty">Open a page to see its links.</p>}
          </div>

          <div class="dock-pane" hidden={tab !== "images"}>
            {page ? <Images page={page} /> : <p class="empty">Open a page to see its images.</p>}
          </div>

          <div class="dock-pane dock-pane--fill" hidden={tab !== "terminal"}>
            {terminalUsed && <Terminal visible={tab === "terminal"} />}
          </div>
        </div>
      </aside>

      <Dialogs />
    </div>
  );
}
