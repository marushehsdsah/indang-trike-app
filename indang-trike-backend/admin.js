const { normalizePhilippinePhone } = require('../utils/registration');
const { ACTIVE_STATUSES, ASSIGNED_STATUSES, isFreshFix } = require('../utils/rideState');
const { calculateRoute } = require('../utils/roadGraph');
const { SERVICE_AREA_NAME, INDANG_BOUNDS, isInIndangServiceArea } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { todaName } = require('../data/todaZones');
const { requireValue } = require('./policy');
const { ratingSummary } = require('../utils/rating');
const { REPORT_REASON_LABELS, penaltyFor, suspensionOf } = require('../utils/reports');

function parseAdminPhones(value = '') {
  return new Set(String(value).split(',').map(phone => normalizePhilippinePhone(phone.trim())).filter(Boolean));
}

function measuredLocation(fix) {
  if (!fix || !Number.isFinite(fix.latitude) || Math.abs(fix.latitude) > 90 ||
    !Number.isFinite(fix.longitude) || Math.abs(fix.longitude) > 180 ||
    !Number.isFinite(fix.timestamp) || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 100) return null;
  return { latitude: fix.latitude, longitude: fix.longitude, timestamp: fix.timestamp, accuracy: fix.accuracy };
}

// [longitude, latitude] rounded to about 1 m, as the map draws it.
const toLngLat = ({ latitude, longitude }) => [Math.round(longitude * 1e5) / 1e5, Math.round(latitude * 1e5) / 1e5];
const toLine = (route) => ({ coordinates: route.coordinates.map(toLngLat), distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });

// The road route between two points on the app's offline road graph, or null.
function roadRoute(from, to) {
  const roadGraph = getRoadGraph();
  if (roadGraph.status !== 'ready') return null;
  const result = calculateRoute(roadGraph.graph, from, to);
  return result.status === 'ok' ? result.route : null;
}

// Each booked ride's path, by stage: "requested" (the passenger set a
// destination and waits for a driver: the booked trip), "to-pickup" (a driver
// accepted: from the driver's live GPS to the pickup, computed the same way as
// the app's route guide, and the trip ahead), "to-destination" (on the trip).
function buildRideRoutes(rides, people, findRoute) {
  const byId = new Map(people.map((person) => [person.id, person]));
  return rides.filter((ride) => ride.status === 'searching' || (ASSIGNED_STATUSES.includes(ride.status) && ride.driverId)).map((ride) => {
    const stage = ride.status === 'searching' ? 'requested' : ride.status === 'in_progress' ? 'to-destination' : 'to-pickup';
    const toPickup = stage === 'to-pickup', driver = ride.driverId ? byId.get(String(ride.driverId)) : null;
    const pickup = ride.trip?.pickup, dropoff = ride.trip?.dropoff;
    const approach = toPickup && driver?.locationStatus === 'live' && pickup?.coordinate ? findRoute(driver.location, pickup.coordinate) : null;
    return {
      rideId: String(ride._id), status: ride.status, stage,
      driverId: ride.driverId ? String(ride.driverId) : null, passengerId: String(ride.passengerId),
      pickup: pickup?.coordinate ? { name: pickup.name || 'Pickup', coordinate: toLngLat(pickup.coordinate) } : null,
      dropoff: dropoff?.coordinate ? { name: dropoff.name || 'Destination', coordinate: toLngLat(dropoff.coordinate) } : null,
      trip: ride.route?.coordinates?.length > 1 ? toLine(ride.route) : null,
      approach: approach?.coordinates?.length > 1 ? toLine(approach) : null,
    };
  });
}

