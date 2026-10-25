const { randomUUID } = require('node:crypto');
const { ASSIGNED_STATUSES, GPS_MAX_AGE_MS, isFreshFix, rankDrivers, validateFix, nextRideStatus } = require('../utils/rideState');
const { getMunicipalityAt } = require('../data/indangMap');
const { findToda, todaCovers, todaName } = require('../data/todaZones');
const { HttpError, requireValue, publicUser, bookingFields, cleanText, awaitingApproval, AWAITING_APPROVAL } = require('./policy');
const { ratingSummary, validateRating } = require('../utils/rating');
const { censorText } = require('../utils/profanity');
const { REPORTABLE_STATUSES, validateReport } = require('../utils/reports');
const { haversineDistance } = require('../utils/pathfinding');

function createDispatch({ models, io, clock, presence, options = {} }) {
  const { User, Ride, Rating, Report } = models;
  const offerMs = options.offerMs ?? 20000, searchMs = options.searchMs ?? 120000;
  let tail = Promise.resolve();
  // Ordered writes plus database uniqueness protect the single-server deployment.
  function run(work) { const result = tail.then(work); tail = result.catch(() => {}); return result; }
  const connected = (id) => Boolean(presence.get(String(id))?.size);
  function notify(...ids) { for (const id of new Set(ids.filter(Boolean).map(String))) io.to(`user:${id}`).emit('state:changed'); }
  function notifyRide(ride) { notify(ride.passengerId, ride.driverId, ride.driverSlot); }
  // `ratings`, when given, holds the viewer's ratings by ride id, looked up
  // once for a whole list (see history) instead of once per ride.
  async function view(ride, viewerId, offered = false, ratings) {
    if (!ride) return null;
    const result = ride.toObject ? ride.toObject() : { ...ride };
    // Passengers rate their driver; drivers report a passenger instead.
    const asDriver = Boolean(viewerId) && result.driverId === String(viewerId);
    const rated = result.status === 'completed' && viewerId && !asDriver;
    const reportable = asDriver && REPORTABLE_STATUSES.includes(result.status);
    const [driver, passenger, myRating, myReport] = await Promise.all([result.driverId ? User.findById(result.driverId) : null, User.findById(result.passengerId),
      !rated ? null : ratings ? ratings.get(String(result._id)) ?? null : Rating.findOne({ rideId: String(result._id), raterId: String(viewerId) }),
      reportable ? Report.findOne({ rideId: String(result._id), reporterId: String(viewerId) }) : null]);
    // Each side sees the other's average rating: the driver on the offer, the
    // passenger once a driver is assigned.
    const contact = (user, allowPhone) => user ? {
      id: String(user._id), firstName: user.firstName || '', lastName: user.lastName || '', rating: ratingSummary(user),
      ...(allowPhone ? { phone: user.phone } : {}),
      ...(user.role === 'driver' ? { plate: user.plate, toda: todaName(user.toda), capacity: user.capacity } : {}),
    } : null;
    const assigned = ASSIGNED_STATUSES.includes(result.status);
    // Only a fix that was still fresh when the driver accepted belongs to this ride,
    // never one left over from an earlier trip.
    const passengerLocation = assigned && passenger?.location && passenger.location.timestamp >= +result.acceptedAt - GPS_MAX_AGE_MS
      ? passenger.location : null;
    return {
      id: String(result._id), status: result.status, version: result.version, trip: result.trip, route: result.route,
      passengers: result.passengers, note: result.note, fare: result.fare, fareDetails: result.fareDetails ?? null,
      driver: contact(driver, assigned), passenger: contact(passenger, assigned),
      driverLocation: assigned && driver?.location ? driver.location : null,
      driverConnected: assigned && driver ? connected(driver._id) : false,
      driverLocationAvailable: Boolean(assigned && driver?.locationAvailable && isFreshFix(driver.location, clock())),
      passengerLocation,
      // The viewer's own rating of the other participant, once given.
      myRating: myRating ? { stars: myRating.stars, tags: myRating.tags, comment: myRating.comment } : null,
      // The driver's report about the passenger, once sent; reportable says one can be.
      ...(reportable ? { reportable: true, myReport: myReport ? { reason: myReport.reason, details: myReport.details, status: myReport.status } : null } : {}),
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
  // Whether a driver may pick up a ride at all. Drivers share GPS from
  // anywhere, but only those in the pickup's town get it: the towns' roads do
  // not connect. An Indang TODA's drivers pick up only inside its barangays;
  // the drop-off may be anywhere in town. A driver still waiting for an
  // admin's approval, or one an admin suspended, gets nothing.
  function inScope(user, ride) {
    const town = getMunicipalityAt(ride.trip.pickup.coordinate), toda = findToda(user.toda);
    return Boolean(!awaitingApproval(user) && !user.disabled && publicUser(user).profileComplete && user.locationAvailable && user.location && town &&
      getMunicipalityAt(user.location) === town && (!toda || todaCovers(toda, ride.trip.pickup.coordinate)));
  }
  // Every booking still looking for a driver that this driver could take,
  // nearest pickup first, whoever it is being offered to right now.
  async function bookings(user) {
    requireValue(user.role === 'driver', 403, 'Driver account required.');
    const current = await User.findById(user._id), id = String(user._id);
    const searches = await Ride.find({ status: 'searching', active: true, searchExpiresAt: { $gt: new Date(clock()) } });
    const open = searches.filter((ride) => inScope(current, ride) && (current.capacity ?? 4) >= ride.passengers);
    const listed = await Promise.all(open.map(async (ride) => ({
      ...await view(ride, id, true),
      distanceMeters: Math.round(haversineDistance(current.location, ride.trip.pickup.coordinate)),
    })));
    return { bookings: listed.sort((a, b) => a.distanceMeters - b.distanceMeters || String(a.id).localeCompare(String(b.id))), serverTime: clock() };
  }
  // A driver takes a booking from the list. It is theirs if it is still
  // searching, even while it is offered to someone else; an offer this driver
  // holds for another booking is given back first.
  async function claim(user, ride) {
    const userId = String(user._id);
    requireValue(user.role === 'driver', 403, 'Driver account required.');
    if (ride.driverId === userId && ride.status === 'accepted') return { ride: await view(ride, userId) };
    requireValue(ride.active && ride.status === 'searching' && +ride.searchExpiresAt > clock(), 409, 'This booking is no longer available.');
    const current = await User.findById(user._id);
    requireValue(!awaitingApproval(current), 403, AWAITING_APPROVAL);
    requireValue(current.available && current.locationAvailable && connected(userId) && isFreshFix(current.location, clock()), 409, 'Reconnect with a fresh GPS location before accepting.');
    requireValue(inScope(current, ride), 409, 'This pickup is outside your area.');
    requireValue((current.capacity ?? 4) >= ride.passengers, 409, 'Your trike has too few seats for this booking.');
    requireValue(!await Ride.exists({ driverId: userId, active: true }), 409, 'Finish your active trip first.');
    const held = await Ride.findOne({ active: true, status: 'searching', driverSlot: userId, _id: { $ne: ride._id } });
    if (held) await release(held);
    let updated;
    try {
      updated = await Ride.findOneAndUpdate({ _id: ride._id, version: ride.version, status: 'searching' }, {
        $set: { status: 'accepted', acceptedAt: new Date(clock()), driverId: userId, driverSlot: userId },
        $unset: { offerId: 1, offerExpiresAt: 1 }, $addToSet: { attemptedDrivers: userId }, $inc: { version: 1 },
      }, { returnDocument: 'after' });
    } catch (error) { if (error.code === 11000) throw new HttpError(409, 'Finish or decline your current request first.'); throw error; }
    requireValue(updated, 409, 'Another driver just took this booking.');
    notifyRide(ride); notifyRide(updated); bookingsChanged(); await tickUnsafe();
    return { ride: await view(updated, userId) };
  }
  // Drivers' booking lists reload when a booking appears or stops searching.
  function bookingsChanged() { io.to('drivers').emit('bookings:changed'); }
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
        if (expired) { notifyRide(ride); bookingsChanged(); }
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
      const town = getMunicipalityAt(ride.trip.pickup.coordinate);
      const candidates = rankDrivers(users.filter((user) => inScope(user, ride) && !ride.attemptedDrivers.includes(String(user._id)))
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
    // Offensive words in the pickup note are hidden before the driver sees it.
    const fields = bookingFields(body, clock()), note = censorText(fields.note);
    try { ride = await Ride.create({ ...fields, note: note.text, passengerId: String(user._id), searchExpiresAt: new Date(clock() + searchMs) }); }
    catch (error) { if (error.code === 11000) throw new HttpError(409, 'You already have an active booking.'); throw error; }
    await tickUnsafe(); notify(user._id); bookingsChanged();
    if (note.censored) await warnLanguage(user._id);
    return { ride: await view(await Ride.findById(ride._id), user._id), reused: false, ...(note.censored ? { censored: true } : {}) };
  }
  async function action(user, id, actionName, body = {}) {
    requireValue(/^[a-f0-9]{24}$/.test(id), 404, 'Ride not found.');
    await tickUnsafe();
    const ride = await Ride.findById(id), userId = String(user._id);
    requireValue(ride, 404, 'Ride not found.');
    if (actionName === 'claim') return claim(user, ride);
    if (['accept', 'decline'].includes(actionName)) {
      requireValue(user.role === 'driver', 403, 'Only the offered driver can respond.');
      if (actionName === 'accept' && ride.driverId === userId && ride.status === 'accepted') return { ride: await view(ride, userId) };
      requireValue(ride.status === 'searching' && ride.driverSlot === userId && ride.offerId === body.offerId && +ride.offerExpiresAt > clock(), 409, 'This offer is no longer available.');
      const currentUser = await User.findById(user._id);
      if (actionName === 'accept') requireValue(!awaitingApproval(currentUser), 403, AWAITING_APPROVAL);
      requireValue(currentUser.available && currentUser.locationAvailable && connected(userId) && isFreshFix(currentUser.location, clock()), 409, 'Reconnect with a fresh GPS location before accepting.');
      if (actionName === 'decline') { await release(ride); await tickUnsafe(); return { ride: null, state: await snapshot(userId) }; }
    } else {
      requireValue(ride.passengerId === userId || ride.driverId === userId, 403, 'You are not a participant in this ride.');
      if (actionName !== 'cancel') requireValue(ride.driverId === userId && user.role === 'driver', 403, 'Only the assigned driver can update this trip.');
    }
    const completedAction = { arrive: 'arrived', start: 'in_progress', complete: 'completed', cancel: 'cancelled', accept: 'accepted' }[actionName];
    if (ride.status === completedAction) return { ride: await view(ride, userId) };
    let status;
    // The TODA tester can also cancel a trip already under way, to free
    // themselves for the next test ride.
    if (actionName === 'cancel' && ride.status === 'in_progress' && user.todaTester && ride.driverId === userId) status = 'cancelled';
    else try { status = nextRideStatus(ride.status, actionName, user.role || 'passenger'); } catch (error) { throw new HttpError(409, error.message); }
    const set = { status }, unset = {};
    set[{ accept: 'acceptedAt', arrive: 'arrivedAt', start: 'startedAt', complete: 'completedAt', cancel: 'cancelledAt' }[actionName]] = new Date(clock());
    if (actionName === 'accept') { set.driverId = userId; unset.offerId = 1; unset.offerExpiresAt = 1; }
    if (['completed', 'cancelled'].includes(status)) { set.active = false; unset.driverSlot = 1; unset.offerId = 1; unset.offerExpiresAt = 1; }
    if (actionName === 'cancel') { set.cancelledBy = userId; set.cancellationReason = cleanText(body.reason, 200) || 'Cancelled by participant'; }
    const updated = await Ride.findOneAndUpdate({ _id: id, version: ride.version, status: ride.status }, {
      $set: set, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}),
    }, { returnDocument: 'after' });
    requireValue(updated, 409, 'The trip changed. Refresh and try again.');
    notifyRide(ride); notifyRide(updated); if (ride.status === 'searching') bookingsChanged(); await tickUnsafe();
    return { ride: await view(updated, userId) };
  }
  // Offensive words were hidden from what this user sent: one more warning on
  // their account, which admins see.
  const warnLanguage = (userId) => User.updateOne({ _id: userId }, { $inc: { languageWarnings: 1 } });
  // The passenger rates the driver, once, after the ride is completed.
  async function rate(user, id, body = {}) {
    requireValue(/^[a-f0-9]{24}$/.test(id), 404, 'Ride not found.');
    const ride = await Ride.findById(id), userId = String(user._id);
    requireValue(ride, 404, 'Ride not found.');
    const asPassenger = ride.passengerId === userId, asDriver = ride.driverId === userId;
    requireValue(asPassenger || asDriver, 403, 'You are not a participant in this ride.');
    requireValue(asPassenger, 403, 'Drivers report passengers instead of rating them.');
    requireValue(ride.status === 'completed', 409, 'You can rate a ride once it is completed.');
    let fields;
    try { fields = validateRating(body, asPassenger ? 'driver' : 'passenger'); } catch (error) { throw new HttpError(400, error.message); }
    const comment = censorText(cleanText(fields.comment, 200));
    const rateeId = asPassenger ? ride.driverId : ride.passengerId;
    try {
      await Rating.create({ ...fields, rideId: String(ride._id), raterId: userId, rateeId, raterRole: asPassenger ? 'passenger' : 'driver', comment: comment.text });
    } catch (error) { if (error.code === 11000) throw new HttpError(409, 'You already rated this ride.'); throw error; }
    // The average comes from these running totals. If they cannot be updated,
    // the rating is taken back so the rater can simply try again.
    try { await User.updateOne({ _id: rateeId }, { $inc: { ratingSum: fields.stars, ratingCount: 1 } }); }
    catch (error) { await Rating.deleteOne({ rideId: String(ride._id), raterId: userId }).catch(() => {}); throw error; }
    notify(userId);
    if (comment.censored) await warnLanguage(userId);
    return { ride: await view(ride, userId), ...(comment.censored ? { censored: true } : {}) };
  }
  // An account an admin cut off: a suspended passenger, or a driver who was
  // suspended or deleted. A request offered to the driver goes to the next
  // one; their active booking or trip is cancelled with `reason`; their app is
  // cut off at once.
  async function suspended(userId, reason = 'Passenger account suspended') {
    const id = String(userId);
    await User.updateOne({ _id: id, role: 'driver' }, { $set: { available: false, locationAvailable: false } });
    const offered = await Ride.findOne({ active: true, status: 'searching', driverSlot: id });
    if (offered) await release(offered);
    const ride = await Ride.findOne({ active: true, $or: [{ passengerId: id }, { driverId: id }] });
    if (ride) {
      const ended = await Ride.findOneAndUpdate({ _id: ride._id, version: ride.version }, {
        $set: { status: 'cancelled', active: false, cancelledAt: new Date(clock()), cancelledBy: 'admin', cancellationReason: reason },
        $unset: { driverSlot: 1, offerId: 1, offerExpiresAt: 1 }, $inc: { version: 1 },
      }, { returnDocument: 'after' });
      if (ended) { notifyRide(ride); if (ride.status === 'searching') bookingsChanged(); }
    }
    io.in(`user:${id}`).disconnectSockets(true);
    await tickUnsafe();
  }
  // The driver reports the passenger of a trip they were assigned to, once,
  // after it was completed or cancelled. Admins review it in God view.
  async function report(user, id, body = {}) {
    requireValue(/^[a-f0-9]{24}$/.test(id), 404, 'Ride not found.');
    const ride = await Ride.findById(id), userId = String(user._id);
    requireValue(ride, 404, 'Ride not found.');
    requireValue(user.role === 'driver' && ride.driverId === userId, 403, 'Only the driver of this trip can report its passenger.');
    requireValue(REPORTABLE_STATUSES.includes(ride.status), 409, 'You can report a passenger once the trip is completed or cancelled.');
    let fields;
    try { fields = validateReport(body); } catch (error) { throw new HttpError(400, error.message); }
    try { await Report.create({ ...fields, rideId: String(ride._id), reporterId: userId, passengerId: ride.passengerId }); }
    catch (error) { if (error.code === 11000) throw new HttpError(409, 'You already reported this trip.'); throw error; }
    notify(userId);
    return { ride: await view(ride, userId) };
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
      requireValue(!awaitingApproval(current), 403, AWAITING_APPROVAL);
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
  return { run, view, snapshot, bookings, book, action, rate, report, suspended, location, passengerLocation, passengerLocationUnavailable, locationUnavailable, availability, disconnect, notify, tick: () => run(tickUnsafe), connected };
}

module.exports = { createDispatch };
