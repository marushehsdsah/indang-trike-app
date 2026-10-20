const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/reactHarness');

// A 914 dp tall window, as on the pilot's Android emulator.
const { coveredHeight } = loadSource('hooks/useKeyboardHeight.js', {
  react: require('react'),
  'react-native': { Dimensions: { get: () => ({ height: 914.29 }) }, Keyboard: {}, Platform: { OS: 'android' } },
});

test('the keyboard covers its reported height plus the navigation bar below it', () => {
  // Measured: Android reported 312 dp with the keyboard's top at 578 dp, so it
  // covered 336 dp, the 24 dp navigation bar included.
  assert.equal(coveredHeight({ height: 312.38, screenY: 577.9 }), 336);
  assert.equal(coveredHeight({ height: 300, screenY: 614.29 }), 300, 'iOS: the two agree');
  assert.equal(coveredHeight({ height: 280 }), 280, 'no position reported');
  assert.equal(coveredHeight(undefined), 0);
});
