const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAdminPhones, buildOverview } = require('../indang-trike-backend/admin');
const { DEFAULT_TRIP } = require('../data/indangMap');

const now = 1800000000000;
const fix = { ...DEFAULT_TRIP.pickup.coordinate, timestamp: now, accuracy: 8, receivedAt: now, privateValue: 'hidden' };
const user = (id, fields = {}) => ({ _id: id, firstName: 'Pilot', lastName: id, role: 'passenger', locationAvailable: true, ...fields });

test('admin access is opt-in and phone formats are normalized without accepting invalid entries', () => {
  assert.deepEqual([...parseAdminPhones('')], []);
  assert.deepEqual([...parseAdminPhones('09171234567, +639171234567, invalid, 09177654321')], ['+639171234567', '+639177654321']);
});

test('overview includes connected users only, retaining people with no GPS', () => {
  const result = buildOverview([user('online'), user('offline'), user('driver', { role: 'driver' })], [], new Set(['online', 'driver']), now);
  assert.deepEqual(result.users.map(item => item.id), ['driver', 'online']);
  assert.equal(result.users.find(item => item.id === 'online').location, null);
  assert.equal(result.users.find(item => item.id === 'online').locationStatus, 'unavailable');
  assert.equal(result.summary.online, 2);
  assert.equal(result.summary.drivers, 1);
  assert.equal(result.summary.passengers, 1);
  assert.equal(result.serviceArea.name, 'Indang and General Trias');
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
  const tripRoute = { coordinates: [{ latitude: 14.385026, longitude: 120.880477 }, { latitude: 14.3240901, longitude: 120.9120501 }], distanceMeters: 7900, durationSeconds: 1020 };
  const approachRoute = { coordinates: [{ latitude: 14.386264, longitude: 120.880802 }, DEFAULT_TRIP.pickup.coordinate], distanceMeters: 150, durationSeconds: 40 };
  const asked = [];
  const findRoute = (from, to) => { asked.push([from, to]); return approachRoute; };
  const driverAt = (id, location) => user(id, { role: 'driver', available: true, location });
  const people = [driverAt('on-the-way', { ...fix, latitude: 14.386264, longitude: 120.880802 }), driverAt('driving', fix),
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
  assert.deepEqual(toPickup.approach, { coordinates: [[120.8808, 14.38626], [120.88048, 14.38503]], distanceMeters: 150, durationSeconds: 40 });
  assert.deepEqual(toPickup.trip.coordinates, [[120.88048, 14.38503], [120.91205, 14.32409]], '[longitude, latitude], rounded to about 1 m');
  assert.deepEqual(toPickup.pickup, { name: DEFAULT_TRIP.pickup.name, coordinate: [120.88048, 14.38503] });
  assert.equal(asked.length, 1);
  assert.deepEqual([asked[0][0].latitude, asked[0][0].longitude], [14.386264, 120.880802], 'routed from the driver\'s live GPS');
  assert.deepEqual(asked[0][1], DEFAULT_TRIP.pickup.coordinate, 'to the pickup');

  assert.equal(byRide.riding.stage, 'to-destination');
  assert.equal(byRide.riding.approach, null, 'after pickup the guide follows the trip');
  assert.equal(byRide['no-gps'].approach, null, 'no route is invented without live GPS');
  assert.equal(byRide['no-gps'].trip.distanceMeters, 7900);
});

test('the driver\'s route to the pickup follows real roads', () => {
  const driver = user('driver', { role: 'driver', available: true, location: { ...fix, latitude: 14.386264, longitude: 120.880802 } });
  const ride = { _id: 'ride', status: 'accepted', passengerId: 'passenger', driverId: 'driver', trip: DEFAULT_TRIP };
  const [route] = buildOverview([driver, user('passenger')], [ride], new Set(['driver', 'passenger']), now).routes;
  assert.ok(route.approach.coordinates.length > 2, 'more than a straight line');
  assert.ok(route.approach.distanceMeters > 100 && route.approach.distanceMeters < 1000, `${route.approach.distanceMeters} m`);
  assert.equal(route.trip, null, 'a ride without a stored route draws only the approach');
});
