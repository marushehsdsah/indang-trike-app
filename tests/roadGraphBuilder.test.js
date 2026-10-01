const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fixture = require('./fixtures/indang-osm-small.json');
const municipality = require('../assets/geo/indang-municipality.json');
const { buildRoadGraph } = require('../scripts/build-road-graph');
const { getRoadSpeedKph, getWayDirection, isRoutableWay } = require('../utils/roadRules');

const BUILDER_PATH = path.join(__dirname, '../scripts/build-road-graph.js');

function adjacency(graph) {
  return Object.fromEntries(Object.entries(graph.edges).map(([from, edges]) => [
    from,
    edges.map(([to, , , roadName, wayId, highway]) => [to, roadName, wayId, highway]),
  ]));
}

function findEdge(graph, from, to) {
  return graph.edges[from]?.find((edge) => edge[0] === to);
}

test('builds directed routable edges and excludes prohibited ways', () => {
  const graph = buildRoadGraph(fixture, municipality);
  assert.deepEqual(graph.edges['3'].map((edge) => edge[0]), ['2']);
  assert.deepEqual(graph.edges['4'].map((edge) => edge[0]), ['3', '5']);
  assert.equal(Object.values(graph.edges).flat().some((edge) => edge[4] === 'way/90'), false);
  assert.ok(Object.values(graph.edges).flat().every((edge) => edge[1] > 0 && edge[2] > 0));
  assert.deepEqual(buildRoadGraph(fixture, municipality), graph);
});

test('produces the literal directed adjacency for the fixture', () => {
  const graph = buildRoadGraph(fixture, municipality);

  assert.deepEqual(Object.keys(graph.nodes), ['1', '2', '3', '4', '5', '9', '12']);
  assert.deepEqual(adjacency(graph), {
    1: [['2', 'Mabini Street', 'way/100', 'residential']],
    2: [
      ['1', 'Mabini Street', 'way/100', 'residential'],
      ['3', 'Mabini Street', 'way/100', 'residential'],
    ],
    3: [['2', 'Mabini Street', 'way/100', 'residential']],
    4: [
      ['3', 'Rizal Street', 'way/101', 'residential'],
      ['5', 'Unnamed road', 'way/102', 'unclassified'],
    ],
    5: [
      ['9', 'Indang-Trece Martires Road', 'way/103', 'tertiary'],
      ['12', 'Unnamed road', 'way/102', 'unclassified'],
    ],
    9: [['5', 'Indang-Trece Martires Road', 'way/103', 'tertiary']],
    12: [['4', 'Unnamed road', 'way/102', 'unclassified']],
  });
});

test('keeps oneway=-1 in reverse only and roundabouts in way order', () => {
  const graph = buildRoadGraph(fixture, municipality);

  assert.ok(findEdge(graph, '4', '3'), 'oneway=-1 allows travel against the way direction');
  assert.equal(findEdge(graph, '3', '4'), undefined, 'oneway=-1 forbids the way direction');
  assert.ok(findEdge(graph, '4', '5'));
  assert.ok(findEdge(graph, '5', '12'));
  assert.ok(findEdge(graph, '12', '4'));
  assert.equal(findEdge(graph, '5', '4'), undefined, 'roundabouts are not two-way');
  assert.equal(findEdge(graph, '12', '5'), undefined);
  assert.equal(findEdge(graph, '4', '12'), undefined);
});

test('merges duplicate-coordinate nodes and skips zero-length, outside, and missing segments', () => {
  const graph = buildRoadGraph(fixture, municipality);

  assert.equal(graph.nodes['8'], undefined, 'node 8 duplicates node 5 and is merged into it');
  assert.deepEqual(findEdge(graph, '9', '5').slice(3), ['Indang-Trece Martires Road', 'way/103', 'tertiary']);
  assert.equal(findEdge(graph, '2', '2'), undefined, 'a repeated node never creates a self-loop');
  assert.equal(graph.nodes['10'], undefined, 'nodes outside Indang are excluded');
  assert.equal(graph.nodes['999'], undefined);
  const wayIds = new Set(Object.values(graph.edges).flat().map((edge) => edge[4]));
  assert.deepEqual([...wayIds].sort(), ['way/100', 'way/101', 'way/102', 'way/103']);
});

