const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adminAccess, managesDriver, buildOverview, buildAccounts, buildDriver, buildTodas, driverApproval, buildTrips, buildHistory, historySummary, historyPeriod, tripStatus } = require('../indang-trike-backend/admin');
const { profileFields, publicUser } = require('../indang-trike-backend/policy');
const { suspensionMessage, suspensionOf } = require('../utils/reports');
const { STAFF_ROLES, isStaff, NO_EMAIL_ROLES, usesEmail } = require('../utils/roles');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { TODA_NAMES } = require('../data/todaZones');

const now = 1800000000000;
const fix = { ...DEFAULT_TRIP.pickup.coordinate, timestamp: now, accuracy: 8, receivedAt: now, privateValue: 'hidden' };
const user = (id, fields = {}) => ({ _id: id, firstName: 'Pilot', lastName: id, role: 'passenger', locationAvailable: true, ...fields });

test('a superadmin reaches everything, an admin only their TODA, and no one else anything', () => {
  assert.deepEqual(adminAccess({ role: 'superadmin' }), { superadmin: true, toda: null });
  assert.deepEqual(adminAccess({ role: 'superadmin', toda: 'BCITODA' }), { superadmin: true, toda: null }, 'a TODA left on a superadmin limits nothing');
  assert.deepEqual(adminAccess({ role: 'admin', toda: 'BCITODA' }), { superadmin: false, toda: 'BCITODA' });
  // A TODA typed in Atlas by hand is matched by any of its names and spellings.
  assert.deepEqual(adminAccess({ role: 'admin', toda: 'bci toda' }), { superadmin: false, toda: 'BCITODA' });
  assert.deepEqual(adminAccess({ role: 'admin', toda: 'ITODA PITODA' }), { superadmin: false, toda: 'ITODA' });
  // An admin without one of Indang's TODAs reaches nothing until one is assigned.
  for (const toda of [undefined, '', 'Pilot TODA']) assert.equal(adminAccess({ role: 'admin', toda }), null, String(toda));
  // Roles decide, and no number or spelling of one grants access.
  for (const role of ['passenger', 'driver', undefined, 'Admin', 'SuperAdmin', 'super admin']) assert.equal(adminAccess({ role, toda: 'BCITODA' }), null, String(role));
  assert.equal(adminAccess(null), null);
});

test('an admin manages the drivers of their TODA, saved under any of its names; a superadmin every driver', () => {
  const bci = adminAccess({ role: 'admin', toda: 'BCITODA' }), itoda = adminAccess({ role: 'admin', toda: 'ITODA' });
  assert.equal(managesDriver(bci, { toda: 'BCITODA' }), true);
  assert.equal(managesDriver(bci, { toda: 'bcitoda' }), true);
  assert.equal(managesDriver(itoda, { toda: 'ITODA PITODA' }), true, 'a driver saved under the former name');
  assert.equal(managesDriver(itoda, { toda: 'PITODA' }), false, 'PITODA is its own TODA');
  for (const toda of ['ITODA', 'Pilot TODA', '', undefined]) assert.equal(managesDriver(bci, { toda }), false, String(toda));
  assert.equal(managesDriver(bci, null), false, 'no driver');
  const superadmin = adminAccess({ role: 'superadmin' });
  for (const toda of ['BCITODA', 'Pilot TODA', undefined]) assert.equal(managesDriver(superadmin, { toda }), true, String(toda));
  assert.equal(managesDriver(null, { toda: 'BCITODA' }), false, 'no access');
});

test('staff accounts are the admins and superadmins', () => {
  assert.deepEqual(STAFF_ROLES, ['admin', 'superadmin']);
  assert.deepEqual(['admin', 'superadmin', 'passenger', 'driver', undefined].map(isStaff), [true, true, false, false, false]);
});

test('for now neither staff role has an email; passengers and drivers do', () => {
  assert.deepEqual(NO_EMAIL_ROLES, ['admin', 'superadmin']);
  assert.deepEqual(['admin', 'superadmin', 'passenger', 'driver', undefined].map(usesEmail), [false, false, true, true, true]);
});

