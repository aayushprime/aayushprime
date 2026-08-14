/* SVG renderer: nodes are real <a> elements.
 *
 * That is the whole reason this is not a canvas. Every node is focusable, has an
 * accessible name, carries a crawlable href, and inherits the site's colour
 * tokens through CSS — so light/dark and the dimming transitions are stylesheet
 * concerns rather than a second palette hardcoded in JS.
 *
 * Pan, zoom and drag are hand-rolled on pointer events. d3-zoom would pull in
 * d3-selection for behaviour we need about sixty lines of. */

import { nodeRadius } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const LABEL_MAX = 24;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3.5;
const DRAG_SLOP = 4; // px of movement before a press stops counting as a click

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function labelFor(node, max = LABEL_MAX) {
  const text = node.type === 'tag' ? `#${node.title.toLowerCase()}` : node.title;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function createRenderer(stage, options = {}) {
  const { variant = 'explorer', onActivate, onHover } = options;

  const svg = el('svg', {
    class: 'graph__svg',
    role: 'group',
    'aria-label': stage.getAttribute('aria-label') || 'Notes graph',
  });
  const viewport = el('g', { class: 'graph__viewport' });
  const linkLayer = el('g', { class: 'graph__links' });
  const nodeLayer = el('g', { class: 'graph__nodes' });
  viewport.append(linkLayer, nodeLayer);
  svg.append(viewport);
  stage.replaceChildren(svg);

  let width = stage.clientWidth || 640;
  let height = stage.clientHeight || 420;
  let view = { k: 1, x: 0, y: 0 };

  let nodes = [];
  let links = [];
  const nodeEls = new Map(); // id -> { group, dot, label }
  const linkEls = []; // { line, link }

  let focusId = null;
  let selectedId = null;
  let filter = '';
  let tagsVisible = true;
  let onDragMove = null;
  // Where the view was before the panel nudged it aside; null when un-nudged.
  let savedView = null;

  function applyView() {
    viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  }

  function setViewBox() {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  setViewBox();
  applyView();

  /* ---- drawing ---------------------------------------------------------- */

  function draw(graph) {
    nodes = graph.nodes;
    links = graph.links;
    nodeEls.clear();
    linkEls.length = 0;
    linkLayer.replaceChildren();
    nodeLayer.replaceChildren();

    for (const link of links) {
      const line = el('line', { class: `graph__link graph__link--${link.kind}` });
      linkLayer.append(line);
      linkEls.push({ line, link });
    }

    for (const node of nodes) {
      const group = el('a', {
        class: 'graph__node',
        href: node.url,
        'data-id': node.id,
        'data-type': node.type,
      });

      const full = node.type === 'tag' ? `#${node.title.toLowerCase()}` : node.title;
      // Phone-width stages cannot fit a 24-character centred label at all.
      const short = labelFor(node, width < 520 ? 16 : LABEL_MAX);
      // The <a> gets an explicit name because the visible <text> may be elided.
      group.setAttribute('aria-label', full);

      const title = el('title');
      title.textContent = full;

      const dot = el('circle', { class: 'graph__dot', r: nodeRadius(node) });
      const label = el('text', {
        class: 'graph__label',
        y: nodeRadius(node) + 13,
        'text-anchor': 'middle',
      });
      label.textContent = short;

      group.append(title, dot, label);
      nodeLayer.append(group);
      nodeEls.set(node.id, { group, dot, label, halfWidth: 0, anchor: 'middle' });

      bindNode(group, node);
    }

    // Measure once, now that the text is in the document. Used by tick() to flip
    // labels away from the stage edges instead of letting them clip.
    for (const [, entry] of nodeEls) {
      try {
        entry.halfWidth = entry.label.getComputedTextLength() / 2;
      } catch {
        entry.halfWidth = (entry.label.textContent.length * 5) / 2;
      }
    }

    // Labels get crowded fast; past this many nodes only the hovered,
    // selected and neighbouring labels are shown (see graph.css).
    svg.classList.toggle('graph__svg--crowded', nodes.length > 55);

    tick();
    applyStates();
  }

  function tick() {
    for (const { line, link } of linkEls) {
      line.setAttribute('x1', link.source.x);
      line.setAttribute('y1', link.source.y);
      line.setAttribute('x2', link.target.x);
      line.setAttribute('y2', link.target.y);
    }
    for (const node of nodes) {
      const entry = nodeEls.get(node.id);
      if (!entry) continue;
      entry.group.setAttribute('transform', `translate(${node.x} ${node.y})`);

      /* A centred label is wider than any bounds padding worth spending stage on,
       * so near an edge the label is anchored away from it instead — it grows
       * inward from the node rather than symmetrically through the wall. */
      const pad = 6;
      let anchor = 'middle';
      if (node.x - entry.halfWidth < pad) anchor = 'start';
      else if (node.x + entry.halfWidth > width - pad) anchor = 'end';
      if (anchor !== entry.anchor) {
        entry.anchor = anchor;
        entry.label.setAttribute('text-anchor', anchor);
      }
    }
  }

  /* ---- state: dimming, selection, filtering ----------------------------- */

  function neighbourhood(id) {
    const lit = new Set([id]);
    for (const { link } of linkEls) {
      if (link.source.id === id) lit.add(link.target.id);
      else if (link.target.id === id) lit.add(link.source.id);
    }
    return lit;
  }

  function matches(node) {
    if (!tagsVisible && node.type === 'tag') return false;
    if (!filter) return true;
    return node.search.includes(filter);
  }

  function applyStates() {
    const anchor = focusId || selectedId;
    const lit = anchor ? neighbourhood(anchor) : null;

    for (const node of nodes) {
      const entry = nodeEls.get(node.id);
      if (!entry) continue;
      const visible = matches(node);
      const dim = visible && lit ? !lit.has(node.id) : false;

      entry.group.setAttribute('data-hidden', visible ? 'false' : 'true');
      entry.group.setAttribute('data-dim', dim ? 'true' : 'false');
      entry.group.setAttribute('data-selected', node.id === selectedId ? 'true' : 'false');
      entry.group.setAttribute('data-anchor', node.id === anchor ? 'true' : 'false');
      // A hidden node must also leave the tab order, or filtering would leave
      // invisible stops behind.
      if (visible) entry.group.removeAttribute('tabindex');
      else entry.group.setAttribute('tabindex', '-1');
    }

    for (const { line, link } of linkEls) {
      const endsVisible =
        matches(link.source) && matches(link.target);
      const inLit = lit ? lit.has(link.source.id) && lit.has(link.target.id) : true;
      line.setAttribute('data-hidden', endsVisible ? 'false' : 'true');
      line.setAttribute('data-dim', endsVisible && lit && !inLit ? 'true' : 'false');
    }

    svg.setAttribute('data-anchored', anchor ? 'true' : 'false');
  }

  /* ---- interaction ------------------------------------------------------ */

  function animateTo(target, { animate = true } = {}) {
    if (!animate) {
      view = { ...target };
      applyView();
      return;
    }
    const from = { ...view };
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 300);
      const e = 1 - (1 - t) ** 3; // ease-out cubic
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      applyView();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Ease the view so a node sits in the middle of the stage. */
  function centreOn(id, options = {}) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    animateTo(
      { k: view.k, x: width / 2 - node.x * view.k, y: height / 2 - node.y * view.k },
      options,
    );
  }

  function toGraph(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    // The viewBox maps 1:1 to CSS pixels, so only the pan/zoom transform and the
    // element offset need undoing.
    const sx = ((clientX - rect.left) / rect.width) * width;
    const sy = ((clientY - rect.top) / rect.height) * height;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  }

  function bindNode(group, node) {
    group.addEventListener('pointerenter', () => {
      focusId = node.id;
      applyStates();
      if (onHover) onHover(node);
    });
    group.addEventListener('pointerleave', () => {
      if (focusId === node.id) focusId = null;
      applyStates();
      if (onHover) onHover(null);
    });
    group.addEventListener('focus', () => {
      focusId = node.id;
      applyStates();
    });
    group.addEventListener('blur', () => {
      if (focusId === node.id) focusId = null;
      applyStates();
    });

    group.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation(); // do not start a background pan
      let moved = false;
      const start = { x: ev.clientX, y: ev.clientY };
      group.setPointerCapture(ev.pointerId);

      const move = (e) => {
        if (
          !moved &&
          Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_SLOP
        ) {
          return;
        }
        moved = true;
        const p = toGraph(e.clientX, e.clientY);
        node.fx = p.x;
        node.fy = p.y;
        if (onDragMove) onDragMove();
      };

      const up = () => {
        group.removeEventListener('pointermove', move);
        group.removeEventListener('pointerup', up);
        group.removeEventListener('pointercancel', up);
        node.fx = null;
        node.fy = null;
        // Suppress the click that follows a drag, in either variant.
        if (moved) group.dataset.suppressClick = '1';
      };

      group.addEventListener('pointermove', move);
      group.addEventListener('pointerup', up);
      group.addEventListener('pointercancel', up);
    });

    group.addEventListener('click', (ev) => {
      if (group.dataset.suppressClick) {
        delete group.dataset.suppressClick;
        ev.preventDefault();
        return;
      }
      // The explorer keeps you on the page: selecting opens the detail panel,
      // which carries the real link out. The mini graph navigates directly.
      if (variant === 'explorer') {
        ev.preventDefault();
        selectedId = node.id;
        applyStates();
        if (onActivate) onActivate(node);
      }
    });
  }

  // Background pan.
  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const start = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
    let moved = false;
    svg.setPointerCapture(ev.pointerId);
    svg.classList.add('graph__svg--panning');

    const move = (e) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      moved = true;
      // A deliberate pan replaces whatever framing the panel nudge saved —
      // restoring it later would undo the user's own action.
      savedView = null;
      const rect = svg.getBoundingClientRect();
      view.x = start.vx + (dx / rect.width) * width;
      view.y = start.vy + (dy / rect.height) * height;
      applyView();
    };
    const up = () => {
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
      svg.classList.remove('graph__svg--panning');
      // A click on empty space clears the selection.
      if (!moved && variant === 'explorer') {
        selectedId = null;
        applyStates();
        if (onActivate) onActivate(null);
      }
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  });

  svg.addEventListener(
    'wheel',
    (ev) => {
      if (variant !== 'explorer') return;
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * width;
      const sy = ((ev.clientY - rect.top) / rect.height) * height;
      savedView = null;
      const next = clamp(view.k * Math.exp(-ev.deltaY * 0.0016), ZOOM_MIN, ZOOM_MAX);
      // Keep the point under the cursor fixed while scaling.
      view.x = sx - ((sx - view.x) * next) / view.k;
      view.y = sy - ((sy - view.y) * next) / view.k;
      view.k = next;
      applyView();
    },
    { passive: false },
  );

  /* ---- public API ------------------------------------------------------- */

  return {
    svg,
    draw,
    tick,

    onDrag(fn) {
      onDragMove = fn;
    },

    setFilter(query) {
      filter = (query || '').trim().toLowerCase();
      applyStates();
    },

    setTagsVisible(value) {
      tagsVisible = value;
      applyStates();
    },

    setSelected(id) {
      selectedId = id;
      applyStates();
    },

    focusNode(id) {
      const entry = nodeEls.get(id);
      if (entry) entry.group.focus();
    },

    centreOn,

    /* Slide the view by the smallest amount that gets a node out from under the
     * panel, and remember where it was so closing the panel puts it back.
     *
     * Not centreOn: the layout is bounds-clamped to fill the stage, so translating
     * a node to dead centre drags the opposite half straight out of frame. A
     * minimal nudge moves tens of pixels instead of hundreds, and nodes in the
     * unoccluded part of the stage do not move at all. */
    nudgeIntoView(id, { insetRight = 0 } = {}) {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const pad = 44;
      const sx = node.x * view.k + view.x;
      const sy = node.y * view.k + view.y;

      let dx = 0;
      let dy = 0;
      if (sx > width - insetRight - pad) dx = width - insetRight - pad - sx;
      else if (sx < pad) dx = pad - sx;
      if (sy > height - pad) dy = height - pad - sy;
      else if (sy < pad) dy = pad - sy;
      if (dx === 0 && dy === 0) return;

      if (!savedView) savedView = { ...view };
      animateTo({ k: view.k, x: view.x + dx, y: view.y + dy });
    },

    /* Undo any nudge, so dismissing the panel restores the framing you had. */
    restoreView() {
      if (!savedView) return;
      const target = savedView;
      savedView = null;
      animateTo(target);
    },

    resetView() {
      savedView = null;
      view = { k: 1, x: 0, y: 0 };
      applyView();
    },

    resize() {
      width = stage.clientWidth || width;
      height = stage.clientHeight || height;
      setViewBox();
      applyView();
      return { width, height };
    },

    size() {
      return { width, height };
    },
  };
}
