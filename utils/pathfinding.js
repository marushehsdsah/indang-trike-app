const EARTH_RADIUS_METERS = 6371000;
// Summed 0.1-precision costs carry float noise; differences below this are ties.
const COST_EPSILON = 1e-6;
const NO_NODE = -1;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function haversineDistance(a, b) {
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const h = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toCoordinate([latitude, longitude]) {
  return { latitude, longitude };
}

function roundTenth(value) {
  return Math.round(value * 10) / 10;
}

function hasNode(graph, nodeId) {
  return Object.prototype.hasOwnProperty.call(graph.nodes, nodeId);
}

function getOwnEdges(graph, nodeId) {
  return Object.prototype.hasOwnProperty.call(graph.edges, nodeId) ? graph.edges[nodeId] : [];
}

// Frontier entries live in parallel typed arrays and the heap orders entry
// indices, so no object is allocated per entry and a sift moves one integer
// per level: Hermes has no JIT, and those costs dominated A* on a phone.
class FrontierHeap {
  constructor(capacity) {
    this.size = 0;
    this.entryCount = 0;
    this.allocate(Math.max(16, capacity));
  }

  // Empties the heap but keeps its arrays for the next search.
  clear() {
    this.size = 0;
    this.entryCount = 0;
  }

  allocate(capacity) {
    const grow = (Type, values) => {
      const next = new Type(capacity);
      if (values) next.set(values);
      return next;
    };
    this.estimates = grow(Float64Array, this.estimates);
    this.elapsed = grow(Float64Array, this.elapsed);
    this.metres = grow(Float64Array, this.metres);
    this.nodes = grow(Int32Array, this.nodes);
    this.heap = grow(Int32Array, this.heap);
  }

  // Lowest estimate first; equal estimates prefer less elapsed time, then
  // fewer metres, then the smaller node index (= the smaller node ID).
  compare(a, b) {
    return this.estimates[a] - this.estimates[b] ||
      this.elapsed[a] - this.elapsed[b] ||
      this.metres[a] - this.metres[b] ||
      this.nodes[a] - this.nodes[b];
  }

  isLess(a, b) {
    const difference = this.estimates[a] - this.estimates[b];
    return difference < 0 || (difference === 0 && this.compare(a, b) < 0);
  }

  push(estimate, elapsed, metres, node) {
    if (this.entryCount === this.nodes.length) this.allocate(this.entryCount * 2);
    const entry = this.entryCount;
    this.entryCount += 1;
    this.estimates[entry] = estimate;
    this.elapsed[entry] = elapsed;
    this.metres[entry] = metres;
    this.nodes[entry] = node;

    const { heap, estimates } = this;
    let child = this.size;
    this.size += 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const parentEntry = heap[parent];
      // Estimates rarely tie, so the full comparison runs only when they do.
      const difference = estimates[parentEntry] - estimate;
      if (difference < 0 || (difference === 0 && this.compare(parentEntry, entry) <= 0)) break;
      heap[child] = parentEntry;
      child = parent;
    }
    heap[child] = entry;
  }

  // Removes and returns the entry with the lowest estimate; read its fields
  // before the next push, which may reallocate the arrays.
  pop() {
    const { heap } = this;
    const root = heap[0];
    this.size -= 1;
    const size = this.size;
    if (!size) return root;
    const entry = heap[size];
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= size) break;
      const right = left + 1;
      let child = this.isLess(heap[left], entry) ? left : -1;
      if (right < size && this.isLess(heap[right], child === -1 ? entry : heap[left])) child = right;
      if (child === -1) break;
      heap[parent] = heap[child];
      parent = child;
    }
    heap[parent] = entry;
    return root;
  }
}

// Graphs are immutable once loaded, so each is compiled once. Keyed by the
// nodes object so copies that only change metadata share one compilation.
const compiledGraphs = new WeakMap();

function isSorted(values) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > values[index]) return false;
  }
  return true;
}

