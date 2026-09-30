# Offline A* Booking and Route Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a map-first Indang booking flow that selects real locations, computes the fastest offline road route with A*, and reuses that road-following route through searching and active-ride guidance.

**Architecture:** A development-time pipeline converts an OpenStreetMap snapshot into a compact, committed road graph. Pure CommonJS modules validate the graph, snap coordinates, run deterministic fastest-time A*, search bundled places, and generate maneuvers; React Native screens consume those modules through focused components and one foreground-location hook.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, react-native-maps, expo-location, Node's built-in test runner, OpenStreetMap/Overpass JSON.

**Spec:** `docs/superpowers/specs/2026-09-22-offline-a-star-booking-route-design.md`

## Global Constraints

- Keep `react-native-maps`; do not introduce another map or routing SDK.
- Add only the Expo-SDK-compatible `expo-location` runtime dependency.
- Use foreground location only; no background tracking or voice navigation.
- Route entirely from the committed graph with no runtime routing/geocoding API.
- Optimize A* for estimated travel seconds; break ties by metres, then node ID.
- Respect one-way, roundabout, access, vehicle, and motor-vehicle tags.
- Reject endpoint snaps farther than 750 metres.
- Preserve the fixed prototype fare of `₱45.00`; do not invent pricing rules.
- Render a blue route with a white underlay and visible `© OpenStreetMap contributors` attribution.
- Keep graph JSON under 5 MB, graph startup under 500 ms, typical A* under 150 ms, and local search under 50 ms on the Android emulator.
- Do not modify the registration behavior or overwrite unrelated working-tree changes.

## Review Focus

- Permission denied, stale GPS outside Indang, or a location timeout must select CvSU without blocking manual endpoint selection; Task 6 tests all three outcomes.
- An in-boundary tap can still be more than 750 metres from the graph or lie in a disconnected component; Task 4 tests both and Task 8 disables confirmation without retaining stale route metrics.
- `oneway=-1`, roundabouts, and duplicated/zero-length OSM nodes can silently reverse or corrupt routes; Task 1 has literal graph assertions for each case.
- Search input with whitespace, punctuation, case differences, or diacritics must rank deterministically and never crash; Task 4 tests these inputs.
- A route with unnamed roads, repeated road names, or near-zero bearing changes must still produce stable maneuvers and an arrival step; Task 5 tests these route shapes.

---

## File Structure

### Routing data and build tooling

- `utils/roadRules.js` — authoritative motor access, one-way, and speed rules shared by the builder and runtime.
- `scripts/build-road-graph.js` — Overpass JSON to deterministic compact graph converter and CLI.
- `assets/routing/indang-road-graph.json` — committed runtime graph.
- `assets/routing/README.md` — query, snapshot metadata, transformation, ODbL, and rebuild command.
- `tests/fixtures/indang-osm-small.json` — hand-checked OSM fixture.
- `tests/roadGraphBuilder.test.js` — graph-conversion behavior.
- `tests/roadGraphData.test.js` — production graph integrity and size.

### Pure runtime modules

- `utils/pathfinding.js` — Haversine, binary min-heap, and deterministic A*.
- `utils/roadGraph.js` — graph validation, loading, spatial-cell lookup, coordinate snapping, and route orchestration.
- `utils/placeSearch.js` — local place normalization and ranking.
- `utils/routeDirections.js` — route step grouping, bearings, maneuver classification, and display formatting.
- `utils/bookingRoute.js` — booking route state and serializable confirmation payload helpers.
- `tests/pathfinding.test.js`, `tests/roadGraph.test.js`, `tests/placeSearch.test.js`, `tests/routeDirections.test.js`, `tests/bookingRoute.test.js` — unit coverage.

### Location and presentation

- `utils/pickupLocation.js` — testable current/last-known/fallback selection policy.
- `hooks/useCurrentPickup.js` — thin Expo Location adapter.
- `components/RouteMap.js` — map, route layers, markers, camera fit, current-location control, attribution.
- `components/LocationSearchPanel.js` — active endpoint search and result selection.
- `components/BookingSheet.js` — route summary and booking controls.
- `screens/BookingScreen.js` — selection and routing coordinator.
- `screens/SearchingScreen.js` — confirmed-route searching view.
- `screens/ActiveRideScreen.js` — route-progress prototype and maneuver presentation.
- `components/IndangMapLayers.js` — service polygon only; no fabricated straight route.
- `data/indangMap.js` — service geometry and fallback places.

---

### Task 1: Deterministic OSM Road-Graph Builder

