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
  assert.equal(result.serviceArea.name, 'General Trias');
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