test('a profile edit never changes a staff account\'s role or TODA', () => {
  const profile = { firstName: 'Pilot', lastName: 'Admin', email: 'pilot@example.com', role: 'passenger', toda: 'ITODA', plate: 'X 1', capacity: 4 };
  // Staff have no email: one sent is never saved, and any left from before is cleared.
  for (const role of ['admin', 'superadmin']) {
    assert.deepEqual(profileFields(profile, role, { role, toda: 'BCITODA' }), { firstName: 'Pilot', lastName: 'Admin', email: '' }, role);
  }
});

test('staff (a superadmin, and for now an admin) need no email, but a passenger or driver does', () => {
  const names = { firstName: 'Pilot', lastName: 'Staff' };
  for (const role of ['superadmin', 'admin']) {
    assert.deepEqual(profileFields(names, role), { ...names, email: '' }, role);
    assert.deepEqual(profileFields({ ...names, email: 'not-an-email' }, role), { ...names, email: '' }, `${role}: an email is not even checked`);
    // Their names are checked as anyone's.
    assert.throws(() => profileFields({ firstName: 'Pilot' }, role), { status: 400, message: 'First and last names are required.' }, role);
    assert.throws(() => profileFields({ firstName: 'Pilot', lastName: 'Staff1' }, role), { status: 400, message: 'Names can only contain letters and spaces.' }, role);
  }
  for (const role of ['passenger', 'driver']) assert.throws(() => profileFields(names, role), { status: 400, message: 'Enter a valid email address.' }, role);
  // Staff are complete without an email; anyone else is not.
  for (const role of ['superadmin', 'admin']) assert.equal(publicUser({ _id: role, ...names, email: '', role }).profileComplete, true, role);
  for (const role of ['passenger', 'driver']) assert.equal(publicUser({ _id: role, ...names, email: '', role, plate: 'ABC 123', toda: 'BITODA', capacity: 4 }).profileComplete, false, role);
});

test('overview includes connected users only, retaining people with no GPS', () => {
  const result = buildOverview([user('online'), user('offline'), user('driver', { role: 'driver' })], [], new Set(['online', 'driver']), now);
  assert.deepEqual(result.users.map(item => item.id), ['driver', 'online']);
  assert.equal(result.users.find(item => item.id === 'online').location, null);
  assert.equal(result.users.find(item => item.id === 'online').locationStatus, 'unavailable');
  assert.equal(result.summary.online, 2);
  assert.equal(result.summary.drivers, 1);
  assert.equal(result.summary.passengers, 1);
  assert.equal(result.serviceArea.name, 'Indang');
});

test('overview distinguishes live, stale, invalidated and out-of-area measured positions', () => {
  const people = [user('fresh', { location: fix }), user('stale', { location: { ...fix, timestamp: now - 31000 } }),
    user('invalidated', { location: fix, locationAvailable: false }), user('outside', { location: { ...fix, longitude: 121 } }),
    user('bad', { location: { ...fix, latitude: 1000 } })];
  const result = buildOverview(people, [], new Set(people.map(item => item._id)), now);
  const byId = Object.fromEntries(result.users.map(item => [item.id, item]));
  assert.equal(byId.fresh.locationStatus, 'live');
  assert.equal(byId.stale.locationStatus, 'stale');
  assert.equal(byId.invalidated.locationStatus, 'unavailable');
  assert.equal(byId.outside.locationStatus, 'live');
  assert.equal(byId.outside.inServiceArea, false);
  assert.equal(byId.bad.location, null);
  assert.equal(result.summary.liveLocations, 2);
});

test('overview exposes only monitoring fields, keeping secrets and trip notes out', () => {
  const people = [user('driver', { role: 'driver', available: true, location: fix, password: 'secret', phone: 'private-phone', email: 'private-email', plate: 'PILOT-1', toda: 'Pilot TODA' }), user('passenger')];
  const rides = [{ _id: 'ride-1', passengerId: 'passenger', driverId: 'driver', status: 'in_progress', trip: DEFAULT_TRIP, note: 'private-note', offerId: 'private-offer' }];
  const result = buildOverview(people, rides, new Set(['passenger', 'driver']), now);
  const driver = result.users.find(item => item.id === 'driver');
  assert.equal(driver.status, 'in_progress');
  assert.equal(driver.plate, 'PILOT-1');
  assert.equal(driver.ride.pickup, DEFAULT_TRIP.pickup.name);
  assert.equal(result.summary.availableDrivers, 0);
  assert.equal(result.summary.activeRides, 1);
  const encoded = JSON.stringify(result);
  for (const secret of ['secret', 'private-phone', 'private-email', 'private-note', 'private-offer', 'privateValue', 'receivedAt']) assert.equal(encoded.includes(secret), false, secret);
});

