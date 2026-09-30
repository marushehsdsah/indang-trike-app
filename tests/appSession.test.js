const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mountApp, deferred, flush, renderer } = require('./helpers/reactHarness');

for (const operation of ['availability', 'booking', 'action']) {
  test(`late ${operation} response cannot restore private data after logout`, async () => {
    const delayed = deferred(); let pending = false;
    const app = await mountApp((path) => {
      if (pending && (path === '/driver/availability' || path === '/rides' || path === '/rides/ride-one/complete')) return delayed.promise;
    }, operation === 'booking' ? 'passenger' : 'driver');
    try {
      await renderer.act(async () => { await app.value.signIn('09170000000', 'password'); });
      await flush(); pending = true;
      let work;
      await renderer.act(async () => {
        work = operation === 'availability' ? app.value.setAvailable(false) : operation === 'booking' ? app.value.bookRide({}) : app.value.rideAction('ride-one', 'complete');
      });
      await renderer.act(async () => { await app.value.signOut(); });
      await renderer.act(async () => {
        delayed.resolve(operation === 'availability' ? app.snapshot : { ride: { id: 'private-ride', version: 1, status: 'completed' } });
        await work;
      });
      assert.equal(app.value.user, null);
      assert.equal(app.value.ride, null);
      assert.equal(app.value.token, null);
    } finally { await app.close(); }
  });
}

test('a transient fare-configuration failure recovers on refresh without logout', async () => {
  let configCalls = 0;
  const app = await mountApp((path) => { if (path === '/config' && ++configCalls === 1) return Promise.reject(new Error('Connection interrupted')); });
  try {
    await renderer.act(async () => { try { await app.value.signIn('09170000000', 'password'); } catch {} });
    await flush();
    await renderer.act(async () => { await app.value.refresh(); });
    assert.equal(app.value.user.id, 'account-one');
    assert.equal(app.value.config?.fare, 45);
  } finally { await app.close(); }
});

test('booking sends only endpoints and booking fields, not route geometry', async () => {
  let captured;
  const app = await mountApp((path, options) => {
    if (path === '/rides') { captured = options.body; return Promise.resolve({ ride: { id: 'one', version: 1, status: 'searching' } }); }
  });
  try {
    await renderer.act(async () => { await app.value.signIn('09170000000', 'password'); });
    await renderer.act(async () => { await app.value.bookRide({ trip: { pickup: { name: 'Pickup' }, dropoff: { name: 'Dropoff' } }, route: { coordinates: Array(5000).fill({ latitude: 14.2, longitude: 120.8 }) }, passengers: 2, note: 'Gate', idempotencyKey: 'retry-key-one' }); });
    assert.equal(Object.hasOwn(captured, 'route'), false);
    assert.equal(captured.passengers, 2);
    assert.equal(captured.idempotencyKey, 'retry-key-one');
    assert.ok(JSON.stringify(captured).length < 1000);
  } finally { await app.close(); }
});

test('a passenger shares live GPS only while a driver holds their ride', async () => {
  const published = [];
  const fix = { latitude: 14.1978, longitude: 120.8816, accuracy: 8, timestamp: Date.now(), heading: null, speed: null };
  const app = await mountApp((path, options) => {
    if (path.endsWith('/location')) { published.push({ path, body: options.body }); return Promise.resolve({ ok: true }); }
  }, 'passenger', { fix, status: 'ready', inServiceArea: true, retry: () => {}, getCurrentFix: async () => fix });
  try {
    app.snapshot.ride = { id: 'ride-one', version: 1, status: 'searching' };
    await renderer.act(async () => { await app.value.signIn('09170000000', 'password'); });
    await flush();
    assert.deepEqual(published, [], 'no one receives passenger GPS before a driver accepts');
    app.snapshot.ride = { id: 'ride-one', version: 2, status: 'accepted' };
    await renderer.act(async () => { await app.value.refresh(); });
    await flush();
    assert.deepEqual(published, [{ path: '/passenger/location', body: fix }]);
  } finally { await app.close(); }
});