**Files:**
- Create: `utils/roadRules.js`
- Create: `scripts/build-road-graph.js`
- Create: `tests/fixtures/indang-osm-small.json`
- Create: `tests/roadGraphBuilder.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Overpass JSON `{ osm3s, elements }` and the existing municipality GeoJSON.
- Produces: `getRoadSpeedKph(tags): number`, `getWayDirection(tags): 'forward'|'reverse'|'both'`, `isRoutableWay(tags): boolean`, and `buildRoadGraph(osm, municipality): RoadGraphData`.

- [ ] **Step 1: Add a failing road-rule and builder test**

Create a fixture containing: nodes `1→2→3` on a residential way, nodes `3→4` on `oneway=-1`, nodes `4→5→4` on a roundabout, a prohibited service way, a footway, and a duplicate-coordinate segment. Assert literal directed neighbours, metre/second fields greater than zero, exclusion of prohibited ways, reverse-only handling, roundabout direction, deterministic place extraction, and identical output from two builds.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/indang-osm-small.json');
const municipality = require('../assets/geo/indang-municipality.json');
const { buildRoadGraph } = require('../scripts/build-road-graph');

test('builds directed routable edges and excludes prohibited ways', () => {
  const graph = buildRoadGraph(fixture, municipality);
  assert.deepEqual(graph.edges['3'].map((edge) => edge[0]), ['2']);
  assert.deepEqual(graph.edges['4'].map((edge) => edge[0]), ['3', '5']);
  assert.equal(Object.values(graph.edges).flat().some((edge) => edge[4] === 'way/90'), false);
  assert.ok(Object.values(graph.edges).flat().every((edge) => edge[1] > 0 && edge[2] > 0));
  assert.deepEqual(buildRoadGraph(fixture, municipality), graph);
});
```

- [ ] **Step 2: Run the builder test and verify RED**

Run: `node tests/roadGraphBuilder.test.js`

Expected: FAIL because `../scripts/build-road-graph` does not exist.

- [ ] **Step 3: Implement the shared road rules**

Use exact defaults and access semantics:

```js
const ROAD_SPEED_KPH = Object.freeze({
  primary: 35,
  primary_link: 25,
  secondary: 30,
  secondary_link: 22,
  tertiary: 25,
  tertiary_link: 20,
  residential: 20,
  unclassified: 18,
  living_street: 10,
  service: 12,
});
const BLOCKED_ACCESS = new Set(['no', 'private']);

function isRoutableWay(tags = {}) {
  return Boolean(ROAD_SPEED_KPH[tags.highway]) &&
    !BLOCKED_ACCESS.has(tags.access) &&
    !BLOCKED_ACCESS.has(tags.vehicle) &&
    !BLOCKED_ACCESS.has(tags.motor_vehicle);
}

function getWayDirection(tags = {}) {
  if (tags.oneway === '-1') return 'reverse';
  if (['yes', '1', 'true'].includes(tags.oneway) || tags.junction === 'roundabout') return 'forward';
  return 'both';
}

function getRoadSpeedKph(tags = {}) {
  const parsed = Number.parseFloat(String(tags.maxspeed ?? '').match(/[\d.]+/)?.[0]);
  return Number.isFinite(parsed)
    ? Math.min(60, Math.max(5, parsed))
    : ROAD_SPEED_KPH[tags.highway];
}
```

- [ ] **Step 4: Implement `buildRoadGraph` and its CLI**

The implementation must:

```js
function addEdge(edges, from, to, metres, seconds, way) {
  if (metres <= 0) return;
  (edges[from] ??= []).push([
    to,
    round(metres, 1),
    round(seconds, 1),
    way.tags.name || way.tags.ref || 'Unnamed road',
    `way/${way.id}`,
    way.tags.highway,
  ]);
}

function buildRoadGraph(osm, municipality) {
  validateOsm(osm);
  const polygon = createMapPolygons(municipality);
  const sourceNodes = new Map(
    osm.elements.filter(({ type }) => type === 'node').map((node) => [node.id, node]),
  );
  const nodes = {};
  const edges = {};

  for (const way of osm.elements.filter(({ type }) => type === 'way')) {
    if (!isRoutableWay(way.tags)) continue;
    const direction = getWayDirection(way.tags);
    const speed = getRoadSpeedKph(way.tags);
    for (let index = 1; index < way.nodes.length; index += 1) {
      const from = sourceNodes.get(way.nodes[index - 1]);
      const to = sourceNodes.get(way.nodes[index]);
      if (!from || !to) continue;
      const fromCoordinate = { latitude: from.lat, longitude: from.lon };
      const toCoordinate = { latitude: to.lat, longitude: to.lon };
      if (!isCoordinateInPolygons(fromCoordinate, polygon) ||
          !isCoordinateInPolygons(toCoordinate, polygon)) continue;
      nodes[from.id] = [from.lat, from.lon];
      nodes[to.id] = [to.lat, to.lon];
      const metres = haversineDistance(fromCoordinate, toCoordinate);
      const seconds = metres / (speed * 1000 / 3600);
      if (direction !== 'reverse') addEdge(edges, String(from.id), String(to.id), metres, seconds, way);
      if (direction !== 'forward') addEdge(edges, String(to.id), String(from.id), metres, seconds, way);
    }
  }

  return finalizeGraph({ osm, nodes, edges, sourceNodes, polygon });
}
```

