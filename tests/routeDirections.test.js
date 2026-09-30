const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRouteDirections, formatDistance, formatDuration } = require('../utils/routeDirections');
const { haversineDistance } = require('../utils/pathfinding');

const round = (value) => Math.round(value * 10) / 10;
const point = ([latitude, longitude]) => ({ latitude, longitude });

// Builds a RoutePath from points and one [roadName, wayId] pair per segment.
function routeFrom(points, ways) {
  const segments = ways.map(([roadName, wayId], index) => {
    const fromCoordinate = point(points[index]);
    const toCoordinate = point(points[index + 1]);
    const distanceMeters = round(haversineDistance(fromCoordinate, toCoordinate));
    return {
      fromNodeId: String(index),
      toNodeId: String(index + 1),
      fromCoordinate,
      toCoordinate,
      distanceMeters,
      durationSeconds: round(distanceMeters / 5),
      roadName,
      wayId,
      highway: 'residential',
    };
  });
  return {
    nodeIds: points.map((_, index) => String(index)),
    coordinates: points.map(point),
    distanceMeters: round(segments.reduce((sum, { distanceMeters }) => sum + distanceMeters, 0)),
    durationSeconds: round(segments.reduce((sum, { durationSeconds }) => sum + durationSeconds, 0)),
    segments,
  };
}

const types = (details) => details.steps.map(({ type }) => type);
const instructions = (details) => details.steps.map(({ instruction }) => instruction);

// 0.001 degrees of latitude is about 111 m north.
const START = [14.2, 120.88];
const NORTH = [14.201, 120.88];
const NORTH_THEN_WEST = [14.201, 120.879];
const NORTH_THEN_EAST = [14.201, 120.881];
const NORTH_TWICE = [14.202, 120.88];
// 8 degrees east of north, about 111 m past NORTH.
const NORTH_THEN_DRIFT = [14.20199027, 120.88014356];

test('turns left from north to west and ends with arrival', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_THEN_WEST],
    [['Mabini Street', 'way/1'], ['Rizal Street', 'way/2']],
  ));
  assert.deepEqual(types(details), ['depart', 'left', 'arrive']);
  assert.deepEqual(instructions(details), [
    'Head north on Mabini Street',
    'Turn left on Rizal Street',
    'Arrive at destination',
  ]);
});

test('turns right from north to east', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_THEN_EAST],
    [['Mabini Street', 'way/1'], ['Rizal Street', 'way/2']],
  ));
  assert.deepEqual(types(details), ['depart', 'right', 'arrive']);
  assert.equal(details.steps[1].roadName, 'Rizal Street');
});

test('treats a small 8-degree drift onto a new road as continue', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_THEN_DRIFT],
    [['Mabini Street', 'way/1'], ['Rizal Street', 'way/2']],
  ));
  assert.deepEqual(types(details), ['depart', 'continue', 'arrive']);
  assert.equal(details.steps[1].instruction, 'Continue on Rizal Street');
});

test('merges a named road split into several ways when it continues straight', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_TWICE],
    [['Mabini Street', 'way/1'], ['Mabini Street', 'way/3']],
  ));
  assert.deepEqual(types(details), ['depart', 'arrive']);
  assert.equal(details.steps[0].distanceMeters, details.distanceMeters);
  assert.deepEqual(details.steps[0].endCoordinate, point(NORTH_TWICE));
});

test('follows a named road through slight bends where its ways split', () => {
  // About 30 degrees east of north: a slight right if the road name changed.
  const bend = [14.201866, 120.880515];
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, bend],
    [['Indang-Alfonso Road', 'way/1'], ['Indang-Alfonso Road', 'way/3']],
  ));
  assert.deepEqual(types(details), ['depart', 'arrive']);

  const renamed = buildRouteDirections(routeFrom(
    [START, NORTH, bend],
    [['Indang-Alfonso Road', 'way/1'], ['Pulo Road', 'way/3']],
  ));
  assert.deepEqual(types(renamed), ['depart', 'slight-right', 'arrive']);
});

