const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { searchPlaces } = require('../utils/placeSearch');
const { calculateRoute, validateRoadGraph } = require('../utils/roadGraph');

const GRAPH_PATH = path.join(__dirname, '../assets/routing/indang-road-graph.json');
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

test('ships a bounded non-empty Indang road graph', () => {
  assert.ok(fs.statSync(GRAPH_PATH).size < 5 * 1024 * 1024);
  assert.equal(GRAPH.metadata.source, 'OpenStreetMap');
  assert.ok(Object.keys(GRAPH.nodes).length > 100);
  assert.ok(Object.values(GRAPH.edges).flat().length > 100);
  assert.ok(GRAPH.places.length > 0);
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

  const [south, west, north, east] = validatedGraph.metadata.bounds;
  const boundsRoute = measureFiveRuns(() => calculateRoute(
    validatedGraph,
    { latitude: north, longitude: west },
    { latitude: south, longitude: east },
  ));

  const representativeQueries = [
    'Indang', 'Cavite', 'University', 'Market', 'Barangay',
    'School', 'Church', 'Health', 'Dental', 'Farm',
    'Street', 'Road', 'Jollibee', 'Alfamart', '7 eleven',
    'Lumampong', 'Kaytapos', 'Daine', 'Buna', 'Tambo',
  ];
  const searchStartedAt = performance.now();
  const searchResults = representativeQueries.map((query) => searchPlaces(GRAPH.places, query));
  const searchMs = performance.now() - searchStartedAt;

  assert.equal(defaultRoute.result.status, 'ok');
  assert.equal(boundsRoute.result.status, 'ok');
  assert.equal(searchResults.length, 20);
  assert.ok(validationMs < 500, `graph validation took ${validationMs.toFixed(1)} ms (budget: <500 ms)`);
  assert.ok(
    defaultRoute.medianMs < 150,
    `default route median took ${defaultRoute.medianMs.toFixed(1)} ms (budget: <150 ms; samples: ${defaultRoute.samples.map((value) => value.toFixed(1)).join(', ')})`,
  );
  assert.ok(
    boundsRoute.medianMs < 150,
    `bounds route median took ${boundsRoute.medianMs.toFixed(1)} ms (budget: <150 ms; samples: ${boundsRoute.samples.map((value) => value.toFixed(1)).join(', ')})`,
  );
  assert.ok(searchMs < 1000, `20 searches took ${searchMs.toFixed(1)} ms (budget: <1000 ms)`);

  console.log([
    'routing-performance',
    `validation=${validationMs.toFixed(1)}ms`,
    `defaultMedian=${defaultRoute.medianMs.toFixed(1)}ms`,
    `boundsMedian=${boundsRoute.medianMs.toFixed(1)}ms`,
    `search20=${searchMs.toFixed(1)}ms`,
  ].join(' '));
});
