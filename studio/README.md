# studio

A local editor for this Hugo site. It writes real markdown into `../content`,
files pasted images into `../static`, and leaves publishing to git.

The site stays a plain Hugo static build. Nothing here runs in production —
studio only produces the files Hugo builds from.

```
pnpm install
pnpm dev          # editor: http://localhost:4000/__studio/
                  # site:   http://localhost:1313/
pnpm stop         # stop the hugo server it leaves running
```

One command starts everything: the editor UI, the content API, a shell, and a
`hugo server`.

## Two addresses for one Hugo

`hugo server` runs with no `--baseURL`, so port 1313 is an ordinary, browsable
Hugo — open it, share it on your network, read the site on your phone. There is
no second Hugo to start, which matters: a preview-only baseURL used to make 1313
useless, so you would start your own `hugo server` alongside it, and one run of
that under `sudo` leaves root-owned files in `public/` that block every later
build.

Port 4000 is the editor. It claims exactly one prefix — `/__studio` — and
mirrors Hugo, verbatim and unprefixed, on everything else. A slug cannot begin
with an underscore, so the split can never collide with a page. The mirror is
what makes the preview frame same-origin, which is what lets the editor script
it at all; a cross-origin frame is an opaque rectangle.

Two things are rewritten on the way through, both the editor's business rather
than the site's: the editor's own scroll-keeping script is injected, and
LiveReload's port is repointed at the mirror — Hugo answers 403 to a LiveReload
socket whose `Origin` and `Host` disagree, so the frame has to dial the address
it was served from. The published site carries no trace of either.

`--renderToMemory` is passed as well, so no build — the studio's or one of your
own — ever writes `public/` again.

## Hugo outlives the editor

The server is spawned detached and recorded in `.hugo-studio.pid` with the flags
it was started under. Restart the studio and it adopts that process instead of
paying for a cold rebuild; the dev watcher restarts on every source edit, so
this is the common case, not the rare one. A server whose flags no longer match
is replaced rather than adopted.

Its output goes to `.hugo.log` rather than a pipe, because a pipe dies with its
parent. The editor tails that file, which is how a build error reaches the UI —
and how the state of an adopted server is recovered rather than guessed. Since
nothing kills it on exit, `pnpm stop` is how it ends.

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
- **Real preview** — the actual Hugo render, with your theme. LiveReload
  refreshes it when a build finishes, so it also follows changes the editor
  never saw: a layout edited in the terminal pane, or a `git checkout`.
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
  routes.ts       the one prefix the editor owns; everything else is Hugo
  hugo.ts         spawn detached, adopt, tail the log, mirror the site
  stop.ts         end the server the editor left running
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
| `STUDIO_HUGO_BIND` | `127.0.0.1` — set `0.0.0.0` to read the site from your phone |
| `STUDIO_SITE_ROOT` | the repository root |
| `STUDIO_SHELL` | `$SHELL` |

## Tests

```
pnpm test         # 112 tests
```

They cover the operations that can lose work — frontmatter round-tripping, path
mapping, link extraction, rename, tag edits, image collisions — against a
temporary fixture site, plus the two decisions that broke once: the flags Hugo
is started with, and which URLs belong to the editor rather than the site. The UI is checked by hand; a single-user local editor
does not earn a browser suite, but the file operations underneath it do.