// Working arrays for searches over one compiled graph, kept between searches.
// A node's entries belong to the current search only while its stamp equals
// the search's generation, so nothing is cleared or reallocated per search:
// on a phone that allocation and clearing cost more than a short search.
function getSearchState(compiled) {
  if (!compiled.search) {
    const nodeCount = compiled.latitudes.length;
    compiled.search = {
      generation: 0,
      reached: new Int32Array(nodeCount),
      closed: new Int32Array(nodeCount),
      elapsed: new Float64Array(nodeCount),
      metres: new Float64Array(nodeCount),
      previous: new Int32Array(nodeCount),
      arrivalEdges: new Int32Array(nodeCount),
      frontier: new FrontierHeap(1024),
    };
  }
  const state = compiled.search;
  if (state.generation >= 0x3fffffff) {
    state.generation = 0;
    state.reached.fill(0);
    state.closed.fill(0);
  }
  state.generation += 1;
  state.frontier.clear();
  return state;
}

// Index-based copy of a graph for A*: coordinates and adjacency (CSR layout)
// in typed arrays. Indices follow sorted node-ID order, so comparing two
// indices breaks ties exactly as comparing the ID strings would.
function compileGraph(graph) {
  const cached = compiledGraphs.get(graph.nodes);
  if (cached && cached.edgesSource === graph.edges) return cached;

  // The graph builder writes nodes in ID order; sorting is needed only when
  // they are not, and checking costs far less than sorting 40,000 strings.
  const nodeIds = Object.keys(graph.nodes);
  if (!isSorted(nodeIds)) nodeIds.sort();
  const nodeCount = nodeIds.length;
  const indexById = new Map();
  nodeIds.forEach((nodeId, index) => indexById.set(nodeId, index));

  const latitudes = new Float64Array(nodeCount);
  const longitudes = new Float64Array(nodeCount);
  const latitudeCosines = new Float64Array(nodeCount);
  const edgeStarts = new Int32Array(nodeCount + 1);
  let edgeCount = 0;
  nodeIds.forEach((nodeId, index) => {
    const [latitude, longitude] = graph.nodes[nodeId];
    latitudes[index] = latitude;
    longitudes[index] = longitude;
    latitudeCosines[index] = Math.cos(toRadians(latitude));
    edgeStarts[index] = edgeCount;
    edgeCount += getOwnEdges(graph, nodeId).length;
  });
  edgeStarts[nodeCount] = edgeCount;

  const edgeTargets = new Int32Array(edgeCount);
  const edgeSeconds = new Float64Array(edgeCount);
  const edgeMetres = new Float64Array(edgeCount);
  const edges = new Array(edgeCount);
  let position = 0;
  for (const nodeId of nodeIds) {
    for (const edge of getOwnEdges(graph, nodeId)) {
      const target = indexById.get(edge[0]);
      if (target === undefined) throw new Error(`Edge ${nodeId} -> ${edge[0]} references an unknown road node`);
      edgeTargets[position] = target;
      edgeMetres[position] = edge[1];
      edgeSeconds[position] = edge[2];
      edges[position] = edge;
      position += 1;
    }
  }

  const compiled = {
    edgesSource: graph.edges,
    nodeIds,
    indexById,
    latitudes,
    longitudes,
    latitudeCosines,
    edgeStarts,
    edgeTargets,
    edgeSeconds,
    edgeMetres,
    edges,
  };
  compiledGraphs.set(graph.nodes, compiled);
  return compiled;
}

// Fastest time wins; equal time prefers fewer metres, then the smaller
// predecessor ID, so equal-cost alternatives always resolve the same way.
function isBetterArrival(elapsed, metres, fromNode, currentElapsed, currentMetres, currentPrevious) {
  if (elapsed < currentElapsed - COST_EPSILON) return true;
  if (elapsed > currentElapsed + COST_EPSILON) return false;
  if (metres < currentMetres - COST_EPSILON) return true;
  if (metres > currentMetres + COST_EPSILON) return false;
  return currentPrevious !== NO_NODE && fromNode < currentPrevious;
}

