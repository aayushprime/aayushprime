# studio

A local editor for this Hugo site. It writes real markdown into `../content`,
files pasted images into `../static`, and leaves publishing to git.

The site stays a plain Hugo static build. Nothing here runs in production —
studio only produces the files Hugo builds from.

```
pnpm install
pnpm dev          # http://localhost:4000
```

One command starts everything: the editor UI, the content API, a shell, and a
`hugo server` child that the editor proxies at `/preview`.

## What it does

- **Live-preview editing** — markdown renders in place; the line your cursor is
  on drops to raw source so you can edit it. Fenced code deliberately keeps its
  source visible. Text is set in the site's own faces at the site's own size
  and measure, so what you write looks like what gets published.
- **A thin document header** — the title, the cover beside it, and the date and
  draft toggle. Tags sit at the foot of the page. Everything else is behind
  "more". Both rails collapse, leaving nothing but the writing.
- **Image paste** — paste or drop into the editor. The file lands in
  `static/<section>/<slug>/` and the markdown reference is written at the
  cursor. Pictures draw above their markdown, which always stays visible and
  editable — change the path and the picture follows. The picture itself is
  inert, so clicking it cannot move the caret somewhere unexpected.
- **Wikilinks** — `[[` completes over note titles and slugs, and a backlinks
  panel shows what points here.
- **Tag manager** — rename or merge a tag across every file that carries it.
- **Real preview** — the actual Hugo render, with your theme, reloaded on save.
- **Terminal** — a shell in the site root, which is where you commit and push.

## Keys

| | |
| --- | --- |
| `⌘S` | write now, rather than waiting for autosave |
| `⌘\` | show/hide the sidebar |
| `⌘⇧\` | show/hide the preview rail |
| `⌘+` / `⌘-` | text size |
| `[[` | complete a note reference |

## Publishing

There isn't a publish button. Commits and pushes happen by hand in the terminal
pane, so git history stays something you author. Pushing `main` triggers
`.github/workflows/gh_pages.yml` as it always has.

## Conventions it follows

These are the site's existing conventions, not new ones:

| | |
| --- | --- |
| Pages | `content/posts/<slug>.md`, `content/notes/<slug>.md` — flat files |
| Images | `static/<section>/<slug>/<name>`, referenced as `/<section>/<slug>/<name>` |
| Slugs | `^[a-z0-9][a-z0-9-]*$` — the same shape the notes graph accepts as a link target |
| Taxonomy | `tags` only |
| New pages | rendered from `archetypes/post.md` and `archetypes/notes.md` |

## Which frontmatter the editor offers

Only keys the theme still reads. A post gets `title`, `date`, `draft`, `tags`
and `cover.image` up front, with `cover.alt`, `cover.caption`, `cover.hidden`,
`ShowToc`, `ShowBreadCrumbs` and `searchHidden` behind "more". Notes have no
cover or layout switches, so they get the common five.

Three keys the archetypes still write are deliberately **not** offered, because
nothing in `layouts/` reads them: `TocOpen`, `cover.linkFullImages` and
`cover.responsiveImages` — the latter two only appear in
`layouts/_partials/cover.html`, which is never invoked. `cover.relative` is
also hidden: it only affects the OpenGraph and schema templates, and it must
stay false while covers are written as site-absolute paths, which is what the
editor does.

Files that already carry those keys keep them. The editor never rewrites a key
it does not show.

## Things worth knowing

**Frontmatter is preserved, not reformatted.** A file you only open is written
back byte for byte. A file whose fields you edit keeps its comments, key order,
quoting, four-space `cover:` nesting and flow-style `tags: [a, b]`; the only
change is that trailing whitespace on edited lines goes away. A file whose YAML
does not parse is shown read-only and never rewritten — repairing it by
guessing is how content gets destroyed.

**Backlinks match the site exactly.** `server/src/content/links.ts` is a port of
`layouts/_partials/graph/topology.html`, down to the regexes and the rule that
code spans are stripped before matching. A test builds the site and asserts the
editor derives the same edge set as `/notes/graph.json`, so the panel cannot
quietly drift from what the site renders.

**Rename rewrites references.** Renaming a page moves its markdown and its image
directory, repoints its own image URLs, and rewrites inbound `[[links]]` in
other notes — preserving labels, and skipping anything inside a code sample.

**External edits are noticed.** Edit a file in vim and the editor reloads it. If
you had unsaved changes, it says so and lets you choose instead of picking for
you. Because macOS fsevents drops the occasional notification, the index also
reconciles against disk every few seconds, so a missed event costs a few
seconds of staleness rather than lasting until restart.

## Layout

```
server/src/
  index.ts        bootstrap: config → hugo → routes → listen
  config.ts       site root, ports, section and field definitions
  hugo.ts         spawn, supervise, proxy, asset fallback
  pty.ts          terminal bridge
  api.ts          HTTP routes
  content/
    parse.ts      frontmatter ↔ body, comment-preserving YAML
    paths.ts      slug ↔ content path ↔ static image dir
    links.ts      wikilink extraction, ported from the site's template
    index.ts      in-memory index, watch + reconcile
    ops.ts        create / duplicate / rename / delete
    images.ts     paste, naming, collisions
    tags.ts       rename and merge across files
client/src/
  editor/         CodeMirror: live preview, wikilinks, image paste, theme
  panels/         sidebar, properties, tags, preview, links, images, terminal
  lib/            api client, store, dialogs
```

`paths.ts` is the only module that knows the `content/` ↔ `static/`
correspondence; everything that touches both trees goes through it.

## Configuration

| Variable | Default |
| --- | --- |
| `STUDIO_PORT` | `4000` |
| `STUDIO_HUGO_PORT` | `1313` |
| `STUDIO_SITE_ROOT` | the repository root |
| `STUDIO_SHELL` | `$SHELL` |

## Tests

```
pnpm test         # 100 tests
```

They cover the operations that can lose work — frontmatter round-tripping, path
mapping, link extraction, rename, tag edits, image collisions — against a
temporary fixture site. The UI is checked by hand; a single-user local editor
does not earn a browser suite, but the file operations underneath it do.
