const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFix, isFreshFix, rankDrivers, nextRideStatus, mergeRide, getDriverAction } = require('../utils/rideState');

const now = 1800000000000;
const fix = { latitude: 14.197805, longitude: 120.881639, accuracy: 12, timestamp: now, heading: 90, speed: 0 };

test('only measured, recent and accurate GPS qualifies for matching', () => {
  assert.equal(isFreshFix(fix, now), true);
  for (const bad of [null, { ...fix, timestamp: now - 30001 }, { ...fix, timestamp: now + 6000 },
    { ...fix, accuracy: 101 }, { ...fix, accuracy: null }, { ...fix, latitude: 91 }, { ...fix, longitude: '120' }]) {
    assert.equal(isFreshFix(bad, now), false);
  }
  assert.equal(validateFix({ ...fix, heading: -1, speed: -1 }, now).heading, null);
  assert.throws(() => validateFix({ ...fix, timestamp: now - 30001 }, now), /location|GPS/i);
});

test('dispatch ranks eligible drivers by actual pickup distance and respects capacity', () => {
  const driver = (id, latitude, extra = {}) => ({ id, available: true, connected: true, capacity: 4, location: { ...fix, latitude }, ...extra });
  const ranked = rankDrivers([
    driver('far', 14.21), driver('near', 14.198), driver('stale', 14.1978, { location: { ...fix, timestamp: now - 40000 } }),
    driver('small', 14.1978, { capacity: 1 }), driver('offline', 14.1978, { connected: false }),
    driver('busy', 14.1978, { busy: true }), driver('outside-radius', 14.3),
  ], fix, 2, now);
  assert.deepEqual(ranked.map((d) => d.id), ['near', 'far']);
});

test('trip status only advances through authorized driver actions', () => {
  assert.equal(nextRideStatus('searching', 'accept', 'driver'), 'accepted');
  assert.equal(nextRideStatus('accepted', 'arrive', 'driver'), 'arrived');
  assert.equal(nextRideStatus('arrived', 'start', 'driver'), 'in_progress');
  assert.equal(nextRideStatus('in_progress', 'complete', 'driver'), 'completed');
  assert.equal(nextRideStatus('accepted', 'cancel', 'passenger'), 'cancelled');
  for (const args of [['accepted', 'complete', 'driver'], ['arrived', 'start', 'passenger'], ['in_progress', 'cancel', 'passenger'], ['completed', 'accept', 'driver']]) {
    assert.throws(() => nextRideStatus(...args), /action|transition/i);
  }
});

test('old ride events cannot undo completion or a newer driver fix', () => {
  const current = { id: 'one', version: 5, status: 'completed', driverLocation: fix };
  assert.equal(mergeRide(current, { id: 'one', version: 4, status: 'accepted' }), current);
  const updated = mergeRide(current, { id: 'one', version: 5, status: 'completed', driverLocation: { ...fix, timestamp: now - 1000 } });
  assert.deepEqual(updated.driverLocation, fix);
  assert.equal(mergeRide(current, { id: 'two', version: 1 }).id, 'two');
});

test('a snapshot cannot replace a newer passenger fix that arrived by socket', () => {
  const current = { id: 'one', version: 3, status: 'accepted', passengerLocation: fix };
  const snapshot = mergeRide(current, { id: 'one', version: 3, status: 'accepted', passengerLocation: { ...fix, timestamp: now - 2000 } });
  assert.deepEqual(snapshot.passengerLocation, fix);
  const newer = { ...fix, timestamp: now + 1000 };
  assert.deepEqual(mergeRide(current, { id: 'one', version: 3, status: 'accepted', passengerLocation: newer }).passengerLocation, newer);
});

test('driver action labels reflect the actual trip stage', () => {
  assert.equal(getDriverAction('accepted').action, 'arrive');
  assert.equal(getDriverAction('arrived').action, 'start');
  assert.equal(getDriverAction('in_progress').action, 'complete');
  assert.equal(getDriverAction('completed'), null);
});