test('only a driver ready for matching is counted available', () => {
  const people = [user('ready', { role: 'driver', available: true, location: fix }),
    user('stale', { role: 'driver', available: true, location: { ...fix, timestamp: now - 31000 } }),
    user('outside', { role: 'driver', available: true, location: { ...fix, longitude: 121 } }),
    user('offered', { role: 'driver', available: true, location: fix })];
  const result = buildOverview(people, [{ _id: 'request', status: 'searching', passengerId: 'someone', driverSlot: 'offered', trip: DEFAULT_TRIP }], new Set(people.map(item => item._id)), now);
  assert.equal(result.summary.availableDrivers, 1);
  assert.equal(result.users.find(item => item.id === 'offered').status, 'offered');
});

test('booked rides carry their path: the request, the driver to the passenger, then the trip', () => {
  const tripRoute = { coordinates: [{ latitude: 14.197805, longitude: 120.881639 }, { latitude: 14.15988, longitude: 120.86997 }], distanceMeters: 7900, durationSeconds: 1020 };
  const approachRoute = { coordinates: [{ latitude: 14.199043, longitude: 120.881964 }, DEFAULT_TRIP.pickup.coordinate], distanceMeters: 150, durationSeconds: 40 };
  const asked = [];
  const findRoute = (from, to) => { asked.push([from, to]); return approachRoute; };
  const driverAt = (id, location) => user(id, { role: 'driver', available: true, location });
  const people = [driverAt('on-the-way', { ...fix, latitude: 14.199043, longitude: 120.881964 }), driverAt('driving', fix),
    driverAt('stale-gps', { ...fix, timestamp: now - 31000 }), user('p1'), user('p2'), user('p3'), user('p4')];
  const rides = [
    { _id: 'accepted', status: 'accepted', passengerId: 'p1', driverId: 'on-the-way', driverSlot: 'on-the-way', trip: DEFAULT_TRIP, route: tripRoute },
    { _id: 'riding', status: 'in_progress', passengerId: 'p2', driverId: 'driving', driverSlot: 'driving', trip: DEFAULT_TRIP, route: tripRoute },
    { _id: 'no-gps', status: 'arrived', passengerId: 'p3', driverId: 'stale-gps', driverSlot: 'stale-gps', trip: DEFAULT_TRIP, route: tripRoute },
    { _id: 'unmatched', status: 'searching', passengerId: 'p4', driverSlot: 'driving', trip: DEFAULT_TRIP, route: tripRoute },
  ];
  const { routes } = buildOverview(people, rides, new Set(people.map(item => item._id)), now, findRoute);
  const byRide = Object.fromEntries(routes.map(route => [route.rideId, route]));
  assert.deepEqual(Object.keys(byRide).sort(), ['accepted', 'no-gps', 'riding', 'unmatched']);
  assert.equal(byRide.unmatched.stage, 'requested', 'a passenger who set a destination is waiting for a driver');
  assert.equal(byRide.unmatched.driverId, null);
  assert.equal(byRide.unmatched.approach, null);
  assert.equal(byRide.unmatched.trip.distanceMeters, 7900);

  const toPickup = byRide.accepted;
  assert.equal(toPickup.stage, 'to-pickup');
  assert.equal(toPickup.driverId, 'on-the-way');
  assert.equal(toPickup.passengerId, 'p1');
  assert.deepEqual(toPickup.approach, { coordinates: [[120.88196, 14.19904], [120.88164, 14.19781]], distanceMeters: 150, durationSeconds: 40 });
  assert.deepEqual(toPickup.trip.coordinates, [[120.88164, 14.19781], [120.86997, 14.15988]], '[longitude, latitude], rounded to about 1 m');
  assert.deepEqual(toPickup.pickup, { name: DEFAULT_TRIP.pickup.name, coordinate: [120.88164, 14.19781] });
  assert.equal(asked.length, 1);
  assert.deepEqual([asked[0][0].latitude, asked[0][0].longitude], [14.199043, 120.881964], 'routed from the driver\'s live GPS');
  assert.deepEqual(asked[0][1], DEFAULT_TRIP.pickup.coordinate, 'to the pickup');

  assert.equal(byRide.riding.stage, 'to-destination');
  assert.equal(byRide.riding.approach, null, 'after pickup the guide follows the trip');
  assert.equal(byRide['no-gps'].approach, null, 'no route is invented without live GPS');
  assert.equal(byRide['no-gps'].trip.distanceMeters, 7900);
});