`finalizeGraph` sorts node keys, edge tuples, spatial-cell membership, and places; derives `metadata.maxSpeedKph`; extracts named nodes plus centroids of named ways; and sets `metadata.sourceTimestamp` from `osm.osm3s.timestamp_osm_base`. The CLI requires `--input` and `--output`, reads JSON with `fs.readFileSync`, writes `JSON.stringify(graph)`, and exits non-zero with a concise error on invalid input.

- [ ] **Step 5: Expose the test command and verify GREEN**

Set the package script to:

```json
"test": "node --test tests/*.test.js"
```

Run: `node tests/roadGraphBuilder.test.js && npm test`

Expected: builder assertions pass and the full suite has zero failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add utils/roadRules.js scripts/build-road-graph.js tests/fixtures/indang-osm-small.json tests/roadGraphBuilder.test.js package.json
git commit -m "feat: add deterministic Indang road graph builder"
```

### Task 2: Generate and Validate the Production Indang Graph

**Files:**
- Create: `tests/roadGraphData.test.js`
- Create: `assets/routing/indang-road-graph.json`
- Create: `assets/routing/README.md`

**Interfaces:**
- Consumes: Task 1 `build-road-graph.js` CLI.
- Produces: committed `RoadGraphData` consumed by all runtime routing modules.

- [ ] **Step 1: Add a failing production-data integrity test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ships a bounded non-empty Indang road graph', () => {
  const graphPath = path.join(__dirname, '../assets/routing/indang-road-graph.json');
  assert.ok(fs.statSync(graphPath).size < 5 * 1024 * 1024);
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  assert.equal(graph.metadata.source, 'OpenStreetMap');
  assert.ok(Object.keys(graph.nodes).length > 100);
  assert.ok(Object.values(graph.edges).flat().length > 100);
  assert.ok(graph.places.length > 0);
  assert.match(graph.metadata.sourceTimestamp, /^\d{4}-\d{2}-\d{2}T/);
});
```

- [ ] **Step 2: Run the data test and verify RED**

Run: `node tests/roadGraphData.test.js`

Expected: FAIL with `ENOENT` for `assets/routing/indang-road-graph.json`.

- [ ] **Step 3: Download the bounded OSM snapshot**

Save this exact Overpass QL to `/tmp/indang-overpass.query` and POST it to `https://overpass-api.de/api/interpreter` as `data`:

```overpass
[out:json][timeout:180];
(
  way["highway"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["amenity"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["place"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["shop"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["tourism"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["public_transport"](14.120982,120.810720,14.246597,120.929805);
);
(._;>;);
out body;
```

Run: `curl --fail --retry 3 --data-urlencode data@/tmp/indang-overpass.query https://overpass-api.de/api/interpreter --output /tmp/indang-overpass.json`

Expected: a JSON document with `osm3s.timestamp_osm_base` and non-empty `elements`.

- [ ] **Step 4: Generate the committed graph**

Run: `node scripts/build-road-graph.js --input /tmp/indang-overpass.json --output assets/routing/indang-road-graph.json`

Expected: output reports node, edge, place, byte, and source-timestamp counts and exits zero.

- [ ] **Step 5: Document source and licence**

`assets/routing/README.md` must contain the exact bounding box and query above, the graph's actual `sourceTimestamp`, the rebuild command, `Map data © OpenStreetMap contributors`, an ODbL link to `https://www.openstreetmap.org/copyright`, and a table with actual nodes/edges/places/bytes copied from the builder output.

- [ ] **Step 6: Verify production data GREEN**

Run: `node tests/roadGraphData.test.js && npm test`

Expected: the graph stays below 5 MB and the full suite has zero failures.

- [ ] **Step 7: Commit Task 2**

```bash
git add assets/routing/indang-road-graph.json assets/routing/README.md tests/roadGraphData.test.js
git commit -m "data: bundle Indang OpenStreetMap road graph"
```

### Task 3: Fastest-Time A* Engine

**Files:**
- Create: `utils/pathfinding.js`
- Create: `tests/pathfinding.test.js`

**Interfaces:**
- Consumes: `{ metadata, nodes, edges }` from Task 2.
- Produces: `haversineDistance(a, b): number` and `findFastestPath(graph, startNodeId, goalNodeId): RoutePath|null`. `RoutePath` is `{ nodeIds, coordinates, distanceMeters, durationSeconds, segments }`; each segment is `{ fromNodeId, toNodeId, fromCoordinate, toCoordinate, distanceMeters, durationSeconds, roadName, wayId, highway }`.

- [ ] **Step 1: Write failing A* tests with hand-derived costs**

Use an inline graph where the two-edge path totals `200 m / 20 s`, the direct path totals `120 m / 30 s`, a reverse edge is absent, a second component is disconnected, and equal-cost neighbours have IDs `b` and `c`.

```js
test('chooses the fastest route and reports literal totals', () => {
  const result = findFastestPath(graph, 'a', 'd');
  assert.deepEqual(result.nodeIds, ['a', 'b', 'd']);
  assert.equal(result.distanceMeters, 200);
  assert.equal(result.durationSeconds, 20);
});

test('returns null for disconnected endpoints', () => {
  assert.equal(findFastestPath(graph, 'a', 'z'), null);
});
```