test('stores Haversine metres and travel seconds from the road speed', () => {
  const graph = buildRoadGraph(fixture, municipality);
  const residential = findEdge(graph, '1', '2');
  const tertiary = findEdge(graph, '5', '9');

  assert.ok(Math.abs(residential[1] - 111.2) < 0.11, `residential metres ${residential[1]}`);
  assert.ok(residential[2] >= residential[1] / (20 / 3.6) - 0.05, `residential seconds ${residential[2]}`);
  assert.ok(residential[2] <= residential[1] / (20 / 3.6) + 0.15, `residential seconds ${residential[2]}`);
  assert.ok(tertiary[2] >= tertiary[1] / (40 / 3.6) - 0.05, `maxspeed=40 seconds ${tertiary[2]}`);
  assert.ok(tertiary[2] <= tertiary[1] / (40 / 3.6) + 0.15, `maxspeed=40 seconds ${tertiary[2]}`);
  assert.deepEqual(graph.nodes['5'], [14.198, 120.881]);
});

test('records snapshot metadata and an admissible maximum speed', () => {
  const graph = buildRoadGraph(fixture, municipality);

  assert.equal(graph.metadata.source, 'OpenStreetMap');
  assert.equal(graph.metadata.sourceTimestamp, '2026-09-22T08:45:51Z');
  assert.deepEqual(graph.metadata.bounds, [14.195, 120.88, 14.199, 120.882]);
  assert.equal(graph.metadata.cellSizeDegrees, 0.005);
  assert.ok(graph.metadata.maxSpeedKph >= 40);
  for (const edge of Object.values(graph.edges).flat()) {
    assert.ok(edge[1] / edge[2] * 3.6 <= graph.metadata.maxSpeedKph + 1e-9);
  }
});

test('indexes every node exactly once in a spatial cell', () => {
  const graph = buildRoadGraph(fixture, municipality);
  const indexed = Object.values(graph.spatialIndex).flat();

  assert.deepEqual([...indexed].sort(), Object.keys(graph.nodes).sort());
  for (const [cellKey, nodeIds] of Object.entries(graph.spatialIndex)) {
    for (const nodeId of nodeIds) {
      const [latitude, longitude] = graph.nodes[nodeId];
      assert.equal(cellKey, `${Math.floor(latitude / 0.005)}:${Math.floor(longitude / 0.005)}`);
    }
  }
});

test('extracts named places and routable named roads deterministically', () => {
  const graph = buildRoadGraph(fixture, municipality);

  assert.deepEqual(graph.places, [
    { id: 'node/200', name: 'Cavite State University', kind: 'school', town: 'Indang', coordinate: [14.1985, 120.8815] },
    { id: 'way/100', name: 'Mabini Street', kind: 'road', town: 'Indang', coordinate: [14.196, 120.88] },
    { id: 'way/101', name: 'Rizal Street', kind: 'road', town: 'Indang', coordinate: [14.197, 120.88] },
    { id: 'way/103', name: 'Indang-Trece Martires Road', kind: 'road', town: 'Indang', coordinate: [14.198, 120.881] },
    { id: 'way/300', name: 'Indang Public Market', kind: 'marketplace', town: 'Indang', coordinate: [14.1943, 120.87915] },
  ]);
  assert.equal(JSON.stringify(buildRoadGraph(fixture, municipality)), JSON.stringify(graph));
});

test('rejects malformed OSM documents', () => {
  assert.throws(() => buildRoadGraph({}, municipality), /^Error: Invalid OSM document/);
  assert.throws(
    () => buildRoadGraph({ osm3s: {}, elements: [] }, municipality),
    /Invalid OSM document: missing osm3s.timestamp_osm_base/,
  );
  assert.throws(
    () => buildRoadGraph({ osm3s: { timestamp_osm_base: '2026-09-22T08:45:51Z' }, elements: [] }, municipality),
    /Invalid OSM document: no routable roads inside the municipality/,
  );
});

