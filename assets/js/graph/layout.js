/* d3-force wrapper.
 *
 * Only the layout maths comes from d3 — no d3-selection, no d3-zoom. Rendering,
 * panning and dragging are hand-written in render.js against real SVG elements,
 * which is what keeps every node a focusable, crawlable <a>. */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force';

import { nodeRadius } from './data.js';

/* Tag edges are deliberately weaker and longer than wikilinks. A tag with eight
 * notes on it would otherwise act like a spring clamp and drag unrelated notes
 * into one blob, drowning out the links that were actually authored. */
/* Distances are set by how much room a *label* needs, not a dot. Two linked notes
 * sitting 84px apart with 100px-wide labels overlap no matter how big the
 * collision radius is, because the link force wins. */
const EDGE = {
  wiki: { distance: 104, strength: 0.4 },
  tag: { distance: 142, strength: 0.07 },
};

/* Keeps every node inside the visible box.
 *
 * Without this, repulsion pushes the outer nodes past the edge of the stage and
 * they are simply gone until you think to pan — which nobody does, because there
 * is no hint anything is missing. A hard clamp guarantees the whole graph is
 * always on screen at rest; pan and zoom remain available for a closer look. */
function forceBounds(box) {
  let nodes = [];
  function force() {
    for (const n of nodes) {
      const r = nodeRadius(n);
      // Asymmetric, because a node's label hangs below its dot: padding that
      // clears the circle still lets the text underneath fall off the bottom
      // edge. Sideways padding is a compromise — a centred label is wider than
      // any sane clamp, so the longest few may still clip a little rather than
      // waste 60px of stage on both sides.
      const padX = r + 40;
      const padTop = r + 18;
      const padBottom = r + 34;
      n.x = Math.max(padX, Math.min(box.width - padX, n.x));
      n.y = Math.max(padTop, Math.min(box.height - padBottom, n.y));
    }
  }
  force.initialize = (n) => {
    nodes = n;
  };
  return force;
}

export function createLayout({ nodes, links, width, height, variant = 'explorer' }) {
  // d3 rewrites source/target into node references, so give it its own copies
  // and let the renderer read the resolved objects back off them.
  const simLinks = links.map((l) => ({ ...l }));

  const repel = variant === 'mini' ? -170 : -400;

  // Mutable so resize() can update the clamp without rebuilding the force.
  const box = { width, height };

  /* Seed positions BEFORE constructing the simulation.
   *
   * forceSimulation() initialises any node missing x/y with a phyllotaxis spiral
   * around the origin — that is, around the top-left corner of the viewBox — and
   * it skips nodes that already have coordinates. Seeding afterwards is a silent
   * no-op, which leaves the whole graph creeping in from the corner under the
   * weak centring force instead of opening out from the middle. */
  const r = Math.min(width, height) / 3;
  nodes.forEach((n, i) => {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) return;
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    n.x = width / 2 + Math.cos(a) * r;
    n.y = height / 2 + Math.sin(a) * r;
  });

  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(simLinks)
        .id((d) => d.id)
        .distance((l) => (EDGE[l.kind] || EDGE.wiki).distance)
        .strength((l) => (EDGE[l.kind] || EDGE.wiki).strength),
    )
    .force('charge', forceManyBody().strength(repel).distanceMax(420))
    // Collision radius includes label room, so text has somewhere to sit. It
    // cannot prevent overlap outright — a label is far wider than any radius
    // worth using — but more slack means visibly fewer collisions. The compact
    // mini graph gets less, or five nodes would push each other into the walls.
    .force('collide', forceCollide((d) => nodeRadius(d) + (variant === 'mini' ? 16 : 26)))
    // forceX/forceY toward the middle rather than forceCenter: forceCenter
    // recentres the mean every tick, which fights dragging a node to the edge.
    .force('x', forceX(width / 2).strength(0.055))
    .force('y', forceY(height / 2).strength(0.055))
    // Runs last, so it has the final say on every position.
    .force('bounds', forceBounds(box))
    .stop();

  return {
    simulation: sim,
    links: simLinks,

    /* Animate to equilibrium, calling onTick after every step. */
    run(onTick) {
      sim.on('tick', onTick);
      sim.alpha(1).restart();
    },

    /* Jump straight to equilibrium with no visible motion — used for
     * prefers-reduced-motion, and for the mini graph, which is small enough that
     * watching it settle is noise rather than information. */
    settle(steps = 320) {
      sim.stop();
      sim.alpha(1);
      for (let i = 0; i < steps; i += 1) sim.tick();
    },

    /* Nudge the simulation after a drag or a filter change. */
    reheat(alpha = 0.35) {
      sim.alphaTarget(0).alpha(alpha).restart();
    },

    resize(w, h) {
      box.width = w;
      box.height = h;
      sim.force('x', forceX(w / 2).strength(0.055));
      sim.force('y', forceY(h / 2).strength(0.055));
    },

    stop() {
      sim.on('tick', null);
      sim.stop();
    },
  };
}
