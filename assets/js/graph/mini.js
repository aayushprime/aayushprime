/* The compact, read-only graph — used two ways:
 *
 *   with data-graph-focus   one note's immediate neighbourhood (note pages)
 *   without it              the whole graph (the home page preview)
 *
 * No panel and no search either way; clicking a node just goes there. It settles
 * without animating, because a small layout finding its feet is fidget rather
 * than information, and both of these sit on a page someone is reading. */

import { subgraph } from './data.js';
import { createLayout } from './layout.js';
import { createRenderer } from './render.js';

export function initMini(mount, index) {
  const stage = mount.querySelector('[data-graph-stage]');
  if (!stage) return;

  const slug = mount.dataset.graphFocus;
  const focusId = slug ? `note:${slug}` : null;
  const graph = focusId ? subgraph(index, focusId, 1) : { nodes: index.nodes, links: index.links };

  // A lone dot says nothing the "Nothing links here yet" copy below does not
  // already say, so stay out of the way entirely.
  if (graph.nodes.length <= 1) {
    mount.hidden = true;
    return;
  }

  stage.classList.add('graph__stage--ready');

  const renderer = createRenderer(stage, { variant: 'mini' });
  const { width, height } = renderer.resize();

  const layout = createLayout({
    nodes: graph.nodes,
    links: graph.links,
    width,
    height,
    // The whole-graph preview needs the explorer's spacing; a five-node
    // neighbourhood would fly apart with it.
    variant: focusId ? 'mini' : 'explorer',
  });

  layout.settle();
  renderer.draw({ nodes: graph.nodes, links: layout.links });

  // Marks the current note as the anchor of its own neighbourhood.
  if (focusId) {
    renderer.setSelected(focusId);
    renderer.centreOn(focusId, { animate: false });
  }

  // Dragging is still allowed — it is the cheapest way to untangle a label —
  // so keep a tick handler wired up for when it reheats.
  layout.simulation.on('tick', () => renderer.tick());
  renderer.onDrag(() => layout.reheat(0.2));

  if (typeof ResizeObserver === 'function') {
    let last = `${width}x${height}`;
    const observer = new ResizeObserver(() => {
      const size = renderer.resize();
      const key = `${size.width}x${size.height}`;
      if (key === last) return;
      last = key;
      layout.resize(size.width, size.height);
      layout.settle(140);
      renderer.tick();
      if (focusId) renderer.centreOn(focusId, { animate: false });
    });
    observer.observe(stage);
  }
}