test('applies road-class speeds, maxspeed clamps, and direction tags', () => {
  assert.equal(getRoadSpeedKph({ highway: 'residential' }), 20);
  assert.equal(getRoadSpeedKph({ highway: 'primary' }), 35);
  assert.equal(getRoadSpeedKph({ highway: 'tertiary', maxspeed: '40' }), 40);
  assert.equal(getRoadSpeedKph({ highway: 'primary', maxspeed: '100' }), 60);
  assert.equal(getRoadSpeedKph({ highway: 'primary', maxspeed: '2' }), 5);
  assert.equal(getRoadSpeedKph({ highway: 'tertiary', maxspeed: 'none' }), 25);

  assert.equal(getWayDirection({ oneway: '-1' }), 'reverse');
  assert.equal(getWayDirection({ oneway: 'yes' }), 'forward');
  assert.equal(getWayDirection({ oneway: '1' }), 'forward');
  assert.equal(getWayDirection({ junction: 'roundabout' }), 'forward');
  assert.equal(getWayDirection({ junction: 'circular' }), 'forward');
  assert.equal(getWayDirection({ oneway: 'no' }), 'both');
  assert.equal(getWayDirection({}), 'both');
});

test('applies motor access with the most specific tag winning', () => {
  assert.equal(isRoutableWay({ highway: 'residential' }), true);
  assert.equal(isRoutableWay({ highway: 'footway' }), false);
  assert.equal(isRoutableWay({ highway: 'track' }), false);
  assert.equal(isRoutableWay({ highway: 'construction' }), false);
  assert.equal(isRoutableWay({ highway: 'service', access: 'private' }), false);
  assert.equal(isRoutableWay({ highway: 'service', access: 'no' }), false);
  assert.equal(isRoutableWay({ highway: 'service', vehicle: 'no' }), false);
  assert.equal(isRoutableWay({ highway: 'service', motor_vehicle: 'private' }), false);
  assert.equal(isRoutableWay({ highway: 'service', access: 'no', motor_vehicle: 'yes' }), true);
  assert.equal(isRoutableWay({ highway: 'service', access: 'yes', motor_vehicle: 'no' }), false);
  assert.equal(isRoutableWay({ highway: 'residential', oneway: 'reversible' }), false);
});

test('CLI writes the graph and reports concise errors', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'indang-graph-'));
  const output = path.join(directory, 'graph.json');
  try {
    const built = spawnSync(process.execPath, [
      BUILDER_PATH,
      '--input', path.join(__dirname, 'fixtures/indang-osm-small.json'),
      '--output', output,
      '--municipality', path.join(__dirname, '../assets/geo/indang-municipality.json'),
    ], { encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr);
    assert.match(built.stdout, /nodes=7 edges=10 places=5 bytes=\d+ sourceTimestamp=2026-09-22T08:45:51Z/);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), buildRoadGraph(fixture, municipality));

    // Without --municipality the builder uses the whole service area. The
    // fixture's Boundary Road lies outside Indang but inside General Trias.
    const serviceArea = spawnSync(process.execPath, [
      BUILDER_PATH, '--input', path.join(__dirname, 'fixtures/indang-osm-small.json'), '--output', output,
    ], { encoding: 'utf8' });
    assert.equal(serviceArea.status, 0, serviceArea.stderr);
    assert.match(serviceArea.stdout, /nodes=8 edges=12 places=6 /);
    const boundaryRoad = JSON.parse(fs.readFileSync(output, 'utf8')).places.find(({ id }) => id === 'way/104');
    assert.deepEqual(boundaryRoad, { id: 'way/104', name: 'Boundary Road', kind: 'road', town: 'General Trias', coordinate: [14.3, 120.9] });

    const missing = spawnSync(process.execPath, [BUILDER_PATH, '--output', output], { encoding: 'utf8' });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /^build-road-graph: Usage:/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