Also assert: same start/goal returns one coordinate and zero totals; unknown IDs throw `Unknown road node`; equal time prefers lower metres; equal time/metres prefers lexicographically smaller node ID; and Haversine returns approximately `111195` metres for one latitude degree.

- [ ] **Step 2: Run A* tests and verify RED**

Run: `node tests/pathfinding.test.js`

Expected: FAIL because `../utils/pathfinding` does not exist.

- [ ] **Step 3: Implement the binary min-heap**

```js
class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }
  push(value) {
    this.items.push(value);
    for (let child = this.items.length - 1; child > 0;) {
      const parent = Math.floor((child - 1) / 2);
      if (this.compare(this.items[parent], this.items[child]) <= 0) break;
      [this.items[parent], this.items[child]] = [this.items[child], this.items[parent]];
      child = parent;
    }
  }
  pop() {
    if (!this.items.length) return undefined;
    const root = this.items[0];
    const tail = this.items.pop();
    if (this.items.length) {
      this.items[0] = tail;
      this.sink(0);
    }
    return root;
  }
  sink(parent) {
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.items.length && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < this.items.length && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
      if (smallest === parent) return;
      [this.items[parent], this.items[smallest]] = [this.items[smallest], this.items[parent]];
      parent = smallest;
    }
  }
  get size() { return this.items.length; }
}
```

- [ ] **Step 4: Implement deterministic A***

Use frontier records `{ nodeId, elapsed, metres, estimate }`. Compare by `estimate`, then `elapsed`, then `metres`, then `nodeId`. The admissible heuristic is:

```js
function heuristicSeconds(graph, nodeId, goalId) {
  const metres = haversineDistance(toCoordinate(graph.nodes[nodeId]), toCoordinate(graph.nodes[goalId]));
  return metres / (graph.metadata.maxSpeedKph * 1000 / 3600);
}
```

Skip stale heap entries, update a node only for lower seconds or equal seconds with lower metres, retain `{ previousNodeId, edge }`, reconstruct segments from goal to start, and sum stored literal edge costs rather than recalculating them.

- [ ] **Step 5: Verify A* GREEN and full regression**

Run: `node tests/pathfinding.test.js && npm test`

