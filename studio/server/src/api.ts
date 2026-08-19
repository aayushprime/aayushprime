import { readFile } from "node:fs/promises";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { isSectionName, sectionDef, type SectionName, type SiteConfig } from "./config.ts";
import type { Hugo } from "./hugo.ts";
import type { ContentIndex, ContentEntry } from "./content/index.ts";
import { listImages, removeImage, saveImage } from "./content/images.ts";
import {
  createPage,
  duplicatePage,
  removePage,
  renamePage,
  saveBody,
  saveFields,
} from "./content/ops.ts";
import { getField, parseFile } from "./content/parse.ts";
import { contentPath } from "./content/paths.ts";
import { renameTag, removeTag } from "./content/tags.ts";

/** Thrown for anything the caller could fix by asking differently. */
class BadRequest extends Error {
  status = 400;
}

function section(req: Request): SectionName {
  const value = String(req.params.section);
  if (!isSectionName(value)) throw new BadRequest(`unknown section ${value}`);
  return value;
}

function slug(req: Request): string {
  return String(req.params.slug);
}

/** The list shape the sidebar renders — deliberately without page bodies. */
function summarize(entry: ContentEntry) {
  return {
    section: entry.section,
    slug: entry.slug,
    title: entry.title,
    date: entry.date,
    draft: entry.draft,
    tags: entry.tags,
    mtime: entry.mtime,
  };
}

/**
 * The declared fields of a page, read back from disk.
 *
 * Returned after a write as well as on load: an edit can change keys other
 * than the one that was sent — clearing a cover removes the whole `cover` map,
 * so `cover.image` disappears with it — and the client cannot work that out by
 * merging the request into what it already had.
 */
async function readFields(
  cfg: SiteConfig,
  section: SectionName,
  path: string,
): Promise<{ fields: Record<string, unknown>; frontmatter: string; errors: string[] }> {
  const parsed = parseFile(await readFile(path, "utf8"));
  const fields: Record<string, unknown> = {};

  for (const field of sectionDef(cfg, section)?.fields ?? []) {
    const value = parsed.doc ? getField(parsed.doc, field.key) : undefined;
    if (value !== undefined) fields[field.key] = value;
  }

  return { fields, frontmatter: parsed.frontmatterText, errors: parsed.errors };
}

