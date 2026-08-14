/* The explorer's detail panel.
 *
 * Everything in here is a real anchor. Clicking one selects that node in the
 * graph instead of navigating, so a browsing session is not ended by every
 * click — but the href is genuine, so ctrl/cmd/middle-click still opens it, and
 * the "Open" action at the bottom always navigates. */

const CHIP =
  'inline-flex items-center rounded-4xl border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground';
const ROW =
  'block py-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline decoration-from-font';

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function createPanel(root, index, { onSelect } = {}) {
  function linkRow(node) {
    const a = h('a', ROW, node.type === 'tag' ? `#${node.title.toLowerCase()}` : node.title);
    a.href = node.url;
    a.addEventListener('click', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      ev.preventDefault();
      if (onSelect) onSelect(node.id);
    });
    return a;
  }

  function section(heading, items) {
    if (!items.length) return null;
    const wrap = h('div', 'flex flex-col gap-0.5 pt-3');
    wrap.append(h('h4', 'text-xs font-medium tracking-wide text-foreground', heading));
    const list = h('div', 'flex flex-col divide-y divide-border/50');
    for (const item of items) list.append(linkRow(item));
    wrap.append(list);
    return wrap;
  }

  function resolve(ids) {
    return ids.map((id) => index.byId.get(id)).filter(Boolean);
  }

  function renderNote(node) {
    const frag = document.createDocumentFragment();

    frag.append(h('p', 'text-xs tracking-wide text-muted-foreground', 'Note'));
    frag.append(h('h3', 'pt-0.5 text-lg font-medium leading-snug text-pretty', node.title));
    if (node.date) {
      frag.append(h('p', 'pt-0.5 text-xs text-muted-foreground tabular-nums', formatDate(node.date)));
    }
    if (node.excerpt) {
      frag.append(
        h('p', 'pt-2 text-sm leading-relaxed text-pretty text-muted-foreground', node.excerpt),
      );
    }

    const tags = resolve(index.tagsOf.get(node.id) || []);
    if (tags.length) {
      const row = h('div', 'flex flex-wrap gap-1.5 pt-3');
      for (const tag of tags) {
        const chip = h('a', CHIP, `#${tag.title.toLowerCase()}`);
        chip.href = tag.url;
        chip.addEventListener('click', (ev) => {
          if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
          ev.preventDefault();
          if (onSelect) onSelect(tag.id);
        });
        row.append(chip);
      }
      frag.append(row);
    }

    const out = section('Links from this note', resolve(index.wikiOut.get(node.id) || []));
    const back = section('Linked from', resolve(index.wikiIn.get(node.id) || []));
    if (out) frag.append(out);
    if (back) frag.append(back);
    if (!out && !back) {
      frag.append(
        h('p', 'pt-3 text-sm text-muted-foreground', 'No note links yet — only tags connect this one.'),
      );
    }

    return frag;
  }

  function renderTag(node) {
    const frag = document.createDocumentFragment();
    frag.append(h('p', 'text-xs tracking-wide text-muted-foreground', 'Tag'));
    frag.append(
      h('h3', 'pt-0.5 text-lg font-medium leading-snug', `#${node.title.toLowerCase()}`),
    );

    const notes = resolve([...(index.neighbours.get(node.id) || [])]).filter(
      (n) => n.type === 'note',
    );
    frag.append(
      h(
        'p',
        'pt-0.5 text-xs text-muted-foreground tabular-nums',
        `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`,
      ),
    );

    const noteSection = section('Notes', notes);
    if (noteSection) frag.append(noteSection);

    // The one bridge from the notes graph to the blog.
    if (node.posts && node.posts.length) {
      const wrap = h('div', 'flex flex-col gap-0.5 pt-3');
      wrap.append(h('h4', 'text-xs font-medium tracking-wide text-foreground', 'Blog posts'));
      const list = h('div', 'flex flex-col divide-y divide-border/50');
      for (const post of node.posts) {
        const a = h('a', ROW, post.title);
        a.href = post.url;
        list.append(a); // real navigation — posts are not in the graph
      }
      wrap.append(list);
      frag.append(wrap);
    }

    return frag;
  }

  function footer(node) {
    const wrap = h('div', 'flex items-center gap-3 border-t pt-3 mt-3');
    const open = h(
      'a',
      'inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline decoration-from-font',
      node.type === 'tag' ? 'Open tag page' : 'Open note',
    );
    open.href = node.url;
    wrap.append(open);
    return wrap;
  }

  return {
    show(node) {
      root.replaceChildren();
      const body = h('div', 'flex flex-col');
      body.append(node.type === 'tag' ? renderTag(node) : renderNote(node));
      body.append(footer(node));
      root.append(body);
      root.hidden = false;
    },

    hide() {
      root.hidden = true;
      root.replaceChildren();
    },

    get element() {
      return root;
    },
  };
}
