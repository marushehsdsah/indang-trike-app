const { randomUUID } = require('node:crypto');
const { ASSIGNED_STATUSES, GPS_MAX_AGE_MS, isFreshFix, rankDrivers, validateFix, nextRideStatus } = require('../utils/rideState');
const { getMunicipalityAt } = require('../data/indangMap');
const { findToda, todaServes } = require('../data/todaZones');
const { HttpError, requireValue, publicUser, bookingFields, cleanText } = require('./policy');

function createDispatch({ models, io, clock, presence, options = {} }) {
  const { User, Ride } = models;
  const offerMs = options.offerMs ?? 20000, searchMs = options.searchMs ?? 120000;
  let tail = Promise.resolve();
  // Ordered writes plus database uniqueness protect the single-server deployment.
  function run(work) { const result = tail.then(work); tail = result.catch(() => {}); return result; }
  const connected = (id) => Boolean(presence.get(String(id))?.size);
  function notify(...ids) { for (const id of new Set(ids.filter(Boolean).map(String))) io.to(`user:${id}`).emit('state:changed'); }
  function notifyRide(ride) { notify(ride.passengerId, ride.driverId, ride.driverSlot); }
  async function view(ride, viewerId, offered = false) {
    if (!ride) return null;
    const result = ride.toObject ? ride.toObject() : { ...ride };
    const [driver, passenger] = await Promise.all([result.driverId ? User.findById(result.driverId) : null, User.findById(result.passengerId)]);
    const contact = (user, allowPhone) => user ? {
      id: String(user._id), firstName: user.firstName || '', lastName: user.lastName || '',
      ...(allowPhone ? { phone: user.phone } : {}),
      ...(user.role === 'driver' ? { plate: user.plate, toda: user.toda, capacity: user.capacity } : {}),
    } : null;
    const assigned = ASSIGNED_STATUSES.includes(result.status);
    // Only a fix that was still fresh when the driver accepted belongs to this ride,
    // never one left over from an earlier trip.
    const passengerLocation = assigned && passenger?.location && passenger.location.timestamp >= +result.acceptedAt - GPS_MAX_AGE_MS
      ? passenger.location : null;
    return {
      id: String(result._id), status: result.status, version: result.version, trip: result.trip, route: result.route,
      passengers: result.passengers, note: result.note, fare: result.fare,
      driver: contact(driver, assigned), passenger: contact(passenger, assigned),
      driverLocation: assigned && driver?.location ? driver.location : null,
      driverConnected: assigned && driver ? connected(driver._id) : false,
      driverLocationAvailable: Boolean(assigned && driver?.locationAvailable && isFreshFix(driver.location, clock())),
      passengerLocation,
      createdAt: result.createdAt, completedAt: result.completedAt, cancelledAt: result.cancelledAt,
      cancellationReason: result.cancellationReason, searchExpiresAt: result.searchExpiresAt,
      ...(offered && result.driverSlot === String(viewerId) ? { offerId: result.offerId, offerExpiresAt: result.offerExpiresAt } : {}),
    };
  }
  async function snapshot(userId) {
    const user = await User.findById(userId);
    requireValue(user, 401, 'Please log in again.');
    const id = String(userId), driver = user.role === 'driver';
    const active = await Ride.findOne({ active: true, ...(driver ? { driverSlot: id } : { passengerId: id }) });
    const offer = driver && active?.status === 'searching' ? active : null;
    const last = await Ride.findOne({ active: false, ...(driver ? { driverId: id } : { passengerId: id }) }).sort({ updatedAt: -1 });
    return { user: publicUser(user), ride: offer ? null : await view(active, id), offer: await view(offer, id, true), lastRide: await view(last, id), serverTime: clock() };
  }
  async function release(ride) {
    const updated = await Ride.findOneAndUpdate({ _id: ride._id, status: 'searching', version: ride.version }, {
      $unset: { driverSlot: 1, offerId: 1, offerExpiresAt: 1 }, $inc: { version: 1 },
    }, { returnDocument: 'after' });
    if (updated) notify(ride.passengerId, ride.driverSlot);
    return updated;
  }
  async function tickUnsafe() {
    const searches = await Ride.find({ status: 'searching', active: true }).sort({ createdAt: 1, _id: 1 });
    for (let ride of searches) {
      if (+ride.searchExpiresAt <= clock()) {
        const expired = await Ride.findOneAndUpdate({ _id: ride._id, version: ride.version, status: 'searching' }, {
          $set: { status: 'no_driver', active: false }, $unset: { driverSlot: 1, offerId: 1, offerExpiresAt: 1 }, $inc: { version: 1 },
        }, { returnDocument: 'after' });
        if (expired) notifyRide(ride);
        continue;
      }
      if (ride.driverSlot) {
        const driver = await User.findById(ride.driverSlot);
        if (+ride.offerExpiresAt > clock() && driver?.available && driver.locationAvailable && connected(driver._id) && isFreshFix(driver.location, clock())) continue;
        ride = await release(ride);
        if (!ride) continue;
      }
      const [users, occupied] = await Promise.all([User.find({ role: 'driver', available: true }), Ride.find({ active: true, driverSlot: { $exists: true } }).select('driverSlot')]);
      const slots = new Set(occupied.map((entry) => entry.driverSlot));
      // Drivers share GPS from anywhere, but only those in the pickup's town get
      // its offers, within that town's radius: the towns' roads do not connect.
      const town = getMunicipalityAt(ride.trip.pickup.coordinate);
      // An Indang TODA's drivers serve only trips inside its barangays.
      const inTodaScope = (user) => {
        const toda = findToda(user.toda);
        return !toda || todaServes(toda, ride.trip.pickup.coordinate, ride.trip.dropoff.coordinate);
      };
      const candidates = rankDrivers(users.filter((user) => publicUser(user).profileComplete && user.locationAvailable &&
        user.location && town && getMunicipalityAt(user.location) === town && !ride.attemptedDrivers.includes(String(user._id)) && inTodaScope(user))
        .map((user) => ({ id: String(user._id), available: user.available, capacity: user.capacity, location: user.location, connected: connected(user._id), busy: slots.has(String(user._id)) })),
      ride.trip.pickup.coordinate, ride.passengers, clock(), options.radius ?? town?.matchRadiusMeters ?? 0);
      for (const candidate of candidates) {
        try {
          const offered = await Ride.findOneAndUpdate({ _id: ride._id, status: 'searching', version: ride.version, driverSlot: { $exists: false } }, {
            $set: { driverSlot: candidate.id, offerId: randomUUID(), offerExpiresAt: new Date(Math.min(clock() + offerMs, +ride.searchExpiresAt)) },
            $push: { attemptedDrivers: candidate.id }, $inc: { version: 1 },
          }, { returnDocument: 'after' });
          if (offered) notifyRide(offered);
          break;
        } catch (error) { if (error.code !== 11000) throw error; }
      }
    }
  }
  async function book(user, body) {
    requireValue(user.role !== 'driver', 403, 'Only passengers can request a ride.');
    requireValue(publicUser(user).profileComplete, 409, 'Complete your profile before booking.');
    requireValue(typeof body.idempotencyKey === 'string', 400, 'A booking request key is required.');
    const existing = await Ride.findOne({ passengerId: String(user._id), idempotencyKey: body.idempotencyKey });
    if (existing) return { ride: await view(existing, user._id), reused: true };
    requireValue(!await Ride.exists({ passengerId: String(user._id), active: true }), 409, 'You already have an active booking.');
    let ride;
    try { ride = await Ride.create({ ...bookingFields(body), passengerId: String(user._id), fare: 45, searchExpiresAt: new Date(clock() + searchMs) }); }
    catch (error) { if (error.code === 11000) throw new HttpError(409, 'You already have an active booking.'); throw error; }
    await tickUnsafe(); notify(user._id);
    return { ride: await view(await Ride.findById(ride._id), user._id), reused: false };
  }
  async function action(user, id, actionName, body = {}) {
    requireValue(/^[a-f0-9]{24}$/.test(id), 404, 'Ride not found.');
    await tickUnsafe();
    const ride = await Ride.findById(id), userId = String(user._id);
    requireValue(ride, 404, 'Ride not found.');
    if (['accept', 'decline'].includes(actionName)) {
      requireValue(user.role === 'driver', 403, 'Only the offered driver can respond.');
      if (actionName === 'accept' && ride.driverId === userId && ride.status === 'accepted') return { ride: await view(ride, userId) };
      requireValue(ride.status === 'searching' && ride.driverSlot === userId && ride.offerId === body.offerId && +ride.offerExpiresAt > clock(), 409, 'This offer is no longer available.');
      const currentUser = await User.findById(user._id);
      requireValue(currentUser.available && currentUser.locationAvailable && connected(userId) && isFreshFix(currentUser.location, clock()), 409, 'Reconnect with a fresh GPS location before accepting.');
      if (actionName === 'decline') { await release(ride); await tickUnsafe(); return { ride: null, state: await snapshot(userId) }; }
    } else {
      requireValue(ride.passengerId === userId || ride.driverId === userId, 403, 'You are not a participant in this ride.');
      if (actionName !== 'cancel') requireValue(ride.driverId === userId && user.role === 'driver', 403, 'Only the assigned driver can update this trip.');
    }
    const completedAction = { arrive: 'arrived', start: 'in_progress', complete: 'completed', cancel: 'cancelled', accept: 'accepted' }[actionName];
    if (ride.status === completedAction) return { ride: await view(ride, userId) };
    let status;
    try { status = nextRideStatus(ride.status, actionName, user.role || 'passenger'); } catch (error) { throw new HttpError(409, error.message); }
    const set = { status }, unset = {};
    set[{ accept: 'acceptedAt', arrive: 'arrivedAt', start: 'startedAt', complete: 'completedAt', cancel: 'cancelledAt' }[actionName]] = new Date(clock());
    if (actionName === 'accept') { set.driverId = userId; unset.offerId = 1; unset.offerExpiresAt = 1; }
    if (['completed', 'cancelled'].includes(status)) { set.active = false; unset.driverSlot = 1; unset.offerId = 1; unset.offerExpiresAt = 1; }
    if (actionName === 'cancel') { set.cancelledBy = userId; set.cancellationReason = cleanText(body.reason, 200) || 'Cancelled by participant'; }
    const updated = await Ride.findOneAndUpdate({ _id: id, version: ride.version, status: ride.status }, {
      $set: set, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}),
    }, { returnDocument: 'after' });
    requireValue(updated, 409, 'The trip changed. Refresh and try again.');
    notifyRide(ride); notifyRide(updated); await tickUnsafe();
    return { ride: await view(updated, userId) };
  }
  async function location(user, body) {
    requireValue(user.role === 'driver', 403, 'Driver account required.');
    let fix;
    try { fix = validateFix(body, clock()); } catch (error) { throw new HttpError(400, error.message); }
    const current = await User.findById(user._id);
    requireValue(!current.location || fix.timestamp >= current.location.timestamp, 409, 'This GPS fix is older than your last update.');
    await User.updateOne({ _id: user._id }, { $set: { location: { ...fix, receivedAt: clock() }, locationAvailable: true } });
    const ride = await Ride.findOne({ active: true, driverId: String(user._id) });
    if (ride) io.to(`user:${ride.passengerId}`).emit('driver:location', { rideId: String(ride._id), location: fix, connected: connected(user._id) });
    await tickUnsafe(); return { ok: true };
  }
  // Passenger GPS supports the authorized admin overview. Private socket
  // updates still go only to the driver who holds their ride.
  async function passengerLocation(user, body) {
    requireValue(user.role !== 'driver', 403, 'Passenger account required.');
    let fix;
    try { fix = validateFix(body, clock()); } catch (error) { throw new HttpError(400, error.message); }
    const current = await User.findById(user._id);
    requireValue(!current.location || fix.timestamp >= current.location.timestamp, 409, 'This GPS fix is older than your last update.');
    await User.updateOne({ _id: user._id }, { $set: { location: { ...fix, receivedAt: clock() }, locationAvailable: true } });
    const ride = await Ride.findOne({ active: true, passengerId: String(user._id), status: { $in: ASSIGNED_STATUSES } });
    if (ride?.driverId) io.to(`user:${ride.driverId}`).emit('passenger:location', { rideId: String(ride._id), location: fix });
    return { ok: true };
  }
  async function passengerLocationUnavailable(user) {
    requireValue(user.role !== 'driver', 403, 'Passenger account required.');
    await User.updateOne({ _id: user._id }, { $set: { locationAvailable: false } });
    return { ok: true };
  }
  async function availability(user, available) {
    requireValue(user.role === 'driver', 403, 'Driver account required.');
    requireValue(typeof available === 'boolean', 400, 'Choose online or offline.');
    if (available) {
      const current = await User.findById(user._id);
      requireValue(publicUser(current).profileComplete && current.locationAvailable && connected(user._id) && isFreshFix(current.location, clock()), 409, 'Complete your profile and connect with a fresh GPS location.');
      requireValue(!await Ride.exists({ driverId: String(user._id), active: true }), 409, 'Finish your active trip first.');
    }
    await User.updateOne({ _id: user._id }, { $set: { available, ...(!available ? { locationAvailable: false } : {}) } });
    const assigned = await Ride.findOne({ driverId: String(user._id), active: true });
    if (assigned) notifyRide(assigned);
    await tickUnsafe(); notify(user._id); return snapshot(user._id);
  }
  async function disconnect(userId) {
    if (connected(userId)) return;
    await User.updateOne({ _id: userId, role: 'driver' }, { $set: { available: false, locationAvailable: false } });
    const ride = await Ride.findOne({ driverId: String(userId), active: true });
    if (ride) notifyRide(ride);
    await tickUnsafe();
  }
  async function locationUnavailable(user) {
    requireValue(user.role === 'driver', 403, 'Driver account required.');
    await User.updateOne({ _id: user._id }, { $set: { available: false, locationAvailable: false } });
    const ride = await Ride.findOne({ driverId: String(user._id), active: true });
    if (ride) notifyRide(ride);
    await tickUnsafe(); notify(user._id); return { ok: true };
  }
  return { run, view, snapshot, book, action, location, passengerLocation, passengerLocationUnavailable, locationUnavailable, availability, disconnect, notify, tick: () => run(tickUnsafe), connected };
}

module.exports = { createDispatch };
