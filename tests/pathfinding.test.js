const test = require('node:test');
const assert = require('node:assert/strict');
const { findFastestPath, haversineDistance } = require('../utils/pathfinding');

// Nodes sit a few metres apart so the straight-line heuristic stays far below
// every edge cost; the edge tuples carry the literal metres and seconds.
const edge = (to, metres, seconds, road = 'Test Road', way = 'way/1') => [to, metres, seconds, road, way, 'residential'];

const graph = {
  metadata: { maxSpeedKph: 36 },
  nodes: {
    a: [14.2, 120.88],
    b: [14.20001, 120.88],
    c: [14.20001, 120.88003],
    d: [14.20002, 120.88003],
    y: [14.21, 120.89],
    z: [14.21001, 120.89],
  },
  edges: {
    // a->b->d and a->c->d both take 200 m / 20 s; the direct a->d is shorter but slower.
    a: [edge('b', 100, 10, 'Mabini Street', 'way/10'), edge('c', 100, 10), edge('d', 120, 30)],
    b: [edge('d', 100, 10, 'Rizal Street', 'way/11')],
    c: [edge('d', 100, 10)],
    y: [edge('z', 10, 1)],
    z: [edge('y', 10, 1)],
  },
};

test('chooses the fastest route and reports literal totals', () => {
  const result = findFastestPath(graph, 'a', 'd');
  assert.deepEqual(result.nodeIds, ['a', 'b', 'd']);
  assert.equal(result.distanceMeters, 200);
  assert.equal(result.durationSeconds, 20);
  assert.deepEqual(result.coordinates, [
    { latitude: 14.2, longitude: 120.88 },
    { latitude: 14.20001, longitude: 120.88 },
    { latitude: 14.20002, longitude: 120.88003 },
  ]);
  assert.deepEqual(result.segments[0], {
    fromNodeId: 'a',
    toNodeId: 'b',
    fromCoordinate: { latitude: 14.2, longitude: 120.88 },
    toCoordinate: { latitude: 14.20001, longitude: 120.88 },
    distanceMeters: 100,
    durationSeconds: 10,
    roadName: 'Mabini Street',
    wayId: 'way/10',
    highway: 'residential',
  });
  assert.equal(result.segments[1].roadName, 'Rizal Street');
});

test('returns null for disconnected endpoints', () => {
  assert.equal(findFastestPath(graph, 'a', 'z'), null);
});

test('respects one-way edges', () => {
  assert.equal(findFastestPath(graph, 'd', 'a'), null);
});

test('returns a single coordinate and zero totals when start is the goal', () => {
  assert.deepEqual(findFastestPath(graph, 'b', 'b'), {
    nodeIds: ['b'],
    coordinates: [{ latitude: 14.20001, longitude: 120.88 }],
    distanceMeters: 0,
    durationSeconds: 0,
    segments: [],
  });
});

test('throws for unknown node IDs', () => {
  assert.throws(() => findFastestPath(graph, 'a', 'missing'), /Unknown road node: missing/);
  assert.throws(() => findFastestPath(graph, 'missing', 'a'), /Unknown road node: missing/);
  assert.throws(() => findFastestPath(graph, 'a', '__proto__'), /Unknown road node/);
});

test('breaks equal-time ties by lower metres, even through a larger node ID', () => {
  const tieGraph = {
    metadata: { maxSpeedKph: 36 },
    nodes: { s: [14.2, 120.88], p: [14.20001, 120.88], q: [14.20001, 120.88001], t: [14.20002, 120.88001] },
    edges: {
      s: [edge('p', 80, 10), edge('q', 50, 10)],
      p: [edge('t', 80, 10)],
      q: [edge('t', 50, 10)],
    },
  };
  const result = findFastestPath(tieGraph, 's', 't');
  assert.deepEqual(result.nodeIds, ['s', 'q', 't']);
  assert.equal(result.distanceMeters, 100);
  assert.equal(result.durationSeconds, 20);
});

test('breaks equal time and metres ties by the smaller node ID', () => {
  // c is closer to d than b, so A* reaches d through c first; b must still win.
  const result = findFastestPath(graph, 'a', 'd');
  assert.deepEqual(result.nodeIds, ['a', 'b', 'd']);
});

test('keeps summed decimal costs free of floating-point noise', () => {
  const decimalGraph = {
    metadata: { maxSpeedKph: 36 },
    nodes: { a: [14.2, 120.88], b: [14.20001, 120.88], c: [14.20002, 120.88] },
    edges: { a: [edge('b', 0.1, 0.1)], b: [edge('c', 0.2, 0.2)] },
  };
  const result = findFastestPath(decimalGraph, 'a', 'c');
  assert.equal(result.distanceMeters, 0.3);
  assert.equal(result.durationSeconds, 0.3);
});

test('measures one degree of latitude with Haversine', () => {
  const metres = haversineDistance({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
  assert.ok(Math.abs(metres - 111195) < 1, `measured ${metres}`);
  assert.equal(haversineDistance({ latitude: 14.2, longitude: 120.88 }, { latitude: 14.2, longitude: 120.88 }), 0);
});

test('matches Dijkstra on the production graph', () => {
  const production = require('../assets/routing/general-trias-road-graph.json');
  const dijkstraGraph = { ...production, metadata: { ...production.metadata, maxSpeedKph: Infinity } };
  const nodeIds = Object.keys(production.nodes);
  let seed = 20260922;
  const nextNode = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return nodeIds[seed % nodeIds.length];
  };

  let routed = 0;
  for (let pair = 0; pair < 25; pair += 1) {
    const start = nextNode();
    const goal = nextNode();
    const aStar = findFastestPath(production, start, goal);
    const dijkstra = findFastestPath(dijkstraGraph, start, goal);
    assert.equal(aStar === null, dijkstra === null, `${start} -> ${goal} reachability`);
    if (!aStar) continue;
    routed += 1;
    assert.equal(aStar.durationSeconds, dijkstra.durationSeconds, `${start} -> ${goal} duration`);
  }
  assert.ok(routed >= 15, `only ${routed} of 25 random pairs were routable`);
});
