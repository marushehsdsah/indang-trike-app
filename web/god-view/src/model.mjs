export function filterUsers(users, role, query) {
  const needle = query.trim().toLocaleLowerCase();
  return users.filter(user => (role === 'all' || user.role === role) &&
    [user.name, user.plate, user.toda].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
}

export function isLive(user, now, connected) {
  return Boolean(connected && user.location && user.locationStatus === 'live' && now - user.location.timestamp <= 30000);
}

export function snapshotTiming(serverTime, requestStarted, receivedAt) {
  // Conservatively include the entire round trip in the snapshot's age. A
  // delayed response must never reset an old measured position to "live".
  return { connected: receivedAt - requestStarted <= 10000, serverOffset: serverTime - requestStarted };
}

export function ageLabel(timestamp, now) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function locationLabel(user, now, connected) {
  if (!user.location) return 'Waiting for GPS';
  if (!connected) return 'Updates paused · last known';
  if (!isLive(user, now, connected)) return `Last known · ${ageLabel(user.location.timestamp, now)}`;
  return `Live GPS · ${ageLabel(user.location.timestamp, now)}`;
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}

export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// The route lines for a ride's details, by stage.
export function routeSummary(route) {
  const leg = (line) => `${formatDistance(line.distanceMeters)} · ${formatDuration(line.durationSeconds)}`;
  if (route.stage === 'requested') return [route.trip ? `Requested trip: ${leg(route.trip)}` : 'Requested trip', 'Waiting for a driver'];
  if (route.stage === 'to-pickup') {
    const parts = [route.approach ? `Driver to passenger: ${leg(route.approach)}` : 'Driver to passenger: waiting for live GPS'];
    if (route.trip) parts.push(`Then trip: ${leg(route.trip)}`);
    return parts;
  }
  return [route.trip ? `To destination: ${leg(route.trip)}` : 'To destination'];
}

// "Rated 4.8 from 12 trips", or "No ratings yet". Ratings come from the
// people they rode with (utils/rating.js).
export function ratingLabel(user) {
  const rating = user.rating;
  if (!rating || rating.average === null || rating.average === undefined) return 'No ratings yet';
  return `Rated ${rating.average.toFixed(1)} from ${rating.count} trip${rating.count === 1 ? '' : 's'}`;
}

// "2 safety reports to review", or null when there are none.
// "3 language warnings", or null: how often offensive words were censored
// from what they sent (utils/profanity.js).
export function languageWarningLabel(user) {
  const count = user.languageWarnings || 0;
  return count ? `${count} language warning${count === 1 ? '' : 's'}` : null;
}

export function safetyReportLabel(user) {
  const count = user.safetyReports || 0;
  return count ? `${count} safety report${count === 1 ? '' : 's'} to review` : null;
}

export function statusLabel(user) {
  return { idle: 'Browsing', available: user.available ? 'Ready for requests' : 'Unavailable for matching', unavailable: 'Not accepting rides',
    offered: 'Ride request offered', searching: 'Finding a driver', accepted: 'Heading to pickup', arrived: 'At pickup', in_progress: 'On a trip' }[user.status] || 'Connected';
}

// Each ride's path as solid lines, by what is happening: "requested" (the
// passenger's booked trip while waiting for a driver), "approach" (the driver
// on the way to the passenger) and "trip" (pickup to destination once
// matched), plus the pickup and destination points.
export function routeFeatures(routes, selectedRideId) {
  const features = [];
  for (const route of routes) {
    const selected = route.rideId === selectedRideId;
    const line = (kind, path) => { if (path) features.push({ type: 'Feature', properties: { kind, selected, rideId: route.rideId }, geometry: { type: 'LineString', coordinates: path.coordinates } }); };
    if (route.stage === 'requested') line('requested', route.trip);
    else {
      line('trip', route.trip);
      // Drawn last, so on top where it meets the trip at the pickup.
      if (route.stage === 'to-pickup') line('approach', route.approach);
    }
    for (const [kind, stop] of [['pickup', route.pickup], ['dropoff', route.dropoff]]) {
      if (stop) features.push({ type: 'Feature', properties: { kind, rideId: route.rideId, name: stop.name }, geometry: { type: 'Point', coordinates: stop.coordinate } });
    }
  }
  return { type: 'FeatureCollection', features };
}

// The Accounts view lists every passenger and driver from /api/admin/accounts,
// which names drivers RIDER (as the admin app does) and gives each a status:
// Offline, Online (the app is open) or Available (a driver taking requests).
export const accountRole = (account) => account.role === 'RIDER' ? 'driver' : 'passenger';
export const isOnline = (account) => account.status !== 'Offline';

// 09171234567 → 0917 123 4567, as the sign-in form writes mobile numbers.
export function formatPhone(phone) {
  return /^09\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

// role: all, driver, passenger or pending (drivers waiting for approval);
// status: all, online or offline. A number matches with or without its spaces.
export function filterAccounts(accounts, role, status, query) {
  const needle = query.trim().toLocaleLowerCase(), digits = needle.replace(/[\s-]/g, '');
  return accounts.filter(account => (role === 'all' || (role === 'pending' ? account.approval === 'Pending' : accountRole(account) === role)) &&
    (status === 'all' || (status === 'online') === isOnline(account)) &&
    ([account.name, account.email, account.plate, account.toda].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle) || account.id.includes(digits)));
}

// The days a driver's trip records PDF can cover (driverReport.mjs); the
// trip history endpoint allows 1 to 30.
export const REPORT_PERIODS = [7, 14, 30];

// A driver's approval (indang-trike-backend/admin.js): Pending until an admin
// checks them against their TODA's list of registered drivers, Approved, or
// Suspended. The decisions open to each, in the order their buttons show.
export const DRIVER_ACTIONS = { Pending: ['approve', 'terminate', 'delete'], Approved: ['terminate', 'delete'], Suspended: ['unblock'] };

// Online accounts first, then by name.
export function sortAccounts(accounts) {
  return [...accounts].sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

// { all, online, offline }, each { total, driver, passenger }.
export function accountCounts(accounts) {
  const counts = Object.fromEntries(['all', 'online', 'offline'].map(group => [group, { total: 0, driver: 0, passenger: 0 }]));
  for (const account of accounts) {
    for (const group of ['all', isOnline(account) ? 'online' : 'offline']) { counts[group].total += 1; counts[group][accountRole(account)] += 1; }
  }
  return counts;
}

export function roleCountLabel({ driver, passenger }) {
  return `${driver} driver${driver === 1 ? '' : 's'} · ${passenger} passenger${passenger === 1 ? '' : 's'}`;
}

// An account's trip history (/api/admin/accounts/:id). A trip's status is
// Completed, Cancelled, No driver (the search found none) or Ongoing; the
// Cancelled filter includes No driver.
export function filterTrips(trips, status) {
  if (status === 'all') return trips;
  return trips.filter(trip => status === 'cancelled' ? ['Cancelled', 'No driver'].includes(trip.status) : trip.status.toLowerCase() === status);
}

export function formatFare(fare) {
  return Number.isFinite(fare) ? `₱${fare.toLocaleString('en-PH', { maximumFractionDigits: 2 })}` : '—';
}

// "By the driver: Flat tyre". The server saves "Cancelled by participant", or
// "Cancelled by an IndangGO admin" for an admin, when no reason was given
// (indang-trike-backend/dispatch.js and admin.js).
const UNEXPLAINED = ['Cancelled by participant', 'Cancelled by an IndangGO admin'];
export function cancellationLabel(trip) {
  const who = trip.cancelledBy ? `By the ${trip.cancelledBy}` : 'Cancelled';
  const reason = trip.cancellationReason && !UNEXPLAINED.includes(trip.cancellationReason) ? trip.cancellationReason : '';
  return reason ? `${who}: ${reason}` : who;
}

// The ride a driver and passenger are on together, if any.
export function tripOf(id, routes) {
  return routes.find((route) => route.stage === 'to-destination' && (route.driverId === id || route.passengerId === id)) ?? null;
}

// What the map marks: people, except that a driver and passenger on a trip
// together become one marker at the trike, placed by the driver's phone (or
// the passenger's when the driver has no fix). Selecting it selects the driver.
export function mapPeople(users, routes) {
  const byId = new Map(users.map((user) => [user.id, user]));
  const merged = new Set(), trips = [];
  for (const route of routes) {
    if (route.stage !== 'to-destination') continue;
    const driver = byId.get(route.driverId), passenger = byId.get(route.passengerId);
    if (!driver || !passenger) continue;
    const at = driver.location ? driver : passenger;
    trips.push({ id: `trip:${route.rideId}`, role: 'trip', name: `${driver.name} and ${passenger.name}`, location: at.location,
      locationStatus: at.locationStatus, members: [driver.id, passenger.id], selectId: driver.id });
    merged.add(driver.id).add(passenger.id);
  }
  return [...users.filter((user) => !merged.has(user.id)), ...trips];
}
