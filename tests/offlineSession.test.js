const test = require('node:test');
const assert = require('node:assert/strict');
const { CACHED_HISTORY_LIMIT, SAVED_RIDE_MAX_AGE_MS, SESSION_LIFETIME_MS, canOpenOffline, getSessionExpiry, rideToSave, savedRide, trimHistory } = require('../utils/offlineSession');

test('a session expires when the server said it would, or 7 days after it was last verified', () => {
  const verifiedAt = Date.parse('2026-10-01T00:00:00Z');
  assert.equal(getSessionExpiry({ loginExpiresAt: '2026-10-05T00:00:00Z', cachedExpiresAt: 1, verifiedAt }), Date.parse('2026-10-05T00:00:00Z'));
  assert.equal(getSessionExpiry({ loginExpiresAt: null, cachedExpiresAt: 1234, verifiedAt }), 1234);
  assert.equal(getSessionExpiry({ verifiedAt }), verifiedAt + SESSION_LIFETIME_MS);
});

test('only an unexpired copy with a profile and fares can open the app offline', () => {
  const now = Date.now();
  const copy = { user: { id: 'one' }, config: { fare: 45 }, expiresAt: now + 1000 };
  assert.equal(canOpenOffline(copy, now), true);
  assert.equal(canOpenOffline({ ...copy, expiresAt: now - 1 }, now), false);
  assert.equal(canOpenOffline({ ...copy, config: null }, now), false);
  assert.equal(canOpenOffline({ ...copy, user: null }, now), false);
  assert.equal(canOpenOffline(null, now), false);
});

test('saved history keeps what the history screen shows, newest first', () => {
  const ride = (index) => ({
    id: `ride-${index}`, status: 'completed', createdAt: `2026-09-${String(30 - (index % 28)).padStart(2, '0')}`, fare: 45,
    trip: { pickup: { name: 'Pickup', coordinate: { latitude: 14.38, longitude: 120.88 } }, dropoff: { name: 'Drop-off', coordinate: { latitude: 14.32, longitude: 120.91 } } },
    route: { distanceLabel: '2.4 km', coordinates: Array(500).fill({ latitude: 14.3, longitude: 120.9 }) }, driver: { phone: '+639170000000' },
  });
  const trimmed = trimHistory(Array.from({ length: 80 }, (_, index) => ride(index)));
  assert.equal(trimmed.length, CACHED_HISTORY_LIMIT);
  assert.equal(trimmed[0].id, 'ride-0');
  assert.deepEqual(trimmed[0], {
    id: 'ride-0', status: 'completed', createdAt: '2026-09-30', fare: 45,
    trip: { pickup: { name: 'Pickup' }, dropoff: { name: 'Drop-off', coordinate: { latitude: 14.32, longitude: 120.91 } } },
    route: { distanceLabel: '2.4 km' },
  }, 'the home screen lists recent rides with their distance');
  assert.ok(JSON.stringify(trimmed).length < 15000, 'the saved copy stays small');
});

test('an ongoing trip with a driver is saved without the live positions', () => {
  const location = { latitude: 14.2, longitude: 120.88, accuracy: 8, timestamp: 1 };
  const ride = { id: 'ride-one', status: 'in_progress', version: 4, createdAt: '2026-11-05T01:00:00Z', route: { coordinates: [location, location] },
    driverLocation: location, passengerLocation: location, driverConnected: true, driverLocationAvailable: true };
  assert.deepEqual(rideToSave(ride), { ...ride, driverLocation: null, passengerLocation: null, driverConnected: false, driverLocationAvailable: false });
  for (const status of ['searching', 'completed', 'cancelled', 'no_driver']) assert.equal(rideToSave({ ...ride, status }), null, status);
  assert.equal(rideToSave(null), null);
});

test('a saved trip reopens only while it can still be ongoing', () => {
  const createdAt = '2026-11-05T01:00:00Z', bookedAt = Date.parse(createdAt);
  const cache = { ride: { id: 'ride-one', status: 'accepted', createdAt } };
  assert.equal(savedRide(cache, bookedAt + 60000), cache.ride);
  assert.equal(savedRide(cache, bookedAt + SAVED_RIDE_MAX_AGE_MS + 1), null, 'one that most likely ended while the app was closed');
  assert.equal(savedRide({ ride: { ...cache.ride, status: 'completed' } }, bookedAt), null);
  assert.equal(savedRide({ ride: { ...cache.ride, createdAt: undefined } }, bookedAt), null);
  assert.equal(savedRide({ ride: null }, bookedAt), null);
  assert.equal(savedRide(null, bookedAt), null);
});
