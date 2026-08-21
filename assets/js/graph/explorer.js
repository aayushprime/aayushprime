/* Full-page explorer: search, tag toggle, hover dimming, selection panel. */

import { createLayout } from './layout.js';
import { createRenderer } from './render.js';
import { createPanel } from './panel.js';

export function initExplorer(mount, index) {
  const stage = mount.querySelector('[data-graph-stage]');
  const toolbar = mount.querySelector('[data-graph-toolbar]');
  const search = mount.querySelector('[data-graph-search]');
  const tagsToggle = mount.querySelector('[data-graph-tags]');
  const resetButton = mount.querySelector('[data-graph-reset]');
  const panelEl = mount.querySelector('[data-graph-panel]');
  const status = mount.querySelector('[data-graph-status]');

  if (!stage) return;

  if (!index.nodes.length) {
    if (status) {
      status.textContent = 'No notes yet — the graph fills in as notes get written.';
      status.hidden = false;
    }
    return;
  }

  if (toolbar) toolbar.hidden = false;
  stage.classList.add('graph__stage--ready');

  const renderer = createRenderer(stage, {
    variant: 'explorer',
    onActivate: (node) => (node ? select(node.id) : clear()),
  });

  const { width, height } = renderer.resize();
  const layout = createLayout({
    nodes: index.nodes,
    links: index.links,
    width,
    height,
    variant: 'explorer',
  });

  renderer.draw({ nodes: index.nodes, links: layout.links });

  const panel = panelEl ? createPanel(panelEl, index, { onSelect: select }) : null;

  const tick = () => renderer.tick();
  layout.simulation.on('tick', tick);
  renderer.onDrag(() => layout.reheat(0.2));

  // Watching a layout settle is the clearest way to read its clusters, but it is
  // also unsolicited motion — so honour the OS setting and jump to equilibrium.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
    layout.settle();
    renderer.tick();
  } else {
    layout.run(tick);
  }

  /* How much of the stage's right edge the panel is covering, if any. Zero when
   * the panel sits underneath the graph instead of over it (below 48rem). */
  function panelInset() {
    if (!panelEl || panelEl.hidden) return 0;
    if (getComputedStyle(panelEl).position !== 'absolute') return 0;
    return panelEl.offsetWidth + 24;
  }

  function select(id) {
    const node = index.byId.get(id);
    if (!node) return;
    renderer.setSelected(id);
    if (panel) panel.show(node);
    // Show first, measure second — the inset depends on the panel being visible.
    renderer.nudgeIntoView(id, { insetRight: panelInset() });
  }

  function clear() {
    renderer.setSelected(null);
    if (panel) panel.hide();
    renderer.restoreView();
  }

  if (search) {
    search.addEventListener('input', () => renderer.setFilter(search.value));
    search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        search.value = '';
        renderer.setFilter('');
      }
    });
  }

  if (tagsToggle) {
    tagsToggle.addEventListener('change', () => renderer.setTagsVisible(tagsToggle.checked));
  }

  renderer.setTagsVisible(false);
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      if (search) search.value = '';
      if (tagsToggle) tagsToggle.checked = false;
      renderer.setFilter('');
      renderer.setTagsVisible(false);
      renderer.resetView();
      clear();
      layout.reheat(0.5);
    });
  }

  mount.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') clear();
  });

  // Re-centre the pull-to-middle forces when the stage changes size, otherwise
  // the graph drifts into a corner after a window resize or orientation change.
  if (typeof ResizeObserver === 'function') {
    let last = `${width}x${height}`;
    const observer = new ResizeObserver(() => {
      const size = renderer.resize();
      const key = `${size.width}x${size.height}`;
      if (key === last) return;
      last = key;
      layout.resize(size.width, size.height);
      layout.reheat(0.25);
    });
    observer.observe(stage);
  }
}
