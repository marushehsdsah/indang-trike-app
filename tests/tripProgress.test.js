const test = require('node:test');
const assert = require('node:assert/strict');
const { ARRIVE_RADIUS_METERS, REROUTE_COOLDOWN_MS, advanceLeg, distanceToStop, hasReachedStop, remainingRoute } = require('../utils/tripProgress');
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

test('a live leg trims its route on the way and searches again only when off it, throttled', () => {
  let searches = 0;
  const reroute = () => { searches += 1; return route; };
  // The first position has no route yet: one search.
  const at = (n, east) => ({ latitude: ORIGIN.latitude + n * 0.001, longitude: ORIGIN.longitude + (east ?? 0) });
  let leg = advanceLeg({}, { vehicle: at(0), now: 0, reroute });
  assert.equal(searches, 1);
  // On the route, later positions only trim it.
  for (let n = 1; n <= 5; n += 1) leg = advanceLeg(leg.state, { vehicle: at(n), now: n * 500, reroute });
  assert.equal(searches, 1);
  assert.equal(leg.live, true);
  assert.ok(Math.abs(leg.display.coordinates[0].latitude - at(5).latitude) < 1e-6);
  assert.match(leg.display.distanceLabel, /m$/);
  // Off the route: searched again, but not again within the cooldown.
  const off = at(5, 0.001);
  leg = advanceLeg(leg.state, { vehicle: off, now: REROUTE_COOLDOWN_MS - 1, reroute });
  assert.equal(searches, 1, 'within the cooldown of the first search');
  leg = advanceLeg(leg.state, { vehicle: off, now: REROUTE_COOLDOWN_MS + 1, reroute });
  assert.equal(searches, 2);
  leg = advanceLeg(leg.state, { vehicle: off, now: 3 * REROUTE_COOLDOWN_MS, reroute });
  assert.equal(searches, 2, 'not moved since the last search');
});