Expected: all A* cases and the full suite pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add utils/pathfinding.js tests/pathfinding.test.js
git commit -m "feat: add fastest-time A star routing"
```

### Task 4: Graph Validation, Coordinate Snapping, and Place Search

**Files:**
- Create: `utils/roadGraph.js`
- Create: `utils/placeSearch.js`
- Create: `tests/roadGraph.test.js`
- Create: `tests/placeSearch.test.js`

**Interfaces:**
- Consumes: Task 2 graph and Task 3 `findFastestPath`/`haversineDistance`.
- Produces: `validateRoadGraph(data)`, `findNearestRoadNode(graph, coordinate, maxDistanceMeters = 750)`, `calculateRoute(graph, start, end)`, `normalizeSearchText(value)`, and `searchPlaces(places, query, limit = 6)`.

- [ ] **Step 1: Write failing graph validation and snapping tests**

Assert malformed metadata, missing neighbour nodes, invalid edge costs, and malformed spatial cells throw messages beginning `Invalid road graph:`. Use a literal 3×3 spatial fixture to assert centre-cell selection, expansion into a neighbour cell, a `null` result beyond 750 metres, and disconnected endpoints returning `{ status: 'no-route' }`.

```js
const snapped = findNearestRoadNode(graph, nearB);
assert.equal(snapped.nodeId, 'b');
assert.deepEqual(snapped.coordinate, graphCoordinateB);
assert.ok(Math.abs(snapped.distanceMeters - 11.1) < 1);
assert.equal(findNearestRoadNode(graph, farAway), null);
assert.deepEqual(calculateRoute(graph, disconnectedA, disconnectedZ), { status: 'no-route' });
```

- [ ] **Step 2: Write failing place-search tests**

Use places `Cavite State University`, `Indang Public Market`, `Índang Plaza`, and `Kayquit Road`. Assert empty/whitespace returns `[]`; `cavite` exact prefix ranks first; `indang` ranks exact normalized name before substring; `indang plaza` matches the accented label; punctuation-only returns `[]`; ties resolve by normalized name then ID; and limit truncates deterministically.

- [ ] **Step 3: Run Task 4 tests and verify RED**

Run: `node tests/roadGraph.test.js && node tests/placeSearch.test.js`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement graph validation and cell expansion**

Use a fixed `0.005`-degree cell size matching the builder. Cell keys are `${latIndex}:${lonIndex}` using `Math.floor(value / cellSize)`. Expand square rings from radius zero through the radius needed to cover 750 metres, deduplicate node IDs, compute actual Haversine distance, and choose distance then node ID.

`calculateRoute` returns one of:

```js
{ status: 'ok', route, startSnap, endSnap }
{ status: 'unsnappable', endpoint: 'pickup' | 'destination' }
{ status: 'no-route' }
```

- [ ] **Step 5: Implement normalized deterministic search**

```js
function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scorePlace(place, query) {
  const name = normalizeSearchText(place.name);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(' ').some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return Infinity;
}
```

Sort by score, normalized name, then ID and return at most `limit` original place objects.

- [ ] **Step 6: Verify Task 4 GREEN and production graph routeability**

Add an integration assertion that the CvSU and Harasan defaults both snap within 750 metres and `calculateRoute` returns `status: 'ok'` with more than two route coordinates.

Run: `node tests/roadGraph.test.js && node tests/placeSearch.test.js && npm test`

Expected: every test passes.

- [ ] **Step 7: Commit Task 4**

```bash
git add utils/roadGraph.js utils/placeSearch.js tests/roadGraph.test.js tests/placeSearch.test.js
git commit -m "feat: add road snapping and offline place search"
```

### Task 5: Route Directions and Display Metrics

**Files:**
- Create: `utils/routeDirections.js`
- Create: `tests/routeDirections.test.js`

**Interfaces:**
- Consumes: Task 3 `RoutePath.segments`, where each segment retains edge tuple fields and endpoint coordinates.
- Produces: `buildRouteDirections(routePath): RouteDetails` and formatters `formatDistance(metres)`, `formatDuration(seconds)`. `RouteDetails` is `{ coordinates, distanceMeters, durationSeconds, distanceLabel, durationLabel, steps }`; each step is `{ type, instruction, roadName, distanceMeters, startCoordinate, endCoordinate, startDistanceMeters }`.

- [ ] **Step 1: Write failing maneuver tests**

Create literal coordinate paths for north→west, north→east, small 8-degree drift, repeated same-name roads with different way IDs, consecutive unnamed ways, and a one-coordinate arrival. Assert exact step types and strings:

```js
assert.deepEqual(details.steps.map(({ type }) => type), ['depart', 'left', 'arrive']);
assert.equal(formatDistance(850), '850 m');
assert.equal(formatDistance(1540), '1.5 km');
assert.equal(formatDuration(61), '2 min');
```

Also assert total metrics copy route totals, every non-arrival step has positive metres, unnamed ways do not merge across distinct way IDs, and the final step is always `{ type: 'arrive', instruction: 'Arrive at destination' }`.

- [ ] **Step 2: Run directions tests and verify RED**

Run: `node tests/routeDirections.test.js`

Expected: FAIL because `../utils/routeDirections` does not exist.

- [ ] **Step 3: Implement bearings, grouping, and maneuver thresholds**

Normalize the signed turn delta into `[-180, 180]`. Use exact bands:

```js
function classifyTurn(delta) {
  const magnitude = Math.abs(delta);
  if (magnitude < 15) return 'continue';
  const side = delta < 0 ? 'left' : 'right';
  if (magnitude < 45) return `slight-${side}`;
  if (magnitude < 135) return side;
  return `sharp-${side}`;
}
```

Group only consecutive segments sharing both normalized road name and way ID. Build user-facing instructions from a fixed map (`left` → `Turn left`, `continue` → `Continue`) plus ` on ${roadName}` unless the name is `Unnamed road`.

- [ ] **Step 4: Verify Task 5 GREEN**

Run: `node tests/routeDirections.test.js && npm test`

Expected: directions and full suite pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add utils/routeDirections.js tests/routeDirections.test.js
git commit -m "feat: derive route metrics and maneuvers"
```

### Task 6: Foreground Pickup Location with Safe Fallback

