const test = require('node:test');
const assert = require('node:assert/strict');
const { ARRIVE_RADIUS_METERS, distanceToStop, hasReachedStop, remainingRoute } = require('../utils/tripProgress');
const { haversineDistance } = require('../utils/pathfinding');

// A straight road north from (14.19, 120.88), about 1.1 km long, with a point
// every ~111 m.
const ORIGIN = { latitude: 14.19, longitude: 120.88 };
const step = (n, east = 0) => ({ latitude: ORIGIN.latitude + n * 0.001, longitude: ORIGIN.longitude + east });
const coordinates = Array.from({ length: 11 }, (_, n) => step(n));
const route = { coordinates, distanceMeters: haversineDistance(coordinates[0], coordinates[10]), durationSeconds: 300 };

test('a driver reaches a stop only within the arrival radius', () => {
  const stop = step(10);
  assert.equal(hasReachedStop(step(10), stop, route), true);
  assert.equal(hasReachedStop(step(9.8), stop, route), true); // ~22 m short
  assert.equal(hasReachedStop(step(9.5), stop, route), false); // ~55 m short
  assert.equal(hasReachedStop(null, stop, route), false);
  assert.ok(ARRIVE_RADIUS_METERS < 55);
});

test('a stop pinned off the road counts as reached at the road end', () => {
  const pinnedInBuilding = step(10, 0.0008); // ~86 m east of the road end
  assert.ok(distanceToStop(step(10), pinnedInBuilding, null) > ARRIVE_RADIUS_METERS);
  assert.equal(hasReachedStop(step(10), pinnedInBuilding, route), true);
});

test('the remaining route starts at the vehicle and shrinks as it moves', () => {
  const start = remainingRoute(route, step(0));
  const halfway = remainingRoute(route, step(5, 0.0001)); // ~11 m beside the road
  assert.ok(Math.abs(start.remainingMeters - route.distanceMeters) < 1);
  assert.ok(Math.abs(halfway.remainingMeters - route.distanceMeters / 2) < 2);
  assert.ok(Math.abs(halfway.remainingSeconds - 150) < 1);
  assert.ok(Math.abs(halfway.coordinates[0].latitude - step(5).latitude) < 1e-6);
  assert.deepEqual(halfway.coordinates.at(-1), step(10));
});

test('a vehicle off the route gets no trimmed route', () => {
  assert.equal(remainingRoute(route, step(5, 0.001)), null); // ~108 m away
  assert.equal(remainingRoute(null, step(5)), null);
});
