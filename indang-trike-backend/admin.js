const { normalizePhilippinePhone } = require('../utils/registration');
const { ASSIGNED_STATUSES, isFreshFix } = require('../utils/rideState');
const { calculateRoute } = require('../utils/roadGraph');
const { SERVICE_AREA_NAME, INDANG_BOUNDS, isInIndangServiceArea } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { requireValue } = require('./policy');

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

// For each matched ride, the path the driver's route guide shows: from the
// driver's live GPS to the pickup until pickup ("approach", computed the same
// way as in the app), then the booked trip from pickup to destination.
function buildRideRoutes(rides, people, findRoute) {
  const byId = new Map(people.map((person) => [person.id, person]));
  return rides.filter((ride) => ASSIGNED_STATUSES.includes(ride.status) && ride.driverId).map((ride) => {
    const toPickup = ride.status !== 'in_progress', driver = byId.get(String(ride.driverId));
    const pickup = ride.trip?.pickup, dropoff = ride.trip?.dropoff;
    const approach = toPickup && driver?.locationStatus === 'live' && pickup?.coordinate ? findRoute(driver.location, pickup.coordinate) : null;
    return {
      rideId: String(ride._id), status: ride.status, stage: toPickup ? 'to-pickup' : 'to-destination',
      driverId: String(ride.driverId), passengerId: String(ride.passengerId),
      pickup: pickup?.coordinate ? { name: pickup.name || 'Pickup', coordinate: toLngLat(pickup.coordinate) } : null,
      dropoff: dropoff?.coordinate ? { name: dropoff.name || 'Destination', coordinate: toLngLat(dropoff.coordinate) } : null,
      trip: ride.route?.coordinates?.length > 1 ? toLine(ride.route) : null,
      approach: approach?.coordinates?.length > 1 ? toLine(approach) : null,
    };
  });
}

function buildOverview(users, rides, connectedIds, now, findRoute = roadRoute) {
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
      ...(driver ? { plate: user.plate || '', toda: user.toda || '' } : {}),
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

function createAdmin({ models, presence, clock, adminPhones }) {
  const allowed = parseAdminPhones(adminPhones);
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
  function middleware(req, res, next) {
    res.set('Cache-Control', 'no-store');
    requireValue(allowed.has(normalizePhilippinePhone(req.user.phone)), 403, 'This account does not have God view access. Ask the pilot administrator to enable it.');
    next();
  }
  async function overview() {
    const ids = [...presence.keys()];
    const [users, rides] = await Promise.all([
      models.User.find({ _id: { $in: ids } }).select('firstName lastName role plate toda available location locationAvailable').lean(),
      models.Ride.find({ active: true, $or: [{ passengerId: { $in: ids } }, { driverSlot: { $in: ids } }] }).select('passengerId driverId driverSlot status trip route').lean(),
    ]);
    // A phone can disconnect while the database reads are in flight.
    return buildOverview(users, rides, new Set([...presence].filter(([, sockets]) => sockets.size).map(([id]) => id)), clock(), cachedRoute);
  }
  return { middleware, overview };
}

module.exports = { createAdmin, parseAdminPhones, buildOverview, buildRideRoutes };
