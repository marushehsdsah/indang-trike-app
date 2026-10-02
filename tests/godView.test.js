const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = () => import('../web/god-view/src/model.mjs');

test('dashboard filters combine role with case-insensitive name and vehicle search', async () => {
  const { filterUsers } = await model();
  const users = [{ id: 'd', role: 'driver', name: 'Ana Cruz', plate: 'ABC-123', toda: 'Gentri' }, { id: 'p', role: 'passenger', name: 'Ana Reyes' }];
  assert.deepEqual(filterUsers(users, 'driver', ' ana ').map(user => user.id), ['d']);
  assert.deepEqual(filterUsers(users, 'all', 'abc-123').map(user => user.id), ['d']);
  assert.deepEqual(filterUsers(users, 'all', 'missing'), []);
});

test('dashboard ages a fix without a new snapshot and never shows a disconnected fix as live', async () => {
  const { isLive, locationLabel } = await model();
  const user = { locationStatus: 'live', location: { timestamp: 100000, accuracy: 8 } };
  assert.equal(isLive(user, 100001, true), true);
  assert.equal(isLive(user, 130001, true), false);
  assert.equal(isLive(user, 100001, false), false);
  assert.match(locationLabel(user, 140000, true), /Last known/);
  assert.match(locationLabel(user, 100001, false), /Updates paused/);
  assert.equal(locationLabel({ location: null }, 100001, true), 'Waiting for GPS');
});

test('transport delays count toward snapshot age instead of making old GPS fresh', async () => {
  const { snapshotTiming, isLive } = await model();
  const timing = snapshotTiming(200000, 100000, 145000);
  assert.equal(timing.connected, false);
  assert.equal(145000 + timing.serverOffset, 245000);
  assert.equal(isLive({ locationStatus: 'live', location: { timestamp: 200000 } }, 145000 + timing.serverOffset, timing.connected), false);
  assert.equal(snapshotTiming(200000, 100000, 100200).connected, true);
});

test('a matched ride is drawn as its route guide: the leg driven now, then the trip ahead', async () => {
  const { routeFeatures, routeSummary, formatDistance, formatDuration } = await model();
  const approach = { coordinates: [[120.86, 14.39], [120.88, 14.38]], distanceMeters: 2100, durationSeconds: 380 };
  const trip = { coordinates: [[120.88, 14.38], [120.91, 14.32]], distanceMeters: 7900, durationSeconds: 1020 };
  const stops = { pickup: { name: 'CvSU', coordinate: [120.88, 14.38] }, dropoff: { name: 'Vista Mall', coordinate: [120.91, 14.32] } };
  const toPickup = { rideId: 'r1', stage: 'to-pickup', driverId: 'd', passengerId: 'p', approach, trip, ...stops };
  const kinds = (collection) => collection.features.map(({ properties, geometry }) => `${properties.kind}:${geometry.type}`);

  assert.deepEqual(kinds(routeFeatures([toPickup], null)), ['current:LineString', 'upcoming:LineString', 'pickup:Point', 'dropoff:Point']);
  assert.deepEqual(routeFeatures([toPickup], null).features[0].geometry.coordinates, approach.coordinates, 'the driver is on the way to the pickup');
  assert.deepEqual(kinds(routeFeatures([{ ...toPickup, stage: 'to-destination', approach: null }], null)), ['current:LineString', 'pickup:Point', 'dropoff:Point']);
  assert.deepEqual(kinds(routeFeatures([{ ...toPickup, approach: null }], null)), ['upcoming:LineString', 'pickup:Point', 'dropoff:Point'], 'no driver line without live GPS');
  assert.equal(routeFeatures([toPickup], 'r1').features[0].properties.selected, true);

  assert.deepEqual(routeSummary(toPickup), ['Driver to pickup: 2.1 km · 6 min', 'Then trip: 7.9 km · 17 min']);
  assert.deepEqual(routeSummary({ ...toPickup, approach: null }), ['Driver to pickup: waiting for live GPS', 'Then trip: 7.9 km · 17 min']);
  assert.deepEqual(routeSummary({ ...toPickup, stage: 'to-destination' }), ['To destination: 7.9 km · 17 min']);
  assert.equal(formatDistance(640), '640 m');
  assert.equal(formatDuration(5400), '1 h 30 min');
});
