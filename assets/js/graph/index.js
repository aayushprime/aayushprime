/* Entry point. Finds every [data-graph] mount on the page and starts it.
 *
 * The graph is strictly an enhancement: the readable fallback lists are rendered
 * server-side and never removed, so a failed fetch or a JS error costs the reader
 * nothing but the picture. */

import { loadGraph } from './data.js';
import { initExplorer } from './explorer.js';
import { initMini } from './mini.js';

function initMount(mount) {
  if (mount.dataset.graphReady) return;
  mount.dataset.graphReady = '1';

  const src = mount.dataset.graphSrc;
  if (!src) return;
  const status = mount.querySelector('[data-graph-status]');

  loadGraph(src)
    .then((index) => {
      // Closed again while the fetch was in flight. A hidden element measures
      // 0×0, so laying out now would produce a collapsed graph — drop the ready
      // flag and let the next open try again against the cached response.
      if (mount.hidden) {
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

function boot() {
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
