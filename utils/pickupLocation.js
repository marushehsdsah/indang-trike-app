const { isFreshFix } = require('./rideState');

// Any fresh measured fix is the current pickup, inside Indang or not; booking
// decides separately whether that pickup can be booked.
function pickupFromFix(fix, now = Date.now()) {
  if (!isFreshFix(fix, now)) return null;
  return { id: 'current-location', name: 'Current location', kind: 'current-location',
    coordinate: { latitude: fix.latitude, longitude: fix.longitude } };
}
module.exports = { pickupFromFix };
