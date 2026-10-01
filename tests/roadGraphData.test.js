const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { searchPlaces } = require('../utils/placeSearch');
const { calculateRoute, validateRoadGraph } = require('../utils/roadGraph');

const GRAPH_PATH = path.join(__dirname, '../assets/routing/service-area-road-graph.json');
const GRAPH = require(GRAPH_PATH);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureFiveRuns(run) {
  const warmup = run();
  const samples = [];
  let lastResult = warmup;
  for (let index = 0; index < 5; index += 1) {
    const startedAt = performance.now();
    lastResult = run();
    samples.push(performance.now() - startedAt);
  }
  return { medianMs: median(samples), result: lastResult, samples };
}

test('ships a bounded non-empty road graph for both towns', () => {
  // Indang and General Trias together are about 8.5 MB.
  assert.ok(fs.statSync(GRAPH_PATH).size < 10 * 1024 * 1024);
  assert.equal(GRAPH.metadata.source, 'OpenStreetMap');
  assert.ok(Object.keys(GRAPH.nodes).length > 100);
  assert.ok(Object.values(GRAPH.edges).flat().length > 100);
  assert.ok(GRAPH.places.length > 0);
  const towns = new Set(GRAPH.places.map(({ town }) => town));
  assert.deepEqual([...towns].sort(), ['General Trias', 'Indang'], 'every place is tagged with its town');
  assert.match(GRAPH.metadata.sourceTimestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('keeps graph initialization, routing, and local search within their budgets', () => {
  const validationStartedAt = performance.now();
  const validatedGraph = validateRoadGraph(GRAPH);
  const validationMs = performance.now() - validationStartedAt;

  const defaultRoute = measureFiveRuns(() => calculateRoute(
    validatedGraph,
    DEFAULT_TRIP.pickup.coordinate,
    DEFAULT_TRIP.dropoff.coordinate,
  ));

  // The northern and southern tips of General Trias' road network, about
  // 26 km apart by road. Its bounding-box corners are too far from any road.
  const farRoute = measureFiveRuns(() => calculateRoute(
    validatedGraph,
    { latitude: 14.417526, longitude: 120.882255 },
    { latitude: 14.220886, longitude: 120.905448 },
  ));

  const representativeQueries = [
    'General Trias', 'Cavite', 'University', 'Market', 'Barangay',
    'School', 'Church', 'Health', 'Dental', 'Farm',
    'Street', 'Road', 'Jollibee', 'Alfamart', '7 eleven',
    'Manggahan', 'Pasong Kawayan', 'Biclatan', 'Tapia', 'Santiago',
    'Indang', 'Lumampong', 'Kaytapos', 'Daine', 'Buna',
  ];
  const searchStartedAt = performance.now();
  const searchResults = representativeQueries.map((query) => searchPlaces(GRAPH.places, query));
  const searchMs = performance.now() - searchStartedAt;

  assert.equal(defaultRoute.result.status, 'ok');
  assert.equal(farRoute.result.status, 'ok');
  assert.equal(searchResults.length, 25);
  assert.ok(validationMs < 500, `graph validation took ${validationMs.toFixed(1)} ms (budget: <500 ms)`);
  assert.ok(
    defaultRoute.medianMs < 150,
    `default route median took ${defaultRoute.medianMs.toFixed(1)} ms (budget: <150 ms; samples: ${defaultRoute.samples.map((value) => value.toFixed(1)).join(', ')})`,
  );
  assert.ok(
    farRoute.medianMs < 150,
    `far route median took ${farRoute.medianMs.toFixed(1)} ms (budget: <150 ms; samples: ${farRoute.samples.map((value) => value.toFixed(1)).join(', ')})`,
  );
  assert.ok(searchMs < 1000, `25 searches took ${searchMs.toFixed(1)} ms (budget: <1000 ms)`);

  console.log([
    'routing-performance',
    `validation=${validationMs.toFixed(1)}ms`,
    `defaultMedian=${defaultRoute.medianMs.toFixed(1)}ms`,
    `farMedian=${farRoute.medianMs.toFixed(1)}ms`,
    `search25=${searchMs.toFixed(1)}ms`,
  ].join(' '));
});