test('the driver\'s route to the pickup follows real roads', () => {
  const driver = user('driver', { role: 'driver', available: true, location: { ...fix, latitude: 14.199043, longitude: 120.881964 } });
  const ride = { _id: 'ride', status: 'accepted', passengerId: 'passenger', driverId: 'driver', trip: DEFAULT_TRIP };
  const [route] = buildOverview([driver, user('passenger')], [ride], new Set(['driver', 'passenger']), now).routes;
  assert.ok(route.approach.coordinates.length > 2, 'more than a straight line');
  assert.ok(route.approach.distanceMeters > 100 && route.approach.distanceMeters < 1000, `${route.approach.distanceMeters} m`);
  assert.equal(route.trip, null, 'a ride without a stored route draws only the approach');
});

test('a driver saved under the former "ITODA PITODA" is shown and saved as ITODA', () => {
  const legacy = user('legacy', { role: 'driver', location: fix, plate: 'OLD-1', toda: 'ITODA PITODA' });
  const other = user('other', { role: 'driver', location: fix, plate: 'OTHER-1', toda: 'Pilot TODA' });
  const result = buildOverview([legacy, other], [], new Set(['legacy', 'other']), now);
  assert.deepEqual(result.users.map(item => item.toda), ['ITODA', 'Pilot TODA']);
  assert.equal(publicUser(legacy).toda, 'ITODA');
  assert.equal(publicUser(other).toda, 'Pilot TODA');
  const profile = { firstName: 'Pilot', lastName: 'Driver', email: 'pilot@example.com', plate: 'abc 1', capacity: 4 };
  assert.equal(profileFields({ ...profile, toda: 'itoda pitoda' }, 'driver').toda, 'ITODA');
  assert.equal(profileFields({ ...profile, toda: ' pitoda ' }, 'driver').toda, 'PITODA');
});

