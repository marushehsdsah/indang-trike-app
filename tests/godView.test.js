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
