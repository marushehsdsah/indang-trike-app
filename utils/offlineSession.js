// What the app keeps on the phone so a signed-in rider or driver can open it
// without internet: the profile, fare settings, stats, and recent history.
// The token itself stays in SecureStore; the server still checks it on every
// request, so the saved copy only ever shows the user their own data.

// Sessions last 7 days from login (see indang-trike-backend/auth.js).
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CACHED_HISTORY_LIMIT = 50;

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

// Only what the history screen shows and Rebook needs, newest first.
function trimHistory(rides = []) {
  return rides.slice(0, CACHED_HISTORY_LIMIT).map(({ id, status, createdAt, fare, trip }) => ({
    id, status, createdAt, fare, trip: { pickup: { name: trip?.pickup?.name }, dropoff: trip?.dropoff },
  }));
}

module.exports = { CACHED_HISTORY_LIMIT, SESSION_LIFETIME_MS, canOpenOffline, getSessionExpiry, trimHistory };