**Files:**
- Create: `utils/pickupLocation.js`
- Create: `hooks/useCurrentPickup.js`
- Create: `tests/pickupLocation.test.js`
- Modify: `app.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Expo Location client and `isInIndangServiceArea` from `data/indangMap.js`.
- Produces: `resolveInitialPickup(locationClient, isInside, fallback, options): Promise<PickupResult>` and `useCurrentPickup(fallback): { pickup, status, message, retry }`. `options` is `{ timeoutMs = 7000, onCandidate = () => {} }`; `onCandidate` emits an in-boundary last-known location immediately while the current fix is pending.

- [ ] **Step 1: Write failing pickup-policy tests**

Inject small fake clients at the external boundary and assert returned values, not call counts:

```js
test('uses an in-boundary current fix', async () => {
  const result = await resolveInitialPickup(clientWith({ permission: 'granted', current: inside }), isInside, fallback);
  assert.deepEqual(result, { coordinate: inside, source: 'current', message: null });
});
```

Cover: denied permission → fallback message; in-boundary last-known is emitted through `onCandidate` before a deferred current promise resolves; current failure returns that last-known value; last-known outside Indang plus current inside → current; both outside → fallback; current promise timeout → in-boundary last-known; no locations → fallback. Use a 10 ms injected timeout in tests and a 7000 ms default in production.

- [ ] **Step 2: Run pickup tests and verify RED**

Run: `node tests/pickupLocation.test.js`

Expected: FAIL because `../utils/pickupLocation` does not exist.

- [ ] **Step 3: Implement the pure pickup resolver**

The injected client contract is:

```js
{
  requestPermission: () => Promise<'granted' | 'denied'>,
  getLastKnown: () => Promise<{ latitude, longitude } | null>,
  getCurrent: () => Promise<{ latitude, longitude } | null>
}
```

After permission is granted, request the last-known value first. If it is valid, invoke `onCandidate({ coordinate, source: 'last-known', message: null })` before starting the current request. Use `Promise.race` for the current timeout. Return a valid current fix, otherwise the valid last-known fix, otherwise `{ coordinate: fallback.coordinate, source: 'fallback', message }`. Never reject for permission or provider errors.

- [ ] **Step 4: Install Expo Location and configure permission copy**

Run: `npx expo install expo-location`

Add to `app.json`:

```json
"plugins": [
  [
    "expo-location",
    {
      "locationWhenInUsePermission": "Allow IndangGO to use your location to set your pickup point."
    }
  ]
]
```

- [ ] **Step 5: Implement the thin hook adapter**

The hook maps Expo responses into the pure contract, starts with the provided fallback, passes a guarded state setter as `onCandidate`, exposes `loading|ready|fallback`, guards all state updates after unmount, and implements `retry` by incrementing an internal request token. `getLastKnownPositionAsync` uses `{ maxAge: 120000, requiredAccuracy: 250 }`; `getCurrentPositionAsync` uses `Location.Accuracy.Balanced`.

- [ ] **Step 6: Verify Task 6 GREEN and Expo config**

Run: `node tests/pickupLocation.test.js && npx expo config --type public && npm test`

Expected: pickup tests pass, public config lists `expo-location`, and the full suite passes.

- [ ] **Step 7: Commit Task 6**

```bash
git add utils/pickupLocation.js hooks/useCurrentPickup.js tests/pickupLocation.test.js app.json package.json package-lock.json
git commit -m "feat: add safe current pickup location"
```

### Task 7: Reusable Route Map and Booking State Helpers

**Files:**
- Create: `utils/bookingRoute.js`
- Create: `tests/bookingRoute.test.js`
- Create: `components/RouteMap.js`
- Modify: `components/IndangMapLayers.js`
- Modify: `data/indangMap.js`

**Interfaces:**
- Consumes: route details from Tasks 4–5 and existing municipality geometry/default places.
- Produces: `getBookingState(routeResult, routeDetails)`, `createBookingPayload(input)`, and `<RouteMap pickup destination route onMapPress onUseCurrentLocation />`.

- [ ] **Step 1: Write failing booking-state tests**

Assert exact states for `calculating`, `outside-service-area`, `unsnappable`, `no-route`, graph error, and valid route. Assert a valid payload is a deep-cloned serializable object with `{ trip, route, passengers, note }`, passenger bounds are 1–4, and stale metrics never survive an error result.

```js
assert.deepEqual(getBookingState({ status: 'no-route' }), {
  canConfirm: false,
  message: 'No drivable route found. Choose another pickup or destination.',
  distanceLabel: '—',
  durationLabel: '—',
});
```

- [ ] **Step 2: Run booking-state tests and verify RED**

Run: `node tests/bookingRoute.test.js`

Expected: FAIL because `../utils/bookingRoute` does not exist.

- [ ] **Step 3: Implement booking helpers**

`getBookingState` maps every status to literal UI copy and only formats metrics for `ok`. `createBookingPayload` throws for invalid passengers or missing `status: 'ok'`, then uses `JSON.parse(JSON.stringify(value))` to guarantee navigation-safe data.

- [ ] **Step 4: Refocus the municipality layer**

Remove the route prop and dashed `Polyline` from `IndangMapLayers`; it renders only boundary polygons. Remove `DEFAULT_TRIP_COORDINATES` from `data/indangMap.js`, keep `DEFAULT_TRIP`, and add exported `DEFAULT_PLACES = [DEFAULT_TRIP.pickup, DEFAULT_TRIP.dropoff]` for guaranteed search fallbacks.

- [ ] **Step 5: Implement `RouteMap`**

Render, in this order:

```jsx
<MapView ref={mapRef} onPress={({ nativeEvent }) => onMapPress?.(nativeEvent.coordinate)}>
  <IndangMapLayers />
  {route?.coordinates?.length > 1 && <Polyline coordinates={route.coordinates} strokeColor="#FFFFFF" strokeWidth={10} />}
  {route?.coordinates?.length > 1 && <Polyline coordinates={route.coordinates} strokeColor="#2563EB" strokeWidth={6} lineCap="round" lineJoin="round" />}
  {pickup && <Marker coordinate={pickup.coordinate}>{pickupMarker}</Marker>}
  {destination && <Marker coordinate={destination.coordinate}>{destinationMarker}</Marker>}