export function createApi(cfg: SiteConfig, index: ContentIndex, hugo: Hugo): Router {
  const api = Router();
  api.use(express.json({ limit: "4mb" }));

  api.get("/config", (_req, res) => {
    res.json({ root: cfg.root, sections: cfg.sections });
  });

  api.get("/pages", (req, res) => {
    const q = req.query;
    res.json(
      index
        .list({
          ...(typeof q.section === "string" && isSectionName(q.section) ? { section: q.section } : {}),
          ...(typeof q.tag === "string" && q.tag !== "" ? { tag: q.tag } : {}),
          ...(q.draft === "true" ? { draft: true } : q.draft === "false" ? { draft: false } : {}),
          ...(typeof q.q === "string" && q.q !== "" ? { query: q.q } : {}),
        })
        .map(summarize),
    );
  });

  api.get("/pages/:section/:slug", async (req, res) => {
    const sec = section(req);
    const entry = index.get(sec, slug(req));
    if (!entry) throw new BadRequest(`${sec}/${slug(req)} not found`);

    const parsed = parseFile(await readFile(entry.path, "utf8"));
    // Only the fields this section declares are surfaced as form values; the
    // raw block goes along too so nothing is hidden from the author.
    const { fields, errors } = await readFields(cfg, sec, entry.path);

    res.json({
      ...summarize(entry),
      fields,
      frontmatter: parsed.frontmatterText,
      frontmatterErrors: errors,
      body: parsed.body.replace(/^\n+/, ""),
      images: await listImages(cfg, sec, entry.slug),
      backlinks: index.backlinks(entry.slug).map(summarize),
      brokenLinks: index.brokenLinks(sec, entry.slug),
      outboundLinks: index.outboundLinks(sec, entry.slug),
      previewUrl: `/${sec}/${entry.slug}/`,
    });
  });

  api.post("/pages", async (req, res) => {
    const body = req.body as { section?: string; slug?: string; title?: string };
    if (!body.section || !isSectionName(body.section)) throw new BadRequest("section is required");
    if (!body.slug) throw new BadRequest("slug is required");

    res.json(
      await createPage(cfg, index, {
        section: body.section,
        slug: body.slug,
        ...(body.title ? { title: body.title } : {}),
      }),
    );
  });

  api.put("/pages/:section/:slug/body", async (req, res) => {
    const body = req.body as { body?: string };
    if (typeof body.body !== "string") throw new BadRequest("body is required");

    await saveBody(cfg, index, { section: section(req), slug: slug(req), body: body.body });
    res.json({ ok: true, mtime: index.get(section(req), slug(req))?.mtime ?? null });
  });

  api.put("/pages/:section/:slug/fields", async (req, res) => {
    const body = req.body as { fields?: Record<string, unknown> };
    if (!body.fields || typeof body.fields !== "object") throw new BadRequest("fields is required");

    const sec = section(req);
    await saveFields(cfg, index, { section: sec, slug: slug(req), fields: body.fields });

    const entry = index.get(sec, slug(req))!;
    const { fields, frontmatter, errors } = await readFields(cfg, sec, entry.path);
    res.json({ ok: true, entry: summarize(entry), fields, frontmatter, frontmatterErrors: errors });
  });

  api.post("/pages/:section/:slug/rename", async (req, res) => {
    const body = req.body as { newSlug?: string };
    if (!body.newSlug) throw new BadRequest("newSlug is required");

    res.json(await renamePage(cfg, index, { section: section(req), slug: slug(req), newSlug: body.newSlug }));
  });

  api.post("/pages/:section/:slug/duplicate", async (req, res) => {
    const body = req.body as { newSlug?: string; title?: string };
    if (!body.newSlug) throw new BadRequest("newSlug is required");

    res.json(
      await duplicatePage(cfg, index, {
        section: section(req),
        slug: slug(req),
        newSlug: body.newSlug,
        ...(body.title ? { title: body.title } : {}),
      }),
    );
  });

  /** What deleting this page would break, so the client can say so first. */
  api.get("/pages/:section/:slug/impact", (req, res) => {
    const sec = section(req);
    res.json({
      backlinks: index.backlinks(slug(req)).map(summarize),
      images: [] as string[],
      path: contentPath(cfg, sec, slug(req)),
    });
  });

  api.delete("/pages/:section/:slug", async (req, res) => {
    await removePage(cfg, index, { section: section(req), slug: slug(req) });
    res.json({ ok: true });
  });

  api.get("/images/:section/:slug", async (req, res) => {
    res.json(await listImages(cfg, section(req), slug(req)));
  });

  api.post(
    "/images/:section/:slug",
    express.raw({ type: () => true, limit: "32mb" }),
    async (req, res) => {
      const data = req.body as Buffer;
      if (!Buffer.isBuffer(data) || data.length === 0) throw new BadRequest("empty upload");

      const filename = typeof req.query.filename === "string" ? req.query.filename : undefined;
      res.json(
        await saveImage(cfg, {
          section: section(req),
          slug: slug(req),
          data,
          ...(filename ? { filename } : {}),
          ...(req.headers["content-type"] ? { mimeType: req.headers["content-type"] } : {}),
        }),
      );
    },
  );

  api.delete("/images/:section/:slug/:filename", async (req, res) => {
    await removeImage(cfg, section(req), slug(req), String(req.params.filename));
    res.json({ ok: true });
  });

  api.get("/tags", (_req, res) => {
    res.json(index.tagCounts());
  });

  api.get("/tags/:tag/pages", (req, res) => {
    res.json(index.list({ tag: String(req.params.tag) }).map(summarize));
  });

  api.post("/tags/rename", async (req, res) => {
    const body = req.body as { from?: string; to?: string };
    if (!body.from || !body.to) throw new BadRequest("from and to are required");

    res.json(await renameTag(cfg, index, { from: body.from, to: body.to }));
  });

  api.delete("/tags/:tag", async (req, res) => {
    res.json(await removeTag(cfg, index, String(req.params.tag)));
  });

  api.get("/links/broken", (_req, res) => {
    res.json(index.allBrokenLinks());
  });

  api.get("/hugo", (_req, res) => {
    res.json(hugo.getStatus());
  });

  api.post("/hugo/restart", (_req, res) => {
    hugo.restart();
    res.json(hugo.getStatus());
  });

  api.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof BadRequest ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  });

  return api;
}