// reports: user id -> number of flagged (safety) ratings they received.
function buildOverview(users, rides, connectedIds, now, findRoute = roadRoute, reports = new Map()) {
  const activeByUser = new Map();
  for (const ride of rides) {
    activeByUser.set(String(ride.passengerId), ride);
    if (ride.driverId || ride.driverSlot) activeByUser.set(String(ride.driverId || ride.driverSlot), ride);
  }
  const people = users.filter(user => connectedIds.has(String(user._id))).map(user => {
    const id = String(user._id), driver = user.role === 'driver', active = activeByUser.get(id);
    const location = measuredLocation(user.location);
    const locationStatus = !location || user.locationAvailable === false ? 'unavailable' : isFreshFix(location, now) ? 'live' : 'stale';
    const inServiceArea = location ? isInIndangServiceArea(location) : null;
    const status = active ? (driver && active.status === 'searching' ? 'offered' : active.status) : driver ? (user.available ? 'available' : 'unavailable') : 'idle';
    return {
      id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || (driver ? 'Driver' : 'Passenger'),
      role: driver ? 'driver' : 'passenger', status,
      available: Boolean(driver && user.available && !active && locationStatus === 'live' && inServiceArea),
      ...(driver ? { plate: user.plate || '', toda: todaName(user.toda) || '' } : {}),
      rating: ratingSummary(user), safetyReports: reports.get(id) || 0, languageWarnings: user.languageWarnings || 0,
      location, locationStatus, inServiceArea,
      ride: active ? { id: String(active._id), status: active.status, pickup: active.trip?.pickup?.name || '', destination: active.trip?.dropoff?.name || '' } : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    serverTime: now,
    serviceArea: { name: SERVICE_AREA_NAME, bounds: INDANG_BOUNDS },
    summary: { online: people.length, drivers: people.filter(user => user.role === 'driver').length,
      passengers: people.filter(user => user.role === 'passenger').length,
      availableDrivers: people.filter(user => user.available).length,
      activeRides: new Set(people.filter(user => user.ride).map(user => user.ride.id)).size,
      liveLocations: people.filter(user => user.locationStatus === 'live').length },
    users: people,
    routes: buildRideRoutes(rides, people, findRoute),
  };
}

// The admin interface's lists (IndangGoAdmin), shaped as its screens show them.
// The newest come first, up to these many.
const ACCOUNT_LIMIT = 500, TRIP_LIMIT = 300, HISTORY_LIMIT = 500;
const fullName = (user, fallback) => [user.firstName, user.lastName].filter(Boolean).join(' ') || fallback;
// An account's ID on the admin screens: its mobile number as people type it (09…).
function localPhone(phone) {
  const normalized = normalizePhilippinePhone(phone);
  return normalized ? `0${normalized.slice(3)}` : String(phone || '');
}

// Online: the app is open. Available: a driver with the app open taking ride requests.
function accountStatus(user, connected) {
  if (!connected) return 'Offline';
  return user.role === 'driver' && user.available ? 'Available' : 'Online';
}

// connectedIds: the ids of users with the app open. key is unique for lists.
function buildAccounts(users, connectedIds) {
  return users.map((user) => {
    const id = String(user._id), driver = user.role === 'driver';
    return {
      key: id, id: localPhone(user.phone), name: fullName(user, driver ? 'Driver' : 'Passenger'), email: user.email || '',
      role: driver ? 'RIDER' : 'PASSENGER', status: accountStatus(user, connectedIds.has(id)), languageWarnings: user.languageWarnings || 0,
      ...(driver ? { toda: todaName(user.toda) || '', plate: user.plate || '' } : {}),
    };
  });
}

const REPORT_LIMIT = 300;
// God view's Reports tab. people: user id -> passengers and reporting drivers;
// rides: ride id -> the reported trips.
function buildReports(list, people, rides, now) {
  return list.map((report) => {
    const passenger = people.get(String(report.passengerId)), driver = people.get(String(report.reporterId)), ride = rides.get(String(report.rideId));
    const suspension = suspensionOf(passenger, now);
    return {
      key: String(report._id), status: report.status, reason: report.reason, reasonLabel: REPORT_REASON_LABELS[report.reason] || report.reason,
      details: report.details || '', date: report.createdAt, reviewedAt: report.reviewedAt || null, penalty: report.penalty || null,
      passenger: passenger ? {
        key: String(passenger._id), name: fullName(passenger, 'Passenger'), phone: localPhone(passenger.phone), email: passenger.email || '',
        offenses: passenger.offenses || 0, suspendedUntil: suspension && !suspension.permanent ? new Date(suspension.until) : null, disabled: Boolean(passenger.disabled),
        // What upholding a report against them now would do.
        nextPenalty: penaltyFor((passenger.offenses || 0) + 1).label,
      } : null,
      driver: driver ? { key: String(driver._id), name: fullName(driver, 'Driver'), plate: driver.plate || '', toda: todaName(driver.toda) || '' } : null,
      trip: ride ? { key: String(ride._id), id: tripId(String(ride._id)), status: tripStatus(ride.status), route: `${ride.trip?.pickup?.name || 'Pickup'} → ${ride.trip?.dropoff?.name || 'Destination'}`,
        date: ride.createdAt, cancelledBy: ride.status !== 'cancelled' ? null : ride.cancelledBy === ride.passengerId ? 'passenger' : ride.cancelledBy === ride.driverId ? 'driver' : null } : null,
    };
  });
}

// A search that found no driver is listed with the cancelled trips.
function tripStatus(status) {
  if (ACTIVE_STATUSES.includes(status)) return 'Ongoing';
  if (status === 'completed') return 'Completed';
  return status === 'no_driver' ? 'No driver' : 'Cancelled';
}

const tripId = (id) => `#TR-${id.slice(-6).toUpperCase()}`;

// people: user id -> the passengers and drivers of these rides, for their names
// and the driver's (current) TODA.
function buildTrips(rides, people) {
  return rides.map((ride) => {
    const id = String(ride._id), passenger = people.get(String(ride.passengerId));
    const driver = ride.driverId ? people.get(String(ride.driverId)) : null;
    return {
      key: id, id: tripId(id), todaId: todaName(driver?.toda) || '—',
      passenger: passenger ? fullName(passenger, 'Passenger') : 'Deleted account',
      driver: !ride.driverId ? '—' : driver ? fullName(driver, 'Driver') : 'Deleted account',
      status: tripStatus(ride.status),
      route: `${ride.trip?.pickup?.name || 'Pickup'} → ${ride.trip?.dropoff?.name || 'Destination'}`,
      date: ride.createdAt,
    };
  });
}

// One account's trips, as passenger or driver (God view's trip history).
// people: user id -> the other participants, for their names; ratings: ride
// id -> the rating this account received on that ride.
function buildHistory(accountId, rides, people, ratings) {
  return rides.map((ride) => {
    const id = String(ride._id), asDriver = ride.driverId === accountId && ride.passengerId !== accountId;
    const otherId = asDriver ? ride.passengerId : ride.driverId, other = otherId ? people.get(String(otherId)) : null;
    const rating = ratings.get(id);
    return {
      key: id, id: tripId(id), as: asDriver ? 'driver' : 'passenger', status: tripStatus(ride.status), stage: ride.status,
      with: !otherId ? null : other ? fullName(other, asDriver ? 'Passenger' : 'Driver') : 'Deleted account',
      pickup: ride.trip?.pickup?.name || 'Pickup', destination: ride.trip?.dropoff?.name || 'Destination',
      distanceMeters: ride.route?.distanceMeters ?? null, passengers: ride.passengers ?? null, fare: ride.fare ?? null,
      date: ride.createdAt, endedAt: ride.completedAt || ride.cancelledAt || null,
      ...(ride.status === 'cancelled' ? {
        cancelledBy: ride.cancelledBy === ride.passengerId ? 'passenger' : ride.cancelledBy === ride.driverId ? 'driver' : null,
        cancellationReason: ride.cancellationReason || '',
      } : {}),
      rating: rating ? { stars: rating.stars, tags: rating.tags || [], comment: rating.comment || '', flagged: Boolean(rating.flagged) } : null,
    };
  });
}

// groups: [{ _id: ride status, count, fares }]. Fares count completed trips only.
function historySummary(groups) {
  const summary = { trips: 0, completed: 0, cancelled: 0, noDriver: 0, ongoing: 0, fares: 0 };
  for (const { _id: status, count, fares } of groups) {
    summary.trips += count;
    const label = tripStatus(status);
    if (label === 'Completed') { summary.completed += count; summary.fares += fares; }
    else if (label === 'Ongoing') summary.ongoing += count;
    else if (label === 'No driver') summary.noDriver += count;
    else summary.cancelled += count;
  }
  return summary;
}

function createAdmin({ models, presence, clock, adminPhones, onSuspended = async () => {} }) {
  const allowed = parseAdminPhones(adminPhones);
  // The ids of users with the app open.
  const connectedIds = () => new Set([...presence].filter(([, sockets]) => sockets.size).map(([id]) => id));
  // A driver's route to the pickup changes only when they move; every admin
  // polls every 3 s, so recent routes are reused.
  const approachCache = new Map();
  function cachedRoute(from, to) {
    const key = `${from.latitude},${from.longitude}>${to.latitude},${to.longitude}`;
    if (!approachCache.has(key)) {
      if (approachCache.size >= 200) approachCache.clear();
      approachCache.set(key, roadRoute(from, to));
    }
    return approachCache.get(key);
  }
  // An admin account, or an account whose phone is on GOD_VIEW_ADMIN_PHONES.
  function middleware(req, res, next) {
    res.set('Cache-Control', 'no-store');
    requireValue(req.user.role === 'admin' || allowed.has(normalizePhilippinePhone(req.user.phone)), 403, 'This account does not have God view access. Ask the pilot administrator to enable it.');
    next();
  }
  async function overview() {
    const ids = [...presence.keys()];
    // Admins signed in on the app are watching, not riding, so they are not shown.
    // Safety reports: flagged ratings, and drivers' reports that were not dismissed.
    const [users, rides, reports] = await Promise.all([
      models.User.find({ _id: { $in: ids }, role: { $ne: 'admin' } }).select('firstName lastName role plate toda available location locationAvailable ratingSum ratingCount languageWarnings').lean(),
      models.Ride.find({ active: true, $or: [{ passengerId: { $in: ids } }, { driverSlot: { $in: ids } }] }).select('passengerId driverId driverSlot status trip route').lean(),
      models.Rating.aggregate([{ $match: { flagged: true, rateeId: { $in: ids } } }, { $group: { _id: '$rateeId', count: { $sum: 1 } } }]),
      models.Report.aggregate([{ $match: { passengerId: { $in: ids }, status: { $ne: 'dismissed' } } }, { $group: { _id: '$passengerId', count: { $sum: 1 } } }]),
    ]).then(([found, active, flagged, filed]) => {
      const counts = new Map();
      for (const { _id, count } of [...flagged, ...filed]) counts.set(String(_id), (counts.get(String(_id)) || 0) + count);
      return [found, active, counts];
    });
    // A phone can disconnect while the database reads are in flight.
    return buildOverview(users, rides, connectedIds(), clock(), cachedRoute, reports);
  }
  // Passengers and drivers, newest first; admin accounts are not listed. total
  // counts them all, in case there are more than the list holds.
  async function accounts() {
    const [users, total] = await Promise.all([
      models.User.find({ role: { $ne: 'admin' } }).sort({ createdAt: -1, _id: -1 }).limit(ACCOUNT_LIMIT)
        .select('phone firstName lastName email role available toda plate languageWarnings').lean(),
      models.User.countDocuments({ role: { $ne: 'admin' } }),
    ]);
    return { accounts: buildAccounts(users, connectedIds()), total };
  }
  // One passenger's or driver's account and every trip they booked or
  // accepted, newest first; summary covers all of them.
  async function history(id) {
    requireValue(/^[a-f\d]{24}$/i.test(id), 404, 'No account has this ID.');
    const user = await models.User.findOne({ _id: id, role: { $ne: 'admin' } })
      .select('phone firstName lastName email role available toda plate ratingSum ratingCount createdAt').lean();
    requireValue(user, 404, 'No account has this ID.');
    const mine = { $or: [{ passengerId: id }, { driverId: id }] };
    const [rides, groups] = await Promise.all([
      models.Ride.find(mine).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT)
        .select('passengerId driverId status trip route passengers fare createdAt completedAt cancelledAt cancelledBy cancellationReason').lean(),
      models.Ride.aggregate([{ $match: mine }, { $group: { _id: '$status', count: { $sum: 1 }, fares: { $sum: { $ifNull: ['$fare', 0] } } } }]),
    ]);
    const others = [...new Set(rides.map((ride) => (ride.passengerId === id ? ride.driverId : ride.passengerId)).filter((other) => /^[a-f\d]{24}$/i.test(String(other))))];
    const [people, ratings] = await Promise.all([
      models.User.find({ _id: { $in: others } }).select('firstName lastName').lean(),
      models.Rating.find({ rateeId: id, rideId: { $in: rides.map((ride) => String(ride._id)) } }).select('rideId stars tags comment flagged').lean(),
    ]);
    return {
      account: { ...buildAccounts([user], connectedIds())[0], joined: user.createdAt, rating: ratingSummary(user) },
      summary: historySummary(groups),
      trips: buildHistory(id, rides, new Map(people.map((person) => [String(person._id), person])), new Map(ratings.map((rating) => [rating.rideId, rating]))),
    };
  }
  async function trips(limit = TRIP_LIMIT) {
    const rides = await models.Ride.find().sort({ createdAt: -1, _id: -1 }).limit(limit).select('passengerId driverId status trip createdAt').lean();
    const ids = [...new Set(rides.flatMap((ride) => [ride.passengerId, ride.driverId]).filter((id) => /^[a-f\d]{24}$/i.test(String(id))))];
    const people = await models.User.find({ _id: { $in: ids } }).select('firstName lastName toda').lean();
    return buildTrips(rides, new Map(people.map((person) => [String(person._id), person])));
  }
  async function dashboard() {
    const [totalAccounts, onlineNow, ongoingTrips, recentTrips] = await Promise.all([
      models.User.countDocuments({ role: { $ne: 'admin' } }),
      models.User.countDocuments({ _id: { $in: [...connectedIds()] }, role: { $ne: 'admin' } }),
      models.Ride.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
      trips(3),
    ]);
    return { totalAccounts, onlineNow, ongoingTrips, recentTrips };
  }
  // Drivers' reports about passengers, newest first, with what each
  // passenger's next upheld report would bring.
  async function reports() {
    const list = await models.Report.find().sort({ createdAt: -1, _id: -1 }).limit(REPORT_LIMIT).lean();
    const ids = [...new Set(list.flatMap((item) => [item.passengerId, item.reporterId]).filter((id) => /^[a-f\d]{24}$/i.test(String(id))))];
    const [people, rides] = await Promise.all([
      models.User.find({ _id: { $in: ids } }).select('phone firstName lastName email role plate toda offenses suspendedUntil disabled').lean(),
      models.Ride.find({ _id: { $in: list.map((item) => item.rideId) } }).select('status trip createdAt cancelledBy passengerId driverId cancellationReason').lean(),
    ]);
    return { reports: buildReports(list, new Map(people.map((person) => [String(person._id), person])), new Map(rides.map((ride) => [String(ride._id), ride])), clock()), serverTime: clock() };
  }
  // Upholds a pending report: the passenger's next offense and its penalty
  // (utils/reports.js). The third disables the account and blocks its number
  // and email from signing up again. Every session ends at once.
  async function uphold(id, admin) {
    requireValue(/^[a-f\d]{24}$/i.test(id), 404, 'Report not found.');
    const report = await models.Report.findById(id);
    requireValue(report, 404, 'Report not found.');
    requireValue(report.status === 'pending', 409, 'This report was already reviewed.');
    const passenger = await models.User.findById(report.passengerId);
    requireValue(passenger, 404, 'The reported account no longer exists.');
    const penalty = penaltyFor((passenger.offenses || 0) + 1), now = clock();
    // Only one admin's review counts, even if two press at once.
    const claimed = await models.Report.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status: 'upheld', reviewedBy: String(admin._id), reviewedAt: new Date(now), penalty: {
      offense: penalty.offense, label: penalty.label, permanent: Boolean(penalty.permanent), until: penalty.permanent ? null : new Date(now + penalty.durationMs) } } }, { returnDocument: 'after' });
    requireValue(claimed, 409, 'This report was already reviewed.');
    await models.User.updateOne({ _id: passenger._id }, penalty.permanent
      ? { $set: { offenses: penalty.offense, disabled: true, available: false, locationAvailable: false } }
      : { $set: { offenses: penalty.offense, suspendedUntil: new Date(now + penalty.durationMs) } });
    if (penalty.permanent) {
      const phone = normalizePhilippinePhone(passenger.phone) || passenger.phone;
      await models.Blocked.updateOne({ phone }, { $set: { email: (passenger.email || '').toLowerCase(), userId: String(passenger._id), reason: 'Third upheld report' } }, { upsert: true });
    }
    await models.Session.deleteMany({ userId: passenger._id });
    await onSuspended(String(passenger._id));
    return { report: (await reports()).reports.find((item) => item.key === id) };
  }
  async function dismiss(id, admin) {
    requireValue(/^[a-f\d]{24}$/i.test(id), 404, 'Report not found.');
    const updated = await models.Report.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status: 'dismissed', reviewedBy: String(admin._id), reviewedAt: new Date(clock()) } }, { returnDocument: 'after' });
    requireValue(updated, 409, 'This report was already reviewed.');
    return { report: (await reports()).reports.find((item) => item.key === id) };
  }
  return { middleware, overview, accounts, history, trips, dashboard, reports, uphold, dismiss };
}

module.exports = { createAdmin, parseAdminPhones, buildOverview, buildReports, buildRideRoutes, buildAccounts, buildTrips, buildHistory, historySummary, tripStatus };