</MapView>
```

On map `onLayout` and each route change, call `fitToCoordinates(route.coordinates, { edgePadding: { top: 180, right: 50, bottom: 300, left: 50 }, animated: true })`. Render a floating locate button and an absolute attribution link with `Linking.openURL('https://www.openstreetmap.org/copyright')`.

- [ ] **Step 6: Verify Task 7 GREEN and bundle compatibility**

Run: `node tests/bookingRoute.test.js && npm test && npx expo export --platform android --output-dir /tmp/indang-route-map-export`

Expected: tests pass and Android export exits zero.

- [ ] **Step 7: Commit Task 7**

```bash
git add utils/bookingRoute.js tests/bookingRoute.test.js components/RouteMap.js components/IndangMapLayers.js data/indangMap.js
git commit -m "feat: add reusable road route map"
```

### Task 8: Map-First Booking Screen

**Files:**
- Create: `components/LocationSearchPanel.js`
- Create: `components/BookingSheet.js`
- Modify: `screens/BookingScreen.js`

**Interfaces:**
- Consumes: production graph, `searchPlaces`, `calculateRoute`, `buildRouteDirections`, `getBookingState`, `createBookingPayload`, `useCurrentPickup`, and `RouteMap`.
- Produces: navigation payload `{ trip, route, passengers, note }` for `Searching`.

- [ ] **Step 1: Add a failing integration case to `tests/bookingRoute.test.js`**

Construct the default pickup/destination against the production graph, build route directions, call `createBookingPayload`, JSON round-trip it, and assert the payload preserves route coordinates, duration, distance, steps, passengers, and note. Mutate the original route afterward and assert the payload does not change.

- [ ] **Step 2: Run the integration case and verify RED**

Run: `node tests/bookingRoute.test.js`

Expected: FAIL until payload composition accepts the final Task 4/5 route shape.

- [ ] **Step 3: Implement `LocationSearchPanel`**

Props are `{ activeEndpoint, query, results, onQueryChange, onSelect, onClose }`. Render a white overlay below the top fields, a focused `TextInput`, at most six pressable results with name/kind, an empty-state `No matching places in the offline Indang map`, and a close button. Each result calls `onSelect(place)` and never mutates props.

- [ ] **Step 4: Implement `BookingSheet`**

Props are `{ state, passengers, note, fare, onPassengersChange, onNoteChange, onConfirm }`. Use a white top-rounded sheet with drag indicator, route summary (`durationLabel`, `distanceLabel`), Standard Trike row, 1–4 passenger stepper, collapsible note input, `₱45.00`, error/status copy, and a yellow 54 px confirmation button. Disable and reduce button opacity when `state.canConfirm` is false.

- [ ] **Step 5: Rewrite `BookingScreen` as the coordinator**

State is exactly:

```js
const [pickup, setPickup] = useState(DEFAULT_TRIP.pickup);
const [destination, setDestination] = useState(DEFAULT_TRIP.dropoff);
const [activeEndpoint, setActiveEndpoint] = useState(null);
const [query, setQuery] = useState('');
const [routeResult, setRouteResult] = useState({ status: 'calculating' });
const [passengers, setPassengers] = useState(1);
const [note, setNote] = useState('');
```

Load and validate the graph once at module scope. Use the current-pickup hook to update pickup only when its source changes. Recalculate in an effect keyed by pickup/destination coordinates; schedule calculation after setting `calculating` so the loading state can render; discard results from superseded calculations with a monotonically increasing request ID.

The hierarchy is `SafeAreaView → RouteMap → header/back button → location card → optional LocationSearchPanel → BookingSheet`. A map tap changes only `activeEndpoint`; if neither endpoint is active, it does nothing. Validate service polygon before accepting. Search results combine graph places with `DEFAULT_PLACES`, deduplicated by normalized name and rounded coordinate.

Confirm with:

```js
navigation.navigate('Searching', createBookingPayload({
  trip: { pickup, dropoff: destination },
  route: { ...routeResult.route, ...routeDetails },
  passengers,
  note,
}));
```

- [ ] **Step 6: Make the Task 8 test GREEN**

Run: `node tests/bookingRoute.test.js && npm test`

Expected: integration payload and full suite pass.

- [ ] **Step 7: Verify the redesigned booking screen on Android**

Run: `npx expo export --platform android --output-dir /tmp/indang-booking-export`

Then launch through the established WSL command with `EXPO_PUBLIC_API_URL=http://127.0.0.1:3000`, Android SDK path, `./start.sh --android --localhost`, and the reachable WSL address. Verify: full-screen map; white top location card; blue/white route; ETA/distance; passenger limits; disabled confirm on invalid tap; search selection; and visible OSM attribution.

- [ ] **Step 8: Commit Task 8**

```bash
git add components/LocationSearchPanel.js components/BookingSheet.js screens/BookingScreen.js tests/bookingRoute.test.js
git commit -m "feat: redesign map-first booking experience"
```

### Task 9: Reuse the Confirmed Route During Search and Active Ride

**Files:**
- Modify: `screens/SearchingScreen.js`
- Modify: `screens/ActiveRideScreen.js`
- Modify: `utils/bookingRoute.js`
- Modify: `tests/bookingRoute.test.js`

**Interfaces:**
- Consumes: Task 8 navigation payload.
- Produces: `getRouteProgress(route, fraction)` for prototype driver position/maneuver index and route-preserving navigation to `ActiveRide`.

