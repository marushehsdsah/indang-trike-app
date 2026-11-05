// What the app keeps on the phone so a signed-in rider or driver can open it
// without internet: the profile, fare settings, stats, recent history, and
// the ongoing trip.
// The token itself stays in SecureStore; the server still checks it on every
// request, so the saved copy only ever shows the user their own data.

const { ASSIGNED_STATUSES } = require('./rideState');

// Sessions last 7 days from login (see indang-trike-backend/auth.js).
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CACHED_HISTORY_LIMIT = 50;
// A trip in town ends well within this; a saved one older than this most
// likely ended while the app was closed, so it is not reopened as ongoing.
const SAVED_RIDE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

// A session restored from before this cache existed has no known expiry. It
// was valid when last verified and lasts at most 7 days from login, so it
// cannot outlive verification + 7 days.
function getSessionExpiry({ loginExpiresAt, cachedExpiresAt, verifiedAt }) {
  const login = typeof loginExpiresAt === 'string' ? Date.parse(loginExpiresAt) : loginExpiresAt;
  if (Number.isFinite(login)) return login;
  if (Number.isFinite(cachedExpiresAt)) return cachedExpiresAt;
  return verifiedAt + SESSION_LIFETIME_MS;
}

function canOpenOffline(cache, now = Date.now()) {
  return Boolean(cache?.user?.id && cache.config && Number.isFinite(cache.expiresAt) && cache.expiresAt > now);
}

// Only what the history and home screens show and Rebook needs, newest first.
function trimHistory(rides = []) {
  return rides.slice(0, CACHED_HISTORY_LIMIT).map(({ id, status, createdAt, fare, trip, route }) => ({
    id, status, createdAt, fare, trip: { pickup: { name: trip?.pickup?.name }, dropoff: trip?.dropoff },
    route: { distanceLabel: route?.distanceLabel },
  }));
}

// The ongoing trip, kept so an app restarted without internet reopens on it
// with its route and the driver can still navigate. Only a trip with a driver
// is kept; positions are dropped, since they would be stale when it reopens.
function rideToSave(ride) {
  if (!ride || !ASSIGNED_STATUSES.includes(ride.status)) return null;
  return { ...ride, driverLocation: null, passengerLocation: null, driverConnected: false, driverLocationAvailable: false };
}

// The saved trip, if it can still be ongoing: the server's answer replaces it
// as soon as the app reconnects.
function savedRide(cache, now = Date.now()) {
  const ride = cache?.ride, bookedAt = Date.parse(ride?.createdAt);
  return ride && ASSIGNED_STATUSES.includes(ride.status) && Number.isFinite(bookedAt) && now - bookedAt <= SAVED_RIDE_MAX_AGE_MS ? ride : null;
}

module.exports = { CACHED_HISTORY_LIMIT, SAVED_RIDE_MAX_AGE_MS, SESSION_LIFETIME_MS, canOpenOffline, getSessionExpiry, rideToSave, savedRide, trimHistory };
