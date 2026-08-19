import type {
  BrokenLink,
  HugoStatus,
  ImageInfo,
  Page,
  PageSummary,
  SavedImage,
  SectionName,
  StudioConfig,
  TagCount,
  TagEdit,
} from "./types.ts";

/** The server reports failures as `{ error }`; surface that rather than a status code. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Not JSON; the status line is all there is.
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function put(body: unknown): RequestInit {
  return { ...json(body), method: "PUT" };
}

export const api = {
  config: () => request<StudioConfig>("/config"),

  pages: (filter: { section?: string; tag?: string; draft?: boolean; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (filter.section) params.set("section", filter.section);
    if (filter.tag) params.set("tag", filter.tag);
    if (filter.draft !== undefined) params.set("draft", String(filter.draft));
    if (filter.q) params.set("q", filter.q);
    const qs = params.toString();
    return request<PageSummary[]>(`/pages${qs ? `?${qs}` : ""}`);
  },

  page: (section: SectionName, slug: string) => request<Page>(`/pages/${section}/${slug}`),

  createPage: (section: SectionName, slug: string, title?: string) =>
    request<{ section: SectionName; slug: string }>("/pages", json({ section, slug, title })),

  saveBody: (section: SectionName, slug: string, body: string) =>
    request<{ ok: true; mtime: number | null }>(`/pages/${section}/${slug}/body`, put({ body })),

  saveFields: (section: SectionName, slug: string, fields: Record<string, unknown>) =>
    request<{
      ok: true;
      entry: PageSummary;
      fields: Record<string, unknown>;
      frontmatter: string;
      frontmatterErrors: string[];
    }>(`/pages/${section}/${slug}/fields`, put({ fields })),

  renamePage: (section: SectionName, slug: string, newSlug: string) =>
    request<{ section: SectionName; slug: string }>(
      `/pages/${section}/${slug}/rename`,
      json({ newSlug }),
    ),

  duplicatePage: (section: SectionName, slug: string, newSlug: string, title?: string) =>
    request<{ section: SectionName; slug: string }>(
      `/pages/${section}/${slug}/duplicate`,
      json({ newSlug, title }),
    ),

  deletePage: (section: SectionName, slug: string) =>
    request<{ ok: true }>(`/pages/${section}/${slug}`, { method: "DELETE" }),

  impact: (section: SectionName, slug: string) =>
    request<{ backlinks: PageSummary[] }>(`/pages/${section}/${slug}/impact`),

  images: (section: SectionName, slug: string) =>
    request<ImageInfo[]>(`/images/${section}/${slug}`),

  uploadImage: (section: SectionName, slug: string, file: Blob, filename?: string) => {
    const qs = filename ? `?filename=${encodeURIComponent(filename)}` : "";
    return request<SavedImage>(`/images/${section}/${slug}${qs}`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
  },

  deleteImage: (section: SectionName, slug: string, filename: string) =>
    request<{ ok: true }>(`/images/${section}/${slug}/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    }),

  tags: () => request<TagCount[]>("/tags"),

  tagPages: (tag: string) => request<PageSummary[]>(`/tags/${encodeURIComponent(tag)}/pages`),

  renameTag: (from: string, to: string) => request<TagEdit>("/tags/rename", json({ from, to })),

  deleteTag: (tag: string) =>
    request<TagEdit>(`/tags/${encodeURIComponent(tag)}`, { method: "DELETE" }),

  brokenLinks: () => request<BrokenLink[]>("/links/broken"),

  hugo: () => request<HugoStatus>("/hugo"),

  restartHugo: () => request<HugoStatus>("/hugo/restart", { method: "POST" }),
};
