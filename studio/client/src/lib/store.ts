import { computed, signal } from "@preact/signals";
import { api, BASE } from "./api.ts";
import type {
  HugoStatus,
  Page,
  PageSummary,
  SectionName,
  ServerEvent,
  StudioConfig,
  TagCount,
} from "./types.ts";

export type Filter = {
  section?: SectionName;
  tag?: string;
  draft?: boolean;
  q?: string;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

/** How long typing has to pause before the file is written. */
const AUTOSAVE_MS = 600;

/**
 * Interface preferences, kept in localStorage so the editor opens the way it
 * was left. They are read once at module load; nothing else writes them.
 */
function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota; the preference just will not stick.
  }
}

export const sidebarOpen = signal(stored("studio.sidebarOpen", true));
export const dockOpen = signal(stored("studio.dockOpen", true));

/** Multiplier on the editor's base type size. */
export const textScale = signal(stored("studio.textScale", 1));

export const TEXT_SCALES = [0.85, 0.925, 1, 1.1, 1.25, 1.4] as const;

export function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
  persist("studio.sidebarOpen", sidebarOpen.value);
}

export function toggleDock(): void {
  dockOpen.value = !dockOpen.value;
  persist("studio.dockOpen", dockOpen.value);
}

export function stepTextScale(direction: 1 | -1): void {
  const at = TEXT_SCALES.indexOf(textScale.value as (typeof TEXT_SCALES)[number]);
  const from = at === -1 ? TEXT_SCALES.indexOf(1) : at;
  const next = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, from + direction))];
  if (next === undefined) return;
  textScale.value = next;
  persist("studio.textScale", next);
}

export const config = signal<StudioConfig | null>(null);
export const pages = signal<PageSummary[]>([]);
export const tags = signal<TagCount[]>([]);
export const filter = signal<Filter>({ section: "posts" });
export const current = signal<Page | null>(null);
export const view = signal<"editor" | "tags">("editor");

export const saveState = signal<SaveState>("idle");
export const saveError = signal<string | null>(null);
export const dirty = signal(false);

export const hugo = signal<HugoStatus>({ state: "starting", log: [] });
export const previewNonce = signal(0);
export const banner = signal<string | null>(null);

/**
 * Set when the open file changed on disk while it had unsaved edits — the one
 * case where the editor cannot silently pick a winner.
 */
export const conflict = signal(false);

export const sections = computed(() => config.value?.sections ?? []);

/**
 * The body as the editor currently has it.
 *
 * Held outside the signal graph on purpose: CodeMirror owns its own document,
 * and feeding every keystroke back through a signal would fight it for
 * control of the cursor.
 */
let bodyDraft: string | null = null;
let savedBody = "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function currentBody(): string {
  return bodyDraft ?? current.value?.body ?? "";
}

export async function loadConfig(): Promise<void> {
  config.value = await api.config();
}

export async function refreshPages(): Promise<void> {
  pages.value = await api.pages(filter.value);
}

export async function refreshTags(): Promise<void> {
  tags.value = await api.tags();
}

export function setFilter(next: Filter): void {
  filter.value = next;
  void refreshPages();
}

export async function openPage(section: SectionName, slug: string): Promise<void> {
  await flushSave();

  const page = await api.page(section, slug);
  current.value = page;
  bodyDraft = null;
  savedBody = page.body;
  dirty.value = false;
  conflict.value = false;
  saveState.value = "idle";
  saveError.value = null;
}

export async function reloadCurrent(): Promise<void> {
  const page = current.value;
  if (!page) return;

  const fresh = await api.page(page.section, page.slug);
  current.value = fresh;
  bodyDraft = null;
  savedBody = fresh.body;
  dirty.value = false;
  conflict.value = false;
}

export function closePage(): void {
  current.value = null;
  bodyDraft = null;
  savedBody = "";
  dirty.value = false;
}

export function editBody(text: string): void {
  bodyDraft = text;
  dirty.value = text !== savedBody;
  if (dirty.value) scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), AUTOSAVE_MS);
}

/** Write pending edits now. Safe to call when there is nothing to write. */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const page = current.value;
  if (!page || bodyDraft === null || bodyDraft === savedBody) return;

  const body = bodyDraft;
  saveState.value = "saving";

  try {
    await api.saveBody(page.section, page.slug, body);
    savedBody = body;
    dirty.value = bodyDraft !== savedBody;
    saveState.value = "saved";
    saveError.value = null;
  } catch (err) {
    saveState.value = "error";
    saveError.value = err instanceof Error ? err.message : String(err);
  }
}

export async function saveFields(fields: Record<string, unknown>): Promise<void> {
  const page = current.value;
  if (!page) return;

  saveState.value = "saving";

  try {
    const saved = await api.saveFields(page.section, page.slug, fields);
    // The field map comes back from disk rather than being merged in: removing
    // a key can take others with it, which a merge would not reflect.
    current.value = {
      ...page,
      ...saved.entry,
      fields: saved.fields,
      frontmatter: saved.frontmatter,
      frontmatterErrors: saved.frontmatterErrors,
    };
    saveState.value = "saved";
    saveError.value = null;
    void refreshPages();
    void refreshTags();
  } catch (err) {
    saveState.value = "error";
    saveError.value = err instanceof Error ? err.message : String(err);
  }
}

export function reloadPreview(): void {
  previewNonce.value++;
}

/** Insert text at the editor's cursor. Set by the Editor component on mount. */
export let insertAtCursor: (text: string) => void = () => {};

export function setInserter(fn: (text: string) => void): void {
  insertAtCursor = fn;
}

export function connectEvents(): () => void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${BASE}ws/events`;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    socket = new WebSocket(url);

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerEvent;

      if (message.type === "hugo") {
        hugo.value = { state: message.state, log: message.log };
        return;
      }

      void refreshPages();
      void refreshTags();

      const page = current.value;
      const isCurrent = page && page.section === message.section && page.slug === message.slug;
      if (!isCurrent || !message.external) return;

      // Someone edited this file outside the editor. If nothing here is
      // unsaved, take theirs; if something is, say so rather than pick.
      if (dirty.value) conflict.value = true;
      else void reloadCurrent();
    };

    socket.onclose = () => {
      if (closed) return;
      retry = setTimeout(connect, 1_000);
    };
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}