test('the admin screens list accounts by mobile number and whether the app is open, keeping secrets out', () => {
  const accounts = buildAccounts([
    { _id: 'p1', phone: '+639171234567', firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com', role: 'passenger', password: 'hash', location: fix },
    { _id: 'd1', phone: '09181234567', firstName: 'Ben', lastName: 'Reyes', email: 'ben@example.com', role: 'driver', available: true, toda: 'ITODA PITODA', plate: 'ABC 123' },
    { _id: 'd2', phone: '+639191234567', role: 'driver', available: false, approval: 'pending' },
    { _id: 'd3', phone: '+639201234567', role: 'driver', approval: 'pending', disabled: true, terminatedAt: new Date(now) },
  ], new Set(['d1', 'd2']));
  assert.deepEqual(accounts, [
    { key: 'p1', id: '09171234567', name: 'Ana Cruz', email: 'ana@example.com', role: 'PASSENGER', status: 'Offline', languageWarnings: 0 },
    { key: 'd1', id: '09181234567', name: 'Ben Reyes', email: 'ben@example.com', role: 'RIDER', status: 'Available', languageWarnings: 0, toda: 'ITODA', plate: 'ABC 123', approval: 'Approved' },
    { key: 'd2', id: '09191234567', name: 'Driver', email: '', role: 'RIDER', status: 'Online', languageWarnings: 0, toda: '', plate: '', approval: 'Pending' },
    { key: 'd3', id: '09201234567', name: 'Driver', email: '', role: 'RIDER', status: 'Offline', languageWarnings: 0, toda: '', plate: '', approval: 'Suspended' },
  ]);
});

test('staff accounts are listed as ADMIN, with the Indang TODA they manage, or SUPERADMIN', () => {
  const accounts = buildAccounts([
    { _id: 's1', phone: '+639171111111', firstName: 'Pilot', lastName: 'Super', email: '', role: 'superadmin', toda: 'BCITODA', password: 'hash' },
    { _id: 'a1', phone: '+639172222222', firstName: 'Toda', lastName: 'Officer', email: 'officer@example.com', role: 'admin', toda: 'bci toda', available: true },
    { _id: 'a2', phone: '+639173333333', role: 'admin', toda: 'ITODA PITODA' },
    // A TODA that is not Indang's counts as none, as for their access.
    { _id: 'a3', phone: '+639174444444', role: 'admin', toda: 'Pilot TODA' },
    { _id: 'a4', phone: '+639175555555', role: 'admin' },
  ], new Set(['s1', 'a1']));
  assert.deepEqual(accounts, [
    { key: 's1', id: '09171111111', name: 'Pilot Super', email: '', role: 'SUPERADMIN', status: 'Online', languageWarnings: 0 },
    { key: 'a1', id: '09172222222', name: 'Toda Officer', email: 'officer@example.com', role: 'ADMIN', status: 'Online', languageWarnings: 0, toda: 'BCITODA' },
    { key: 'a2', id: '09173333333', name: 'Admin', email: '', role: 'ADMIN', status: 'Offline', languageWarnings: 0, toda: 'ITODA' },
    { key: 'a3', id: '09174444444', name: 'Admin', email: '', role: 'ADMIN', status: 'Offline', languageWarnings: 0, toda: '' },
    { key: 'a4', id: '09175555555', name: 'Admin', email: '', role: 'ADMIN', status: 'Offline', languageWarnings: 0, toda: '' },
  ]);
});

test('God view lists every TODA with its drivers and their ratings, then the drivers of other TODAs', () => {
  const { todas, other } = buildTodas([
    { _id: 'd1', phone: '+639181234567', firstName: 'Ben', lastName: 'Reyes', email: 'ben@example.com', password: 'hash', role: 'driver', available: true,
      toda: 'bitoda', plate: 'ABC 123', ratingSum: 9, ratingCount: 2 },
    { _id: 'd2', phone: '09191234567', firstName: 'Ana', lastName: 'Cruz', role: 'driver', toda: 'BITODA', plate: 'XYZ 9', approval: 'pending' },
    { _id: 'd3', phone: '+639201234567', firstName: 'Cy', lastName: 'Lim', role: 'driver', toda: 'ITODA PITODA', ratingSum: 14, ratingCount: 3 },
    { _id: 'd4', phone: '+639211234567', firstName: 'Di', lastName: 'Go', role: 'driver', toda: ' Somewhere TODA ', terminatedAt: new Date(now), ratingSum: 4, ratingCount: 1 },
    { _id: 'd5', phone: '+639221234567', role: 'driver' },
  ], new Set(['d1', 'd4']));
  assert.deepEqual(todas.map((toda) => toda.name), TODA_NAMES, 'every Indang TODA, even one without drivers');
  const bitoda = todas.find((toda) => toda.name === 'BITODA');
  assert.deepEqual({ ...bitoda, drivers: undefined }, { id: 'bitoda', name: 'BITODA', barangays: ['Bancod'], wholeTown: false,
    stops: [{ name: 'CvSU', barangay: 'Kaytapos' }], drivers: undefined, rating: { average: 4.5, count: 2 } });
  assert.deepEqual(bitoda.drivers, [
    { key: 'd2', id: '09191234567', name: 'Ana Cruz', plate: 'XYZ 9', toda: 'BITODA', status: 'Offline', approval: 'Pending', rating: { average: null, count: 0 } },
    { key: 'd1', id: '09181234567', name: 'Ben Reyes', plate: 'ABC 123', toda: 'BITODA', status: 'Available', approval: 'Approved', rating: { average: 4.5, count: 2 } },
  ], 'by name, without email or password');
  const itoda = todas.find((toda) => toda.name === 'ITODA');
  assert.deepEqual([itoda.wholeTown, itoda.drivers.map((driver) => driver.name), itoda.rating], [true, ['Cy Lim'], { average: 4.7, count: 3 }], 'a former TODA name counts as its TODA');
  assert.deepEqual(todas.find((toda) => toda.name === 'ALITODA').rating, { average: null, count: 0 });
  assert.deepEqual(other.drivers.map(({ name, toda, status, approval }) => ({ name, toda, status, approval })), [
    { name: 'Di Go', toda: 'Somewhere TODA', status: 'Online', approval: 'Suspended' },
    { name: 'Driver', toda: '', status: 'Offline', approval: 'Approved' },
  ]);
  assert.deepEqual(other.rating, { average: 4, count: 1 });
});

test('a driver who signs up waits for approval, and the approval screens show what they signed up with', () => {
  assert.deepEqual([{}, { approval: 'approved' }, { approval: 'pending' }, { approval: 'pending', terminatedAt: new Date(now) }, { approval: 'approved', terminatedAt: new Date(now) }].map(driverApproval),
    ['Approved', 'Approved', 'Pending', 'Suspended', 'Suspended'], 'drivers from before approval count as approved');
  const joined = new Date(now), terminatedAt = new Date(now + 1000);
  assert.deepEqual(buildDriver({ _id: 'd1', phone: '+639181234567', firstName: 'Ben', lastName: 'Reyes', email: 'ben@example.com', role: 'driver', toda: 'ITODA PITODA',
    plate: 'ABC 123', capacity: 3, createdAt: joined, approval: 'pending', terminatedAt, terminationReason: 'Plate not on the list', languageWarnings: 2, password: 'hash' }, new Set()), {
    key: 'd1', id: '09181234567', name: 'Ben Reyes', email: 'ben@example.com', role: 'RIDER', status: 'Offline', languageWarnings: 2, toda: 'ITODA', plate: 'ABC 123', approval: 'Suspended',
    capacity: 3, joined, approvedAt: null, terminatedAt, terminationReason: 'Plate not on the list',
  });
  const driver = { _id: 'd2', phone: '+639191234567', firstName: 'Cy', lastName: 'Lim', email: 'cy@example.com', role: 'driver', plate: 'X 1', toda: 'ITODA', capacity: 4 };
  assert.equal(publicUser({ ...driver, approval: 'pending' }).pendingApproval, true);
  assert.equal('pendingApproval' in publicUser(driver), false);
  assert.equal('pendingApproval' in publicUser({ ...driver, approval: 'approved' }), false);
  assert.equal(suspensionMessage(suspensionOf({ disabled: true, terminatedAt: new Date(now) }, now)), 'This driver account was suspended by an IndangGO admin.');
  assert.match(suspensionMessage(suspensionOf({ disabled: true }, now)), /repeated reports of fake bookings/);
});

test('the admin screens show each booking with its people, the driver\'s TODA and a plain status', () => {
  assert.deepEqual(['searching', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_driver'].map(tripStatus),
    ['Ongoing', 'Ongoing', 'Ongoing', 'Ongoing', 'Completed', 'Cancelled', 'No driver']);
  const people = new Map([['p1', { firstName: 'Ana', lastName: 'Cruz' }], ['d1', { firstName: 'Ben', lastName: 'Reyes', toda: 'ITODA PITODA' }]]);
  const createdAt = new Date(now);
  const trips = buildTrips([
    { _id: '6ad8e18d3ba4e6be0a9ca70a', passengerId: 'p1', driverId: 'd1', status: 'completed', trip: { pickup: { name: 'Plaza' }, dropoff: { name: 'CvSU' } }, createdAt },
    { _id: '6ad8e18d3ba4e6be0a9ca70b', passengerId: 'gone', status: 'searching', createdAt },
  ], people);
  assert.deepEqual(trips, [
    { key: '6ad8e18d3ba4e6be0a9ca70a', id: '#TR-9CA70A', todaId: 'ITODA', passenger: 'Ana Cruz', driver: 'Ben Reyes', status: 'Completed', route: 'Plaza → CvSU', date: createdAt },
    { key: '6ad8e18d3ba4e6be0a9ca70b', id: '#TR-9CA70B', todaId: '—', passenger: 'Deleted account', driver: '—', status: 'Ongoing', route: 'Pickup → Destination', date: createdAt },
  ]);
});

test('an account\'s trip history shows its part in each trip, the other person, the fare and the rating it received', () => {
  const me = 'aaaaaaaaaaaaaaaaaaaaaaaa', ben = 'bbbbbbbbbbbbbbbbbbbbbbbb', gone = 'cccccccccccccccccccccccc';
  const createdAt = new Date(now), trip = { pickup: { name: 'Plaza' }, dropoff: { name: 'CvSU' } };
  const rides = [
    { _id: '6ad8e18d3ba4e6be0a9ca70a', passengerId: me, driverId: ben, status: 'completed', trip, route: { distanceMeters: 2400 }, passengers: 2, fare: 60, createdAt, completedAt: createdAt },
    { _id: '6ad8e18d3ba4e6be0a9ca70b', passengerId: me, driverId: ben, status: 'cancelled', trip, fare: 45, createdAt, cancelledAt: createdAt, cancelledBy: ben, cancellationReason: 'Flat tyre' },
    { _id: '6ad8e18d3ba4e6be0a9ca70c', passengerId: me, status: 'no_driver', createdAt },
    { _id: '6ad8e18d3ba4e6be0a9ca70d', passengerId: gone, driverId: me, status: 'in_progress', trip, fare: 45, createdAt },
  ];
  const people = new Map([[ben, { firstName: 'Ben', lastName: 'Reyes' }]]);
  const ratings = new Map([['6ad8e18d3ba4e6be0a9ca70a', { stars: 2, tags: ['Did not pay'], comment: 'Left without paying', flagged: true }]]);
  const history = buildHistory(me, rides, people, ratings);
  assert.deepEqual(history[0], {
    key: '6ad8e18d3ba4e6be0a9ca70a', id: '#TR-9CA70A', as: 'passenger', status: 'Completed', stage: 'completed', with: 'Ben Reyes',
    pickup: 'Plaza', destination: 'CvSU', distanceMeters: 2400, passengers: 2, fare: 60, date: createdAt, endedAt: createdAt,
    rating: { stars: 2, tags: ['Did not pay'], comment: 'Left without paying', flagged: true },
  });
  assert.deepEqual([history[1].status, history[1].cancelledBy, history[1].cancellationReason, history[1].rating], ['Cancelled', 'driver', 'Flat tyre', null]);
  const byAdmin = buildHistory(me, [{ ...rides[1], cancelledBy: 'admin', cancellationReason: 'Duplicate booking' }], people, new Map());
  assert.deepEqual([byAdmin[0].cancelledBy, byAdmin[0].cancellationReason], ['admin', 'Duplicate booking'], 'cancelled from God view');
  assert.deepEqual([history[2].status, history[2].with, history[2].pickup, history[2].fare], ['No driver', null, 'Pickup', null], 'a search that found no driver');
  assert.deepEqual([history[3].as, history[3].status, history[3].stage, history[3].with], ['driver', 'Ongoing', 'in_progress', 'Deleted account']);

  assert.deepEqual(historySummary([{ _id: 'completed', count: 3, fares: 150 }, { _id: 'cancelled', count: 1, fares: 45 }, { _id: 'no_driver', count: 2, fares: 0 }, { _id: 'accepted', count: 1, fares: 45 }]),
    { trips: 7, completed: 3, cancelled: 1, noDriver: 2, ongoing: 1, fares: 150 }, 'only completed trips count toward fares');
  assert.deepEqual(historySummary([]), { trips: 0, completed: 0, cancelled: 0, noDriver: 0, ongoing: 0, fares: 0 });
});

test('a trip history covers every trip, or the trips booked in the last 1 to 30 days', () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(historyPeriod(undefined, now), null);
  assert.equal(historyPeriod('', now), null);
  assert.deepEqual(historyPeriod('7', now), { days: 7, since: new Date(now - 7 * day) });
  assert.deepEqual(historyPeriod('30', now), { days: 30, since: new Date(now - 30 * day) });
  for (const days of ['0', '31', '365', '-7', '7.5', 'week', ['7', '14']]) {
    assert.throws(() => historyPeriod(days, now), { status: 400, message: 'Choose a period of 1 to 30 days.' }, String(days));
  }
});
