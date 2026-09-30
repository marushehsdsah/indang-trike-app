const test = require('node:test');
const assert = require('node:assert/strict');
const { pickupFromFix } = require('../utils/pickupLocation');
const now = Date.now();
const fix = { latitude: 14.2, longitude: 120.88, accuracy: 10, timestamp: now };

test('a fresh measured fix produces the current pickup without fake coordinates', () => {
  assert.deepEqual(pickupFromFix(fix, now), {
    id: 'current-location', name: 'Current location', kind: 'current-location',
    coordinate: { latitude: 14.2, longitude: 120.88 },
  });
});
test('a fix outside Indang is still the current pickup; booking rejects it separately', () => {
  assert.deepEqual(pickupFromFix({ ...fix, latitude: 14.5 }, now).coordinate, { latitude: 14.5, longitude: 120.88 });
});
test('missing, stale and inaccurate GPS leaves pickup unselected', () => {
  for (const value of [null, { ...fix, timestamp: now - 31000 }, { ...fix, accuracy: 200 }]) {
    assert.equal(pickupFromFix(value, now), null);
  }
});
