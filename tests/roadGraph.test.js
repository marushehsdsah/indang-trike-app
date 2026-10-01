const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateRoute,
  findNearestRoadNode,
  getRoadNameAtNode,
  getSpatialCellKey,
  loadRoadGraph,
  validateRoadGraph,
} = require('../utils/roadGraph');
const { haversineDistance } = require('../utils/pathfinding');

// Spatial fixture on 0.005-degree cells. The centre cell "2840:24176" covers
// latitude 14.200-14.205 and longitude 120.880-120.885.
const NODES = {
  a: [14.2005, 120.8805],
  b: [14.203, 120.883],
  e: [14.2045, 120.8852],
  y: [14.19, 120.87],
  z: [14.1905, 120.87],
};

function makeEdge(from, to, roadName = 'Unnamed road') {
  const metres = haversineDistance(
    { latitude: NODES[from][0], longitude: NODES[from][1] },
    { latitude: NODES[to][0], longitude: NODES[to][1] },
  );
  return [to, Math.round(metres * 10) / 10, Math.ceil(metres / (20 / 3.6) * 10) / 10, roadName, `way/${from}${to}`, 'residential'];
}

function makeGraph() {
  const spatialIndex = {};
  for (const [nodeId, [latitude, longitude]] of Object.entries(NODES)) {
    (spatialIndex[getSpatialCellKey(latitude, longitude)] ??= []).push(nodeId);
  }
  return {
    metadata: {
      source: 'OpenStreetMap',
      sourceTimestamp: '2026-09-22T08:45:51Z',
      maxSpeedKph: 21,
      bounds: [14.19, 120.87, 14.2048, 120.8852],
      cellSizeDegrees: 0.005,
    },
    nodes: structuredClone(NODES),
    edges: {
      a: [makeEdge('a', 'b', 'Mabini Street')],
      b: [makeEdge('b', 'a', 'Mabini Street'), makeEdge('b', 'e')],
      e: [makeEdge('e', 'b')],
      y: [makeEdge('y', 'z')],
      z: [makeEdge('z', 'y')],
    },
    spatialIndex,
    places: [{ id: 'node/1', name: 'Cavite State University', kind: 'school', coordinate: [14.203, 120.883] }],
  };
}

const graph = makeGraph();
const coordinate = (latitude, longitude) => ({ latitude, longitude });
const nearB = coordinate(14.2031, 120.883);
const graphCoordinateB = coordinate(14.203, 120.883);
const farAway = coordinate(14.3, 120.99);
const disconnectedA = coordinate(14.2006, 120.8805);
const disconnectedZ = coordinate(14.1906, 120.87);

test('uses the literal spatial cell layout', () => {
  assert.deepEqual(graph.spatialIndex['2840:24176'], ['a', 'b']);
  assert.deepEqual(graph.spatialIndex['2840:24177'], ['e']);
});

test('snaps to the nearest node in the query cell', () => {
  const snapped = findNearestRoadNode(graph, nearB);
  assert.equal(snapped.nodeId, 'b');
  assert.deepEqual(snapped.coordinate, graphCoordinateB);
  assert.ok(Math.abs(snapped.distanceMeters - 11.1) < 1);
  assert.equal(findNearestRoadNode(graph, farAway), null);
});

test('expands into a neighbour cell when it holds the nearest node', () => {
  // The query is in the centre cell, but e sits just across its east edge.
  const snapped = findNearestRoadNode(graph, coordinate(14.2045, 120.8848));
  assert.equal(snapped.nodeId, 'e');
  assert.ok(snapped.distanceMeters < 50, `snapped ${snapped.distanceMeters} m`);
});

test('finds a node two cells away while it is within the snap limit', () => {
  // Cell 2842 is empty; e (cell 2840) is about 667 m away.
  const query = coordinate(14.2101, 120.883);
  const snapped = findNearestRoadNode(graph, query);
  assert.equal(snapped.nodeId, 'e');
  assert.ok(snapped.distanceMeters > 600 && snapped.distanceMeters < 750, `snapped ${snapped.distanceMeters} m`);
  assert.equal(findNearestRoadNode(graph, query, 600), null);
});

test('breaks equal snap distances by node ID and rejects invalid coordinates', () => {
  const tied = makeGraph();
  tied.nodes.c = [14.203, 120.883];
  tied.spatialIndex['2840:24176'].push('c');
  assert.equal(findNearestRoadNode(tied, nearB).nodeId, 'b');
  assert.equal(findNearestRoadNode(graph, coordinate(Number.NaN, 120.88)), null);
  assert.equal(findNearestRoadNode(graph, null), null);
});

test('calculates snapped routes and reports each failure', () => {
  const routed = calculateRoute(graph, disconnectedA, nearB);
  assert.equal(routed.status, 'ok');
  assert.deepEqual(routed.route.nodeIds, ['a', 'b']);
  assert.equal(routed.startSnap.nodeId, 'a');
  assert.equal(routed.endSnap.nodeId, 'b');

  assert.deepEqual(calculateRoute(graph, disconnectedA, disconnectedZ), { status: 'no-route' });
  assert.deepEqual(calculateRoute(graph, farAway, nearB), { status: 'unsnappable', endpoint: 'pickup' });
  assert.deepEqual(calculateRoute(graph, nearB, farAway), { status: 'unsnappable', endpoint: 'destination' });
});

