const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, renderer, React } = require('./helpers/reactHarness');

const GRANTED = { status: 'granted', canAskAgain: true, android: { accuracy: 'fine' } };

function mountLiveLocation({ permission = GRANTED, afterRequest } = {}) {
  const mounted = { update: null, value: null, tree: null, watchOptions: [], requests: 0, permission };
  const useLiveLocation = loadSource('hooks/useLiveLocation.js', { 'expo-location': {
    Accuracy: { High: 4, BestForNavigation: 6 }, hasServicesEnabledAsync: async () => true,
    getForegroundPermissionsAsync: async () => mounted.permission,
    requestForegroundPermissionsAsync: async () => {
      mounted.requests += 1;
      if (afterRequest) mounted.permission = afterRequest;
      return mounted.permission;
    },
    watchPositionAsync: async (options, callback) => { mounted.watchOptions.push(options); mounted.update = callback; return { remove() {} }; },
  } }).default;
  function Consumer({ enabled }) { mounted.value = useLiveLocation(enabled); return null; }
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  mounted.render = (enabled = true) => renderer.act(async () => {
    const element = React.createElement(Consumer, { enabled });
    if (mounted.tree) mounted.tree.update(element); else mounted.tree = renderer.create(element);
    await settle();
  });
  mounted.act = (work) => renderer.act(async () => { await work(); await settle(); });
  mounted.unmount = async () => { if (mounted.tree) await renderer.act(async () => mounted.tree.unmount()); };
  return mounted;
}
const position = (longitude, accuracy = 5, timestamp = Date.now()) => ({ timestamp, coords: { latitude: 14.197805, longitude, accuracy, speed: 0, heading: 0 } });

test('GPS keeps tracking outside Indang and flags the fix as outside the service area', async () => {
  const gps = mountLiveLocation();
  try {
    await gps.render();
    await gps.act(() => gps.update(position(120.881639)));
    assert.equal(gps.value.status, 'ready');
    assert.equal(gps.value.inServiceArea, true);
    await gps.act(() => gps.update(position(121)));
    assert.equal(gps.value.status, 'ready');
    assert.equal(gps.value.fix.longitude, 121, 'the measured position outside Indang is the current fix');
    assert.equal(gps.value.inServiceArea, false);
  } finally { await gps.unmount(); }
});

test('GPS never opens Android\'s location-accuracy dialog, which would pause and restart it in a loop', async () => {
  const gps = mountLiveLocation();
  try {
    await gps.render();
    assert.equal(gps.watchOptions.length, 1);
    assert.equal(gps.watchOptions[0].mayShowUserSettingsDialog, false);
  } finally { await gps.unmount(); }
});

test('one inaccurate reading keeps a still-fresh fix instead of switching GPS off and on', async () => {
  const gps = mountLiveLocation();
  try {
    await gps.render();
    await gps.act(() => gps.update(position(120.881639)));
    await gps.act(() => gps.update(position(120.882, 200)));
    assert.equal(gps.value.status, 'ready');
    assert.equal(gps.value.fix.longitude, 120.881639, 'the poor reading does not replace the usable fix');
  } finally { await gps.unmount(); }
});

test('without a usable fix, and once the last one goes stale, poor readings report low accuracy', async () => {
  const gps = mountLiveLocation();
  try {
    await gps.render();
    await gps.act(() => gps.update(position(120.881639, 200)));
    assert.equal(gps.value.status, 'inaccurate');
    assert.equal(gps.value.fix, null);
    // A usable fix just under the 30 s limit, then only poor readings: it expires as low accuracy.
    await gps.act(() => gps.update(position(120.881639, 5, Date.now() - 29500)));
    assert.equal(gps.value.status, 'ready');
    await gps.act(() => gps.update(position(120.882, 200)));
    await gps.act(() => new Promise((resolve) => setTimeout(resolve, 1600)));
    assert.equal(gps.value.status, 'inaccurate');
  } finally { await gps.unmount(); }
});

test('the permission prompt shows once on its own; a restart does not repeat it, but Retry may', async () => {
  const gps = mountLiveLocation({ permission: { status: 'undetermined', canAskAgain: true }, afterRequest: { status: 'denied', canAskAgain: true } });
  try {
    await gps.render();
    assert.equal(gps.requests, 1);
    assert.equal(gps.value.status, 'denied');
    // The prompt pauses the app: GPS stops and starts again when it closes.
    await gps.render(false);
    await gps.render(true);
    assert.equal(gps.requests, 1, 'returning from the prompt does not show it again');
    assert.equal(gps.value.status, 'denied');
    await gps.act(() => gps.value.retry());
    assert.equal(gps.requests, 2);
  } finally { await gps.unmount(); }
});

test('approximate-only location is reported as such rather than as low accuracy', async () => {
  const coarse = { status: 'granted', canAskAgain: true, android: { accuracy: 'coarse' } };
  const gps = mountLiveLocation({ permission: coarse, afterRequest: coarse });
  try {
    await gps.render();
    assert.equal(gps.value.status, 'approximate');
    assert.match(gps.value.message, /precise location/);
    assert.equal(gps.watchOptions.length, 0, 'approximate fixes could never meet the accuracy limit');
  } finally { await gps.unmount(); }
});
