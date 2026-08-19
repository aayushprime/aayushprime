export type SectionName = "posts" | "notes";

export type FieldType = "text" | "date" | "boolean" | "tags" | "image";

/** Where a field is rendered. See the server's config.ts for the reasoning. */
export type FieldSlot = "title" | "cover" | "meta" | "tags" | "more";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  slot: FieldSlot;
  hint?: string;
};

export type SectionDef = {
  name: SectionName;
  label: string;
  archetype: string;
  resolvesBareLinks: boolean;
  inGraph: boolean;
  fields: FieldDef[];
};

export type StudioConfig = {
  root: string;
  sections: SectionDef[];
};

/** What the sidebar needs. Deliberately without page bodies. */
export type PageSummary = {
  section: SectionName;
  slug: string;
  title: string;
  date: string | null;
  draft: boolean;
  tags: string[];
  mtime: number;
};

export type ImageInfo = {
  filename: string;
  url: string;
  bytes: number;
  mtime: number;
};

export type Page = PageSummary & {
  fields: Record<string, unknown>;
  frontmatter: string;
  frontmatterErrors: string[];
  body: string;
  images: ImageInfo[];
  backlinks: PageSummary[];
  brokenLinks: string[];
  outboundLinks: string[];
  previewUrl: string;
};

export type TagCount = {
  tag: string;
  count: number;
  sections: SectionName[];
};

export type TagEdit = {
  changed: string[];
  skipped: { page: string; reason: string }[];
};

export type BrokenLink = {
  section: SectionName;
  slug: string;
  target: string;
};

export type HugoState = "starting" | "ready" | "failed" | "stopped";

export type HugoStatus = {
  state: HugoState;
  log: string[];
};

export type ContentEvent = {
  type: "content";
  kind: "add" | "change" | "unlink";
  section: SectionName;
  slug: string;
  external: boolean;
};

export type HugoEvent = { type: "hugo" } & HugoStatus;

export type ServerEvent = ContentEvent | HugoEvent;

export type SavedImage = {
  filename: string;
  url: string;
  markdown: string;
};

export function pageKey(section: SectionName, slug: string): string {
  return `${section}/${slug}`;
}
