import { computed, signal } from "@preact/signals";
import { api, BASE } from "./api.ts";
import { slugify, validateSlug } from "./dialogs.ts";
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

/**
 * Whether the open page is still only a buffer.
 *
 * `slug: ""` is the marker for a page with no file yet. createIn opens one so
 * the button lands straight in the editor with nothing to fill in first, and
 * materialize() writes the file on the first thing worth saving.
 */
export const pending = computed(() => current.value?.slug === "");

function blankPage(section: SectionName): Page {
  return {
    section,
    slug: "",
    title: "",
    date: null,
    draft: false,
    tags: [],
    mtime: 0,
    fields: {},
    frontmatter: "",
    frontmatterErrors: [],
    body: "",
    images: [],
    backlinks: [],
    brokenLinks: [],
    outboundLinks: [],
    previewUrl: "",
  };
}

export async function openDraft(section: SectionName): Promise<void> {
  await flushSave();

  current.value = blankPage(section);
  bodyDraft = null;
  savedBody = "";
  dirty.value = false;
  conflict.value = false;
  saveState.value = "idle";
  saveError.value = null;
}

/** Which field carries the page's name, per the section's own definition. */
function titleKey(section: SectionName): string | null {
  const def = sections.value.find((s) => s.name === section);
  return def?.fields.find((f) => f.slot === "title")?.key ?? null;
}

/**
 * A free `untitled` slug, for a page whose body was typed before its title.
 * The sidebar list is filtered, so the section is asked for outright.
 */
async function untitledSlug(section: SectionName): Promise<string> {
  const taken = new Set((await api.pages({ section })).map((p) => p.slug));
  for (let n = 1; ; n++) {
    const slug = n === 1 ? "untitled" : `untitled-${n}`;
    if (!taken.has(slug)) return slug;
  }
}

/**
 * Give the pending page a file.
 *
 * Both writers reach this: a title commit names the file after the title, and
 * a body keystroke that gets there first settles for `untitled`. They share
 * one in-flight promise, or a title landing at the same moment as an autosave
 * would create the page twice.
 */
let materializing: Promise<Page | null> | null = null;

function materialize(title: string): Promise<Page | null> {
  materializing ??= write(title).finally(() => {
    materializing = null;
  });
  return materializing;
}

async function write(title: string): Promise<Page | null> {
  const draft = current.value;
  if (!draft) return null;
  if (draft.slug !== "") return draft;

  const named = title.trim();
  const slug = named === "" ? await untitledSlug(draft.section) : slugify(named);
  if (validateSlug(slug) !== null) return null;

  await api.createPage(draft.section, slug, named === "" ? undefined : named);
  const fresh = await api.page(draft.section, slug);

  // Only the identity is adopted here. The body stays as typed and is written
  // by whoever called, so the archetype's own body cannot land on top of it.
  current.value = fresh;
  savedBody = fresh.body;

  // Show the section it landed in, or the page is created into a list filtered
  // to something else and appears to have vanished.
  setFilter({ ...filter.value, section: draft.section, draft: undefined, q: undefined });
  void refreshTags();
  return fresh;
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

  let page = current.value;
  if (!page || bodyDraft === null || bodyDraft === savedBody) return;

  const body = bodyDraft;
  saveState.value = "saving";

  try {
    if (page.slug === "") {
      // Typed into the body before naming it. Moving from the title box to the
      // editor blurs it, and blur commits, so by the time this runs the title
      // really was left empty and `untitled` is the honest name.
      const made = await materialize(page.title);
      if (!made) {
        saveState.value = "idle";
        return;
      }
      page = made;
    }

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
  let page = current.value;
  if (!page) return;

  if (page.slug === "") {
    // The only field a page without a file can offer is its name: the meta row
    // stays hidden until the archetype has supplied the rest.
    const key = titleKey(page.section);
    const name = key && typeof fields[key] === "string" ? (fields[key] as string).trim() : "";
    // A blurred but untouched title box should not conjure an `untitled` file.
    if (name === "") return;

    saveState.value = "saving";
    try {
      const made = await materialize(name);
      if (!made) {
        saveState.value = "idle";
        return;
      }
      page = made;
    } catch (err) {
      saveState.value = "error";
      saveError.value = err instanceof Error ? err.message : String(err);
      return;
    }
    // Fall through: creating the file named it, but an autosave that got here
    // first would have named it `untitled`, so the title is written either way.
  }

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