test('names the road at a node, skipping unnamed edges', () => {
  assert.equal(getRoadNameAtNode(graph, 'b'), 'Mabini Street');
  assert.equal(getRoadNameAtNode(graph, 'e'), null);
  assert.equal(getRoadNameAtNode(graph, 'missing'), null);
});

test('accepts a well-formed graph', () => {
  assert.equal(validateRoadGraph(graph), graph);
});

test('rejects malformed graphs with an Invalid road graph message', () => {
  const cases = {
    'not an object': () => null,
    'missing metadata': (g) => { g.metadata = null; },
    'non-OSM source': (g) => { g.metadata.source = 'Somewhere'; },
    'missing timestamp': (g) => { delete g.metadata.sourceTimestamp; },
    'zero max speed': (g) => { g.metadata.maxSpeedKph = 0; },
    'bad bounds': (g) => { g.metadata.bounds = [14.2, 120.8]; },
    'bad cell size': (g) => { g.metadata.cellSizeDegrees = 'big'; },
    'empty nodes': (g) => { g.nodes = {}; },
    'bad node coordinate': (g) => { g.nodes.a = [14.2]; },
    'out-of-range latitude': (g) => { g.nodes.a = [95, 120.88]; },
    'missing neighbour node': (g) => { g.edges.a.push(['ghost', 10, 1, 'Road', 'way/1', 'residential']); },
    'edges from missing node': (g) => { g.edges.ghost = []; },
    'negative metres': (g) => { g.edges.a[0][1] = -1; },
    'zero seconds': (g) => { g.edges.a[0][2] = 0; },
    'non-numeric seconds': (g) => { g.edges.a[0][2] = '5'; },
    'short edge tuple': (g) => { g.edges.a[0] = ['b', 10, 1]; },
    'edge faster than max speed': (g) => { g.edges.a[0][2] = 0.1; },
    'malformed cell key': (g) => { g.spatialIndex['not-a-cell'] = []; },
    'node in the wrong cell': (g) => {
      g.spatialIndex['2840:24176'] = ['a'];
      g.spatialIndex['2840:24177'] = ['e', 'b'];
    },
    'unindexed node': (g) => { g.spatialIndex['2840:24176'] = ['a']; },
    'node indexed twice': (g) => { g.spatialIndex['2840:24176'].push('a'); },
    'cell with missing node': (g) => { g.spatialIndex['2840:24176'].push('ghost'); },
    'places not an array': (g) => { g.places = {}; },
    'place without a name': (g) => { g.places[0].name = '  '; },
    'place with a bad coordinate': (g) => { g.places[0].coordinate = [14.2, 'east']; },
  };

  for (const [label, mutate] of Object.entries(cases)) {
    const candidate = makeGraph();
    const result = mutate(candidate);
    const data = result === undefined ? candidate : result;
    assert.throws(() => validateRoadGraph(data), /^Error: Invalid road graph: /, label);
  }
});

test('loads a graph with app-format places or reports why it cannot', () => {
  const loaded = loadRoadGraph(makeGraph());
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(loaded.graph.places, [{
    id: 'node/1',
    name: 'Cavite State University',
    kind: 'school',
    coordinate: { latitude: 14.203, longitude: 120.883 },
  }]);
  assert.equal(calculateRoute(loaded.graph, disconnectedA, nearB).status, 'ok');

  const broken = makeGraph();
  broken.edges.a[0][0] = 'ghost';
  assert.deepEqual(loadRoadGraph(broken), {
    status: 'error',
    message: 'Invalid road graph: edge a -> ghost references a missing node',
  });
});

test('matches a brute-force nearest-node search on the production graph', () => {
  const production = require('../assets/routing/service-area-road-graph.json');
  const nodeEntries = Object.entries(production.nodes);
  const [south, west, north, east] = production.metadata.bounds;
  let seed = 97;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let sample = 0; sample < 200; sample += 1) {
    const query = coordinate(south + random() * (north - south), west + random() * (east - west));
    let expected = null;
    for (const [nodeId, [latitude, longitude]] of nodeEntries) {
      const distance = haversineDistance(query, coordinate(latitude, longitude));
      if (distance <= 750 && (!expected || distance < expected.distance ||
          (distance === expected.distance && nodeId < expected.nodeId))) {
        expected = { nodeId, distance };
      }
    }
    assert.equal(findNearestRoadNode(production, query)?.nodeId ?? null, expected?.nodeId ?? null,
      `sample ${sample} at ${query.latitude},${query.longitude}`);
  }
});

test('routes the default trip on the production graph', () => {
  const production = require('../assets/routing/service-area-road-graph.json');
  const { DEFAULT_TRIP } = require('../data/indangMap');
  const loaded = loadRoadGraph(production);
  assert.equal(loaded.status, 'ready', loaded.message);

  const pickupSnap = findNearestRoadNode(loaded.graph, DEFAULT_TRIP.pickup.coordinate);
  const dropoffSnap = findNearestRoadNode(loaded.graph, DEFAULT_TRIP.dropoff.coordinate);
  assert.ok(pickupSnap && pickupSnap.distanceMeters <= 750);
  assert.ok(dropoffSnap && dropoffSnap.distanceMeters <= 750);

  const result = calculateRoute(loaded.graph, DEFAULT_TRIP.pickup.coordinate, DEFAULT_TRIP.dropoff.coordinate);
  assert.equal(result.status, 'ok');
  assert.ok(result.route.coordinates.length > 2);
  assert.ok(result.route.distanceMeters > 4000, `route is ${result.route.distanceMeters} m`);
});
