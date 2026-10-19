const test = require('node:test');
const assert = require('node:assert/strict');
const { TEST_LOCATION, testingFix } = require('../utils/testLocation');
const { isInIndangServiceArea } = require('../data/indangMap');

const manila = { latitude: 14.5995, longitude: 120.9842, accuracy: 6, timestamp: 1000, heading: 90, speed: 3 };
const cvsu = { latitude: 14.197805, longitude: 120.881639, accuracy: 6, timestamp: 1000, heading: null, speed: null };

test('while testing, a fix outside Indang stands in at CvSU Main Campus and keeps its accuracy and time', () => {
  const fix = testingFix(manila, true);
  assert.deepEqual(fix, { ...manila, latitude: TEST_LOCATION.coordinate.latitude, longitude: TEST_LOCATION.coordinate.longitude, simulated: true });
  assert.equal(isInIndangServiceArea(fix), true);
  assert.equal(TEST_LOCATION.name, 'CvSU Main Campus');
});

test('a fix inside Indang, a missing fix, and every fix when not testing stay as they are', () => {
  assert.equal(testingFix(cvsu, true), cvsu);
  assert.equal(testingFix(null, true), null);
  assert.equal(testingFix(manila, false), manila);
  // The switch is off unless EXPO_PUBLIC_TEST_ANYWHERE=true.
  assert.equal(process.env.EXPO_PUBLIC_TEST_ANYWHERE === 'true' || testingFix(manila) === manila, true);
});

test('a release build ignores the switch even when .env turns it on', () => {
  const load = (dev) => {
    const path = require.resolve('../utils/testLocation');
    delete require.cache[path];
    const saved = { env: process.env.EXPO_PUBLIC_TEST_ANYWHERE, dev: global.__DEV__ };
    process.env.EXPO_PUBLIC_TEST_ANYWHERE = 'true'; global.__DEV__ = dev;
    try { return require('../utils/testLocation').TEST_ANYWHERE; }
    finally {
      if (saved.env === undefined) delete process.env.EXPO_PUBLIC_TEST_ANYWHERE; else process.env.EXPO_PUBLIC_TEST_ANYWHERE = saved.env;
      if (saved.dev === undefined) delete global.__DEV__; else global.__DEV__ = saved.dev;
      delete require.cache[path];
    }
  };
  assert.equal(load(true), true, 'development build');
  assert.equal(load(false), false, 'release build');
});
