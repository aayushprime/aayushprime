/* Entry point. Finds every [data-graph] mount on the page and starts it.
 *
 * The graph is strictly an enhancement: the readable fallback lists are rendered
 * server-side and never removed, so a failed fetch or a JS error costs the reader
 * nothing but the picture. */

import { loadGraph } from './data.js';
import { initExplorer } from './explorer.js';
import { initMini } from './mini.js';

/* Whether the note page's related section is open, remembered across notes. */
const RELATED_KEY = 'pref-notes-related';

const readPref = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode, quota, disabled storage — the toggle still works, it just
       will not be remembered. */
  }
};

/* Laying the graph out while it is not being rendered produces a collapsed,
   zero-size result, so callers must wait for it to be revealed and re-init.
 *
 * The closed-<details> case is asked about directly rather than inferred from
 * geometry: current Chrome renders closed disclosure content with
 * `content-visibility: hidden` instead of `display: none`, so the stage still
 * reports a plausible non-zero width and a width test silently passes. */
function renderable(mount) {
  if (mount.hidden) return false;
  const disclosure = mount.closest('details');
  if (disclosure && !disclosure.open) return false;
  const stage = mount.querySelector('[data-graph-stage]');
  return !!stage && stage.clientWidth > 0;
}

function initMount(mount) {
  if (mount.dataset.graphReady) return;
  if (!renderable(mount)) return;
  mount.dataset.graphReady = '1';

  const src = mount.dataset.graphSrc;
  if (!src) return;
  const status = mount.querySelector('[data-graph-status]');

  loadGraph(src)
    .then((index) => {
      // Hidden again while the fetch was in flight. Drop the ready flag so the
      // next reveal retries against the cached response.
      if (!renderable(mount)) {
        delete mount.dataset.graphReady;
        return;
      }
      // "preview" and "mini" are the same read-only renderer; they differ only
      // in whether a focus node is set and in stage height (see graph.css).
      const variant = mount.dataset.graphVariant;
      if (variant === 'mini' || variant === 'preview') initMini(mount, index);
      else initExplorer(mount, index);
    })
    .catch((error) => {
      if (status) {
        status.textContent = 'Could not load the graph — the list below has everything in it.';
        status.hidden = false;
      }
      console.error('notes graph:', error);
    });
}

function initInside(root) {
  for (const mount of root.querySelectorAll('[data-graph]')) initMount(mount);
}

/* A collapsed mount is not fetched or laid out until someone asks for it, so
   /notes/ costs nothing extra for readers who only want the list. */
function wireToggle(button) {
  const mount = document.getElementById(button.getAttribute('aria-controls'));
  if (!mount) return;

  const wrap = button.closest('[data-graph-toggle-wrap]');
  if (wrap) wrap.hidden = false;

  const setLabel = (open) => {
    const next = open ? button.dataset.graphLabelOpen : button.dataset.graphLabelClosed;
    if (next) button.textContent = next;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const open = ({ scroll = false } = {}) => {
    mount.hidden = false;
    setLabel(true);
    initMount(mount);
    if (scroll) mount.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const close = () => {
    mount.hidden = true;
    setLabel(false);
  };

  button.addEventListener('click', () => (mount.hidden ? open() : close()));

  // Deep link: /notes/#graph arrives with the graph open. The browser cannot
  // scroll to a hidden element itself, so do it here once it is visible.
  if (window.location.hash === `#${mount.id}`) open({ scroll: true });
}

/* The note page's "Show related" <details>.
 *
 * Toggling is native, so it works without JS. This adds persistence — the choice
 * carries from one note to the next, which matters because someone who wants the
 * connections wants them on every note, not once — and lazily lays out the graph
 * inside on first open. */
function wireRelated(details) {
  if (readPref(RELATED_KEY) === '1') details.open = true;

  details.addEventListener('toggle', () => {
    writePref(RELATED_KEY, details.open ? '1' : '0');
    if (details.open) initInside(details);
  });

  if (details.open) initInside(details);
}

function boot() {
  for (const details of document.querySelectorAll('[data-related]')) wireRelated(details);
  for (const button of document.querySelectorAll('[data-graph-toggle]')) wireToggle(button);

  for (const mount of document.querySelectorAll('[data-graph]')) {
    if (mount.hasAttribute('data-graph-collapsed')) continue;
    initMount(mount);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
