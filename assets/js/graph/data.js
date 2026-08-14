/* Fetching and indexing /notes/graph.json.
 *
 * One fetch per URL per page load, shared between every mount on the page. The
 * promise itself is cached rather than the result, so two mounts initialising in
 * the same tick still make one request. */

const inflight = new Map();

export function loadGraph(src) {
  if (!inflight.has(src)) {
    inflight.set(
      src,
      fetch(src, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return res.json();
        })
        .then(buildIndex),
    );
  }
  return inflight.get(src);
}

/* Turns the raw file into something with O(1) lookups.
 *
 * Links keep their ids as plain strings here. d3-force replaces link.source and
 * link.target with node object references when it runs, so handing it these
 * objects directly would corrupt the index — layout.js copies them first. */
export function buildIndex(raw) {
  const nodes = (raw.nodes || []).map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Drop edges pointing at nodes that are not in the file rather than letting
  // the simulation throw on an unknown id.
  const links = (raw.links || []).filter((l) => byId.has(l.source) && byId.has(l.target));

  const neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
  const wikiOut = new Map(nodes.map((n) => [n.id, []]));
  const wikiIn = new Map(nodes.map((n) => [n.id, []]));
  const tagsOf = new Map(nodes.map((n) => [n.id, []]));

  for (const l of links) {
    neighbours.get(l.source).add(l.target);
    neighbours.get(l.target).add(l.source);
    if (l.kind === 'wiki') {
      wikiOut.get(l.source).push(l.target);
      wikiIn.get(l.target).push(l.source);
    } else if (l.kind === 'tag') {
      tagsOf.get(l.source).push(l.target);
    }
  }

  for (const n of nodes) {
    n.degree = neighbours.get(n.id).size;
    n.search = `${n.title} ${(n.tags || []).join(' ')} ${n.slug}`.toLowerCase();
  }

  return { nodes, links, byId, neighbours, wikiOut, wikiIn, tagsOf };
}

/* Everything within `depth` hops of a node, for the per-note mini graph. */
export function subgraph(index, focusId, depth = 1) {
  if (!index.byId.has(focusId)) return { nodes: [], links: [] };

  const keep = new Set([focusId]);
  let frontier = [focusId];
  for (let d = 0; d < depth; d += 1) {
    const next = [];
    for (const id of frontier) {
      for (const nb of index.neighbours.get(id)) {
        if (!keep.has(nb)) {
          keep.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: index.nodes.filter((n) => keep.has(n.id)),
    links: index.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
  };
}

export function nodeRadius(node) {
  // Tags are a fixed size — their degree says how many notes carry them, which
  // is already the most visible thing about them, so encoding it twice just makes
  // popular tags look more important than the notes.
  if (node.type === 'tag') return 5;
  return 5 + Math.min(5, Math.sqrt(node.degree || 0) * 1.9);
}