test('keeps a turn that stays on the same road name', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_THEN_WEST],
    [['Mabini Street', 'way/1'], ['Mabini Street', 'way/3']],
  ));
  assert.deepEqual(instructions(details), [
    'Head north on Mabini Street',
    'Turn left on Mabini Street',
    'Arrive at destination',
  ]);
});

test('does not merge consecutive unnamed ways with different way IDs', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_TWICE],
    [['Unnamed road', 'way/7'], ['Unnamed road', 'way/8']],
  ));
  assert.deepEqual(types(details), ['depart', 'continue', 'arrive']);
  assert.deepEqual(instructions(details), ['Head north', 'Continue', 'Arrive at destination']);
  assert.equal(details.steps[0].roadName, null);
});

test('groups consecutive segments of one unnamed way', () => {
  const details = buildRouteDirections(routeFrom(
    [START, NORTH, NORTH_TWICE],
    [['Unnamed road', 'way/7'], ['Unnamed road', 'way/7']],
  ));
  assert.deepEqual(types(details), ['depart', 'arrive']);
});

test('measures turns over the road near the junction, not a tiny final kink', () => {
  // Mabini Street ends with a 2 m jog east before the left turn onto Rizal Street.
  const details = buildRouteDirections(routeFrom(
    [START, [14.2009, 120.88], [14.2009, 120.88002], [14.2009, 120.879]],
    [['Mabini Street', 'way/1'], ['Mabini Street', 'way/1'], ['Rizal Street', 'way/2']],
  ));
  assert.deepEqual(types(details), ['depart', 'left', 'arrive']);
});

test('copies route totals and lays steps end to end', () => {
  const route = routeFrom(
    [START, NORTH, NORTH_THEN_WEST],
    [['Mabini Street', 'way/1'], ['Rizal Street', 'way/2']],
  );
  const details = buildRouteDirections(route);

  assert.deepEqual(details.coordinates, route.coordinates);
  assert.equal(details.distanceMeters, route.distanceMeters);
  assert.equal(details.durationSeconds, route.durationSeconds);
  assert.equal(details.distanceLabel, formatDistance(route.distanceMeters));
  assert.equal(details.durationLabel, formatDuration(route.durationSeconds));

  const [depart, left, arrive] = details.steps;
  assert.ok(depart.distanceMeters > 0 && left.distanceMeters > 0);
  assert.equal(depart.startDistanceMeters, 0);
  assert.deepEqual(depart.startCoordinate, point(START));
  assert.deepEqual(depart.endCoordinate, point(NORTH));
  assert.equal(left.startDistanceMeters, depart.distanceMeters);
  assert.deepEqual(left.startCoordinate, point(NORTH));
  assert.deepEqual(arrive, {
    type: 'arrive',
    instruction: 'Arrive at destination',
    roadName: null,
    distanceMeters: 0,
    startCoordinate: point(NORTH_THEN_WEST),
    endCoordinate: point(NORTH_THEN_WEST),
    startDistanceMeters: route.distanceMeters,
  });
});

test('returns only an arrival step for a one-coordinate route', () => {
  const details = buildRouteDirections({
    nodeIds: ['0'],
    coordinates: [point(START)],
    distanceMeters: 0,
    durationSeconds: 0,
    segments: [],
  });
  assert.deepEqual(details.steps, [{
    type: 'arrive',
    instruction: 'Arrive at destination',
    roadName: null,
    distanceMeters: 0,
    startCoordinate: point(START),
    endCoordinate: point(START),
    startDistanceMeters: 0,
  }]);
  assert.equal(details.distanceLabel, '0 m');
});

test('formats distances and durations for display', () => {
  assert.equal(formatDistance(850), '850 m');
  assert.equal(formatDistance(1540), '1.5 km');
  assert.equal(formatDistance(999.6), '1.0 km');
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDuration(61), '2 min');
  assert.equal(formatDuration(30), '1 min');
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(3720), '1 h 2 min');
});
