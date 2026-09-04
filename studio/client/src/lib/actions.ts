import { api } from "./api.ts";
import { askConfirm, askText, validateSlug } from "./dialogs.ts";
import {
  current,
  filter,
  openDraft,
  openPage,
  refreshPages,
  refreshTags,
  setFilter,
} from "./store.ts";
import type { PageSummary, SectionName } from "./types.ts";

/**
 * Open an empty page in this section.
 *
 * Nothing is asked for and nothing is written yet: the file appears on the
 * first thing worth saving, named after the title if one has been typed by
 * then and `untitled` if the body got there first. See materialize() in
 * store.ts.
 */
export async function createIn(section: SectionName): Promise<void> {
  // Show the section the new page will land in, or it is composed against a
  // list that is filtered to something else and appears to have vanished.
  setFilter({ ...filter.value, section, draft: undefined, q: undefined });
  await openDraft(section);
}

export async function duplicatePage(page: PageSummary): Promise<void> {
  const slug = await askText({
    title: "Duplicate page",
    label: "New slug",
    initial: `${page.slug}-copy`,
    confirmLabel: "Duplicate",
    validate: validateSlug,
  });
  if (slug === null) return;

  await api.duplicatePage(page.section, page.slug, slug);
  await refreshPages();
  await openPage(page.section, slug);
}

export async function renamePage(page: PageSummary): Promise<void> {
  const slug = await askText({
    title: "Rename page",
    label: "New slug",
    initial: page.slug,
    confirmLabel: "Rename",
    validate: validateSlug,
  });
  if (slug === null || slug === page.slug) return;

  await api.renamePage(page.section, page.slug, slug);
  await refreshPages();
  await openPage(page.section, slug);
}

export async function deletePage(page: PageSummary): Promise<void> {
  const { backlinks } = await api.impact(page.section, page.slug);
  const images = await api.images(page.section, page.slug);

  const detail = [
    `content/${page.section}/${page.slug}.md`,
    ...(images.length > 0
      ? [`${images.length} image(s) in static/${page.section}/${page.slug}/`]
      : []),
    ...backlinks.map((b) => `“${b.title}” links here and will break`),
  ];

  const ok = await askConfirm({
    title: `Delete “${page.title}”?`,
    message:
      "This removes the file from disk. It is not staged in git, so it can still be recovered if it was committed.",
    detail,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;

  await api.deletePage(page.section, page.slug);
  if (current.value?.slug === page.slug && current.value.section === page.section) {
    current.value = null;
  }
  await refreshPages();
  await refreshTags();
}