function buildPath(graph, compiled, previous, arrivalEdges, start, goal) {
  const segments = [];
  for (let node = goal; node !== start; node = previous[node]) {
    const fromNodeId = compiled.nodeIds[previous[node]];
    const [toNodeId, distanceMeters, durationSeconds, roadName, wayId, highway] = compiled.edges[arrivalEdges[node]];
    segments.push({
      fromNodeId,
      toNodeId,
      fromCoordinate: toCoordinate(graph.nodes[fromNodeId]),
      toCoordinate: toCoordinate(graph.nodes[toNodeId]),
      distanceMeters,
      durationSeconds,
      roadName,
      wayId,
      highway,
    });
  }
  segments.reverse();

  const startNodeId = compiled.nodeIds[start];
  const nodeIds = [startNodeId, ...segments.map(({ toNodeId }) => toNodeId)];
  return {
    nodeIds,
    coordinates: nodeIds.map((nodeId) => toCoordinate(graph.nodes[nodeId])),
    distanceMeters: roundTenth(segments.reduce((sum, segment) => sum + segment.distanceMeters, 0)),
    durationSeconds: roundTenth(segments.reduce((sum, segment) => sum + segment.durationSeconds, 0)),
    segments,
  };
}

// A* over estimated travel seconds. The heuristic is the straight-line distance
// at the graph's maximum speed, which never overestimates the remaining time.
function findFastestPath(graph, startNodeId, goalNodeId) {
  for (const nodeId of [startNodeId, goalNodeId]) {
    if (!hasNode(graph, nodeId)) throw new Error(`Unknown road node: ${nodeId}`);
  }

  const compiled = compileGraph(graph);
  const { latitudes, longitudes, latitudeCosines, edgeStarts, edgeTargets, edgeSeconds, edgeMetres } = compiled;
  const start = compiled.indexById.get(startNodeId);
  const goal = compiled.indexById.get(goalNodeId);
  const goalLatitude = latitudes[goal];
  const goalLongitude = longitudes[goal];
  const goalCosine = latitudeCosines[goal];
  const maxMetresPerSecond = graph.metadata.maxSpeedKph * 1000 / 3600;
  // haversineDistance(node, goal) inlined over the typed arrays, term for term.
  const heuristicSeconds = (node) => {
    const latitudeDelta = toRadians(goalLatitude - latitudes[node]);
    const longitudeDelta = toRadians(goalLongitude - longitudes[node]);
    const h = Math.sin(latitudeDelta / 2) ** 2 +
      latitudeCosines[node] * goalCosine * Math.sin(longitudeDelta / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h))) / maxMetresPerSecond;
  };

  const { generation, reached, closed, elapsed, metres, previous, arrivalEdges, frontier } = getSearchState(compiled);
  reached[start] = generation;
  elapsed[start] = 0;
  metres[start] = 0;
  previous[start] = NO_NODE;
  arrivalEdges[start] = NO_NODE;
  frontier.push(heuristicSeconds(start), 0, 0, start);

  while (frontier.size) {
    const entry = frontier.pop();
    const node = frontier.nodes[entry];
    const poppedElapsed = frontier.elapsed[entry];
    if (closed[node] === generation || poppedElapsed > elapsed[node] + COST_EPSILON) continue;
    if (node === goal) return buildPath(graph, compiled, previous, arrivalEdges, start, goal);
    closed[node] = generation;

    for (let edge = edgeStarts[node]; edge < edgeStarts[node + 1]; edge += 1) {
      const neighbour = edgeTargets[edge];
      const neighbourElapsed = elapsed[node] + edgeSeconds[edge];
      const neighbourMetres = metres[node] + edgeMetres[edge];
      const wasReached = reached[neighbour] === generation;
      if (wasReached && !isBetterArrival(
        neighbourElapsed, neighbourMetres, node,
        elapsed[neighbour], metres[neighbour], previous[neighbour],
      )) continue;

      const costChanged = !wasReached ||
        Math.abs(neighbourElapsed - elapsed[neighbour]) > COST_EPSILON ||
        Math.abs(neighbourMetres - metres[neighbour]) > COST_EPSILON;
      reached[neighbour] = generation;
      elapsed[neighbour] = neighbourElapsed;
      metres[neighbour] = neighbourMetres;
      previous[neighbour] = node;
      arrivalEdges[neighbour] = edge;
      // A predecessor-only tie change keeps the same cost, so nothing to re-expand.
      if (costChanged) {
        closed[neighbour] = 0;
        frontier.push(neighbourElapsed + heuristicSeconds(neighbour), neighbourElapsed, neighbourMetres, neighbour);
      }
    }
  }

  return null;
}

module.exports = {
  compileGraph,
  findFastestPath,
  haversineDistance,
};
