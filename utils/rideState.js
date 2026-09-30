const { haversineDistance } = require('./pathfinding');

const ACTIVE_STATUSES = ['searching', 'accepted', 'arrived', 'in_progress'];
// A driver holds the ride: each participant's GPS is shared with the other.
const ASSIGNED_STATUSES = ['accepted', 'arrived', 'in_progress'];
const GPS_MAX_AGE_MS = 30000;
const STATUS_LABELS = {
  searching: 'Finding a driver', accepted: 'Driver is on the way', arrived: 'Driver is at pickup',
  in_progress: 'On the way to your stop', completed: 'Trip completed', cancelled: 'Trip cancelled', no_driver: 'No driver available',
};

function isFreshFix(fix, now = Date.now()) {
  return Boolean(fix) && Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90 &&
    Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180 &&
    Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 100 &&
    Number.isFinite(fix.timestamp) && now - fix.timestamp <= GPS_MAX_AGE_MS && fix.timestamp - now <= 5000;
}

function validateFix(fix, now = Date.now()) {
  if (!isFreshFix(fix, now)) throw new Error('A fresh, accurate GPS location is required.');
  return {
    latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, timestamp: fix.timestamp,
    heading: Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 ? fix.heading : null,
    speed: Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null,
  };
}

function rankDrivers(drivers, pickup, passengers, now = Date.now(), radius = 5000) {
  return drivers.filter((driver) => driver.available && driver.connected && !driver.busy &&
    driver.capacity >= passengers && isFreshFix(driver.location, now))
    .map((driver) => ({ ...driver, distance: haversineDistance(pickup, driver.location) }))
    .filter((driver) => driver.distance <= radius)
    .sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)));
}

function nextRideStatus(status, action, role) {
  if (action === 'cancel' && ['searching', 'accepted', 'arrived'].includes(status) && ['passenger', 'driver'].includes(role)) return 'cancelled';
  const transition = { searching: ['accept', 'accepted'], accepted: ['arrive', 'arrived'], arrived: ['start', 'in_progress'], in_progress: ['complete', 'completed'] }[status];
  if (role !== 'driver' || !transition || transition[0] !== action) throw new Error('This action is not allowed at the current trip stage.');
  return transition[1];
}

function newerFix(current, incoming) {
  return (current?.timestamp ?? 0) > (incoming?.timestamp ?? 0) ? current : incoming;
}

// A snapshot can be older than a GPS update that already arrived by socket, so
// each participant's location keeps whichever fix was measured last.
function mergeRide(current, incoming) {
  if (!incoming || !current || incoming.id !== current.id) return incoming;
  if (incoming.version < current.version) return current;
  return { ...incoming, driverLocation: newerFix(current.driverLocation, incoming.driverLocation),
    passengerLocation: newerFix(current.passengerLocation, incoming.passengerLocation) };
}

function getDriverAction(status) {
  return {
    accepted: { action: 'arrive', label: 'Arrived at pickup' },
    arrived: { action: 'start', label: 'Start trip' },
    in_progress: { action: 'complete', label: 'Complete trip' },
  }[status] ?? null;
}

function formatFare(fare) { return `₱${Number(fare ?? 0).toFixed(2)}`; }
function userName(user) { return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.phone || 'Your account'; }

module.exports = { ACTIVE_STATUSES, ASSIGNED_STATUSES, GPS_MAX_AGE_MS, STATUS_LABELS, isFreshFix, validateFix, rankDrivers, nextRideStatus, mergeRide, getDriverAction, formatFare, userName };
