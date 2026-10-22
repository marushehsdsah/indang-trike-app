const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = () => import('../web/god-view/src/model.mjs');

test('dashboard filters combine role with case-insensitive name and vehicle search', async () => {
  const { filterUsers } = await model();
  const users = [{ id: 'd', role: 'driver', name: 'Ana Cruz', plate: 'ABC-123', toda: 'Indang Poblacion' }, { id: 'p', role: 'passenger', name: 'Ana Reyes' }];
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

test('every ride stage is drawn as solid lines: the request, the driver to the passenger, the trip', async () => {
  const { routeFeatures, routeSummary, formatDistance, formatDuration } = await model();
  const approach = { coordinates: [[120.86, 14.39], [120.88, 14.38]], distanceMeters: 2100, durationSeconds: 380 };
  const trip = { coordinates: [[120.88, 14.38], [120.91, 14.32]], distanceMeters: 7900, durationSeconds: 1020 };
  const stops = { pickup: { name: 'CvSU', coordinate: [120.88, 14.38] }, dropoff: { name: 'Vista Mall', coordinate: [120.91, 14.32] } };
  const toPickup = { rideId: 'r1', stage: 'to-pickup', driverId: 'd', passengerId: 'p', approach, trip, ...stops };
  const kinds = (collection) => collection.features.map(({ properties, geometry }) => `${properties.kind}:${geometry.type}`);

  assert.deepEqual(kinds(routeFeatures([{ ...toPickup, stage: 'requested', driverId: null, approach: null }], null)), ['requested:LineString', 'pickup:Point', 'dropoff:Point']);
  assert.deepEqual(kinds(routeFeatures([toPickup], null)), ['trip:LineString', 'approach:LineString', 'pickup:Point', 'dropoff:Point']);
  assert.deepEqual(routeFeatures([toPickup], null).features[1].geometry.coordinates, approach.coordinates, 'the driver on the way to the passenger');
  assert.deepEqual(kinds(routeFeatures([{ ...toPickup, stage: 'to-destination', approach: null }], null)), ['trip:LineString', 'pickup:Point', 'dropoff:Point']);
  assert.deepEqual(kinds(routeFeatures([{ ...toPickup, approach: null }], null)), ['trip:LineString', 'pickup:Point', 'dropoff:Point'], 'no driver line without live GPS');
  assert.equal(routeFeatures([toPickup], 'r1').features[0].properties.selected, true);

  assert.deepEqual(routeSummary({ ...toPickup, stage: 'requested', approach: null }), ['Requested trip: 7.9 km · 17 min', 'Waiting for a driver']);
  assert.deepEqual(routeSummary(toPickup), ['Driver to passenger: 2.1 km · 6 min', 'Then trip: 7.9 km · 17 min']);
  assert.deepEqual(routeSummary({ ...toPickup, approach: null }), ['Driver to passenger: waiting for live GPS', 'Then trip: 7.9 km · 17 min']);
  assert.deepEqual(routeSummary({ ...toPickup, stage: 'to-destination' }), ['To destination: 7.9 km · 17 min']);
  assert.equal(formatDistance(640), '640 m');
  assert.equal(formatDuration(5400), '1 h 30 min');
});

test('a driver and passenger on a trip share one marker at the trike', async () => {
  const { mapPeople, tripOf } = await model();
  const at = (latitude) => ({ latitude, longitude: 120.88, timestamp: 1, accuracy: 5 });
  const users = [
    { id: 'd1', role: 'driver', name: 'Alex', location: at(14.38), locationStatus: 'live' },
    { id: 'p1', role: 'passenger', name: 'Bea', location: at(14.381), locationStatus: 'live' },
    { id: 'd2', role: 'driver', name: 'Cy', location: null, locationStatus: 'unavailable' },
    { id: 'p2', role: 'passenger', name: 'Di', location: at(14.2), locationStatus: 'stale' },
    { id: 'd3', role: 'driver', name: 'Ed', location: at(14.3), locationStatus: 'live' },
    { id: 'p3', role: 'passenger', name: 'Fe', location: at(14.31), locationStatus: 'live' },
  ];
  const routes = [
    { rideId: 'riding', stage: 'to-destination', driverId: 'd1', passengerId: 'p1' },
    { rideId: 'no-driver-fix', stage: 'to-destination', driverId: 'd2', passengerId: 'p2' },
    { rideId: 'on-the-way', stage: 'to-pickup', driverId: 'd3', passengerId: 'p3' },
  ];
  const people = mapPeople(users, routes);
  assert.deepEqual(people.map((item) => item.id), ['d3', 'p3', 'trip:riding', 'trip:no-driver-fix'], 'only riders together are merged');
  const riding = people.find((item) => item.id === 'trip:riding');
  assert.deepEqual({ ...riding, location: riding.location.latitude },
    { id: 'trip:riding', role: 'trip', name: 'Alex and Bea', location: 14.38, locationStatus: 'live', members: ['d1', 'p1'], selectId: 'd1' }, 'placed by the driver\'s phone');
  assert.equal(people.find((item) => item.id === 'trip:no-driver-fix').location.latitude, 14.2, 'the passenger\'s phone when the driver has no fix');
  assert.equal(tripOf('p1', routes).rideId, 'riding');
  assert.equal(tripOf('d3', routes), null, 'on the way to pickup is not a shared trip');
  assert.deepEqual(mapPeople(users.filter((user) => user.id !== 'p1'), routes).map((item) => item.id).includes('d1'), true, 'a trip whose passenger is filtered out shows the driver alone');
});

test('person details show the rating average and any safety reports', async () => {
  const { ratingLabel, safetyReportLabel } = await model();
  assert.equal(ratingLabel({ rating: { average: 4.75, count: 12 } }), 'Rated 4.8 from 12 trips');
  assert.equal(ratingLabel({ rating: { average: 5, count: 1 } }), 'Rated 5.0 from 1 trip');
  assert.equal(ratingLabel({ rating: { average: null, count: 0 } }), 'No ratings yet');
  assert.equal(ratingLabel({}), 'No ratings yet');
  assert.equal(safetyReportLabel({ safetyReports: 2 }), '2 safety reports to review');
  assert.equal(safetyReportLabel({ safetyReports: 1 }), '1 safety report to review');
  assert.equal(safetyReportLabel({ safetyReports: 0 }), null);
});

test('the Accounts view lists every passenger and driver, online first, filtered by type, connection and search', async () => {
  const { accountCounts, filterAccounts, formatPhone, roleCountLabel, sortAccounts } = await model();
  const accounts = [
    { key: 'p1', id: '09171234567', name: 'Ana Cruz', email: 'ana@example.com', role: 'PASSENGER', status: 'Offline' },
    { key: 'd1', id: '09181234567', name: 'Ben Reyes', email: 'ben@example.com', role: 'RIDER', status: 'Available', toda: 'ITODA', plate: 'ABC 123' },
    { key: 'd2', id: '09191234567', name: 'Cy Lim', email: '', role: 'RIDER', status: 'Offline', toda: 'PITODA', plate: 'XYZ 9' },
    { key: 'p2', id: '09201234567', name: 'Di Santos', email: 'di@example.com', role: 'PASSENGER', status: 'Online' },
  ];
  const keys = (list) => list.map((account) => account.key);
  assert.deepEqual(keys(sortAccounts(accounts)), ['d1', 'p2', 'p1', 'd2'], 'online accounts first, then by name');
  assert.deepEqual(keys(filterAccounts(accounts, 'all', 'online', '')), ['d1', 'p2'], 'a driver taking requests is online');
  assert.deepEqual(keys(filterAccounts(accounts, 'driver', 'offline', '')), ['d2']);
  assert.deepEqual(keys(filterAccounts(accounts, 'passenger', 'all', '')), ['p1', 'p2']);
  assert.deepEqual(keys(filterAccounts(accounts, 'all', 'all', '0918 123 4567')), ['d1'], 'a number matches with its spaces');
  assert.deepEqual(keys(filterAccounts(accounts, 'all', 'all', ' pitoda ')), ['d2']);
  assert.deepEqual(keys(filterAccounts(accounts, 'all', 'all', 'DI@EXAMPLE')), ['p2']);
  assert.deepEqual(filterAccounts(accounts, 'all', 'all', 'nobody'), []);
  const counts = accountCounts(accounts);
  assert.deepEqual(counts, { all: { total: 4, driver: 2, passenger: 2 }, online: { total: 2, driver: 1, passenger: 1 }, offline: { total: 2, driver: 1, passenger: 1 } });
  assert.equal(roleCountLabel(counts.online), '1 driver · 1 passenger');
  assert.equal(roleCountLabel(counts.all), '2 drivers · 2 passengers');
  assert.equal(formatPhone('09171234567'), '0917 123 4567');
  assert.equal(formatPhone('+639171234567'), '+639171234567', 'anything else is shown as stored');
});

test('a trip history filters by status, with searches that found no driver among the cancelled', async () => {
  const { cancellationLabel, filterTrips, formatFare } = await model();
  const trips = [{ key: 'a', status: 'Completed' }, { key: 'b', status: 'Cancelled' }, { key: 'c', status: 'No driver' }, { key: 'd', status: 'Ongoing' }];
  const keys = (list) => list.map((trip) => trip.key);
  assert.deepEqual(keys(filterTrips(trips, 'all')), ['a', 'b', 'c', 'd']);
  assert.deepEqual(keys(filterTrips(trips, 'completed')), ['a']);
  assert.deepEqual(keys(filterTrips(trips, 'cancelled')), ['b', 'c']);
  assert.deepEqual(keys(filterTrips(trips, 'ongoing')), ['d']);
  assert.equal(formatFare(45), '₱45');
  assert.equal(formatFare(1250.5), '₱1,250.5');
  assert.equal(formatFare(null), '—');
  assert.equal(cancellationLabel({ cancelledBy: 'driver', cancellationReason: 'Flat tyre' }), 'By the driver: Flat tyre');
  assert.equal(cancellationLabel({ cancelledBy: 'passenger', cancellationReason: 'Cancelled by participant' }), 'By the passenger', 'the reason saved when none was given');
  assert.equal(cancellationLabel({ cancelledBy: null, cancellationReason: '' }), 'Cancelled');
});
