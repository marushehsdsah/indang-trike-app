const { DEFAULT_TRIP, isInIndangServiceArea } = require('../data/indangMap');

// TESTING ONLY. With EXPO_PUBLIC_TEST_ANYWHERE=true in .env, a development
// build reports a GPS fix outside Indang as if the phone stood at CvSU Main
// Campus, so passengers and drivers anywhere can book, match and run trips.
// Everything else about the fix (accuracy, time) stays real, and a fix inside
// Indang is never changed. A release build (__DEV__ false) ignores the switch,
// so an APK built on a PC whose .env still has it cannot ship it to riders.
const isDevelopmentBuild = typeof __DEV__ === 'undefined' || __DEV__;
const TEST_ANYWHERE = process.env.EXPO_PUBLIC_TEST_ANYWHERE === 'true' && isDevelopmentBuild;
const TEST_LOCATION = DEFAULT_TRIP.pickup;

function testingFix(fix, enabled = TEST_ANYWHERE) {
  if (!enabled || !fix || isInIndangServiceArea(fix)) return fix;
  return { ...fix, latitude: TEST_LOCATION.coordinate.latitude, longitude: TEST_LOCATION.coordinate.longitude, simulated: true };
}

module.exports = { TEST_ANYWHERE, TEST_LOCATION, testingFix };