- [ ] **Step 1: Write failing route-progress tests**

For a three-segment route with literal cumulative distances, assert fractions `0`, `0.5`, and `1` return pickup, an interpolated coordinate on the distance midpoint, and destination. Assert negative clamps to zero, above one clamps to one, zero-length route returns its only coordinate, and the active maneuver index advances after each step's cumulative distance.

- [ ] **Step 2: Run route-progress tests and verify RED**

Run: `node tests/bookingRoute.test.js`

Expected: FAIL because `getRouteProgress` is missing.

- [ ] **Step 3: Implement distance-based prototype progress**

Walk route coordinates and Haversine segment lengths until `clamp(fraction, 0, 1) * totalDistance` falls inside a segment, linearly interpolate latitude/longitude, and select the last step whose cumulative start distance is not greater than travelled distance.

- [ ] **Step 4: Update `SearchingScreen`**

Read `trip`, `route`, `passengers`, and `note` directly from `route.params`; use a backward-compatible default payload only when params are absent. Render `RouteMap` with confirmed geometry and no endpoint editing. Show formatted ETA/distance and passenger count. Pass the same four fields unchanged to `navigation.replace('ActiveRide', payload)` after the existing four-second prototype delay.

- [ ] **Step 5: Update `ActiveRideScreen`**

Replace the three synthetic driver coordinates with `getRouteProgress(route, [0, 0.5, 1][rideState])`. Render the blue/white confirmed route via `RouteMap` or its shared route layer. Add a top maneuver banner showing the current step's icon/type, instruction, and remaining step distance. Keep the existing three-state prototype control but label it clearly as ride progress; retain call/report controls and bottom navigation.

- [ ] **Step 6: Verify Task 9 GREEN and Android flow**

Run: `node tests/bookingRoute.test.js && npm test && npx expo export --platform android --output-dir /tmp/indang-active-route-export`

On the emulator, confirm a route, wait for searching to transition, advance ride state twice, and verify route geometry/metrics remain identical while the driver marker and maneuver advance.

- [ ] **Step 7: Commit Task 9**

```bash
git add screens/SearchingScreen.js screens/ActiveRideScreen.js utils/bookingRoute.js tests/bookingRoute.test.js
git commit -m "feat: carry road route through active ride"
```

### Task 10: Performance, Licence, and Final Verification

**Files:**
- Modify: `tests/roadGraphData.test.js`
- Modify: `assets/routing/README.md`

**Interfaces:**
- Consumes: complete Tasks 1–9 implementation.
- Produces: measured performance assertions, final verification evidence, and reproducible launch notes in the routing README.

- [ ] **Step 1: Add performance tests before optimization**

Use `performance.now()` around production graph `validateRoadGraph`, default-route `calculateRoute`, and a worst-case common query selected from opposite graph bounds. Run each route five times after one warm-up and assert the median default and bounds queries are below 150 ms; assert graph validation is below 500 ms and 20 representative searches together remain below 1000 ms (50 ms average).

- [ ] **Step 2: Run performance tests and record RED or GREEN baseline**

Run: `node tests/roadGraphData.test.js`

Expected: all correctness assertions pass; any missed budget fails with its measured duration in the assertion message.

- [ ] **Step 3: Apply only measured optimizations if needed**

Allowed optimizations are: cache validated node coordinates, avoid repeated string normalization by emitting `searchName` in build output, replace object spread in the A* loop with scalar records, and simplify only non-intersection geometry in the builder. Re-run the exact failing measurement after each single optimization. Do not change route cost semantics or remove named intersections.

- [ ] **Step 4: Update routing documentation with actual measurements**

Add the emulator/device model, graph byte size, node/edge/place totals, graph-init duration, default A* duration, bounds A* duration, and search duration. Include exact WSL launch steps: ADB reverse ports `8081` and `3000`, start with `--android --localhost`, and open `exp://<current-WSL-eth0-address>:8081` when Expo chooses the Docker bridge.

- [ ] **Step 5: Run complete automated verification**

Run:

```bash
npm test
git diff --check
npx expo config --type public
npx expo export --platform android --output-dir /tmp/indang-final-route-export
```

Expected: zero test failures, no whitespace errors, location plugin present, and Android export exits zero.

- [ ] **Step 6: Run end-to-end emulator verification**

Start MongoDB, backend, Metro, and the Android app through `start.sh`; confirm current-location fallback, search, map tap, route recomputation, invalid selection, booking, searching transition, and active-ride maneuver progression. Capture the final Booking and Active Ride screens and inspect for clipped controls or attribution.

- [ ] **Step 7: Review the complete diff against the spec acceptance checklist**

Check every item in `docs/superpowers/specs/2026-09-22-offline-a-star-booking-route-design.md`. Record any unmet item instead of declaring completion.

- [ ] **Step 8: Commit Task 10**

```bash
git add tests/roadGraphData.test.js assets/routing/README.md
git commit -m "test: verify offline routing experience"
```
