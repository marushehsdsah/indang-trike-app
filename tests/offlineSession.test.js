const test = require('node:test');
const assert = require('node:assert/strict');
const { CACHED_HISTORY_LIMIT, SESSION_LIFETIME_MS, canOpenOffline, getSessionExpiry, trimHistory } = require('../utils/offlineSession');

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
