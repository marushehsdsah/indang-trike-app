const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, renderer, React } = require('./helpers/reactHarness');

function mountLiveLocation() {
  const mounted = { update: null, value: null, tree: null };
  const useLiveLocation = loadSource('hooks/useLiveLocation.js', { 'expo-location': {
    Accuracy: { BestForNavigation: 6 }, hasServicesEnabledAsync: async () => true,
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    watchPositionAsync: async (options, callback) => { mounted.update = callback; return { remove() {} }; },
  } }).default;
  function Consumer() { mounted.value = useLiveLocation(true); return null; }
  return { mounted, Consumer };
}
const position = (longitude, accuracy = 5) => ({ timestamp: Date.now(), coords: { latitude: 14.197805, longitude, accuracy, speed: 0, heading: 0 } });

test('GPS keeps tracking outside Indang and flags the fix as outside the service area', async () => {
  const { mounted, Consumer } = mountLiveLocation();
  try {
    await renderer.act(async () => { mounted.tree = renderer.create(React.createElement(Consumer)); });
    await renderer.act(async () => mounted.update(position(120.881639)));
    assert.equal(mounted.value.status, 'ready');
    assert.equal(mounted.value.inServiceArea, true);
    await renderer.act(async () => mounted.update(position(121)));
    assert.equal(mounted.value.status, 'ready');
    assert.equal(mounted.value.fix.longitude, 121, 'the measured position outside Indang is the current fix');
    assert.equal(mounted.value.inServiceArea, false);
  } finally { if (mounted.tree) await renderer.act(async () => mounted.tree.unmount()); }
});

test('an inaccurate measurement invalidates an earlier usable GPS fix', async () => {
  const { mounted, Consumer } = mountLiveLocation();
  try {
    await renderer.act(async () => { mounted.tree = renderer.create(React.createElement(Consumer)); });
    await renderer.act(async () => mounted.update(position(120.881639)));
    assert.equal(mounted.value.status, 'ready');
    await renderer.act(async () => mounted.update(position(120.881639, 200)));
    assert.equal(mounted.value.status, 'inaccurate');
    assert.equal(mounted.value.fix, null, 'a known invalid current position must not expose the previous fix as current');
    assert.equal(mounted.value.inServiceArea, null);
  } finally { if (mounted.tree) await renderer.act(async () => mounted.tree.unmount()); }
});
