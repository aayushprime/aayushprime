/**
 * The one path the editor owns.
 *
 * Everything else on the editor's port is a transparent mirror of Hugo, so
 * the split has to be unambiguous. A page URL cannot begin with an underscore
 * — slugs are `^[a-z0-9][a-z0-9-]*$` (see content/paths.ts), and Hugo's own
 * generated paths are all section or taxonomy names — so this prefix is
 * unreachable as site content and needs no escaping or reservation elsewhere.
 */
export const EDITOR_PATH = "/__studio";

/**
 * Whether a request URL belongs to the editor rather than to the site.
 *
 * Matches the prefix itself and anything beneath it, but not a path that
 * merely starts with the same characters: `/__studioish/` is a site path.
 */
export function isEditorPath(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path === EDITOR_PATH || path.startsWith(`${EDITOR_PATH}/`);
}
