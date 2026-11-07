const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { createModels } = require('./models');
const { createAuth } = require('./auth');
const { createDispatch } = require('./dispatch');
const { createAdmin, adminAccess, managesDriver } = require('./admin');
const { isStaff } = require('../utils/roles');
const { createChat } = require('./chat');
const { createBrevoMailer } = require('./mailer');
const { createFares } = require('./fares');
const { requireValue, profileFields, publicUser, photoBytes } = require('./policy');
const { SERVICE_AREA_NAME, INDANG_BOUNDARY_SHAPE } = require('../data/indangMap');
const { roundToCentavos } = require('../data/fares');
const SERVICE_AREA_PLACES = require('../assets/places/service-area-places.json');

async function createBackend({ mongoUri = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/indang_trike_db', clock = Date.now, dispatchOptions, sendEmail = createBrevoMailer() } = {}) {
  const connection = await mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const models = createModels(connection);
  await Promise.all(Object.values(models).map((model) => model.init()));
  // Drops the code collections' earlier cleanup index on expiresAt, which let a
  // server clock running behind the database's lose fresh codes.
  await Promise.all([models.EmailCode.syncIndexes(), models.ResetCode.syncIndexes()]);
  // Drivers stay online across a restart; their positions count again once their apps reconnect.
  await models.User.updateMany({ role: 'driver' }, { $set: { locationAvailable: false } });
  const app = express(), server = createServer(app);
  const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' }, maxHttpBufferSize: 20000 });
  const presence = new Map(), auth = createAuth(models, clock, { sendEmail });
  // The fares in force: the taripa with the amounts changed in God view.
  const fares = createFares({ models });
  await fares.load();
  const dispatch = createDispatch({ models, io, clock, presence, fares, options: dispatchOptions });
  const admin = createAdmin({ models, presence, clock, sendEmail,
    onSuspended: (id, reason) => dispatch.run(() => dispatch.suspended(id, reason)), onApproved: (id) => dispatch.notify(id),
    onCancelTrip: (id, reason) => dispatch.run(() => dispatch.adminCancel(id, reason)) });
  const chat = createChat({ models, io, clock });
  app.disable('x-powered-by');
  // The God view website (web/god-view) is hosted separately and calls this
  // API cross-origin with a bearer token; CORS_ORIGIN can restrict callers.
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  // A profile picture is the one larger body (policy.js MAX_PHOTO_BYTES, in base64).
  app.use('/api/me/photo', express.json({ limit: '256kb' }));
  app.use(express.json({ limit: '32kb' }));
  const attempts = new Map();
  app.use(['/api/register', '/api/login', '/api/password'], (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}:${String(req.body?.phone).slice(0, 30)}`;
    const previous = attempts.get(key), entry = previous && previous.until > clock() ? previous : { count: 0, until: clock() + 300000 };
    entry.count += 1; attempts.set(key, entry);
    if (attempts.size > 10000) for (const [id, value] of attempts) { if (value.until <= clock()) attempts.delete(id); }
    if (entry.count > 15) return res.status(429).json({ error: 'Too many attempts. Try again in five minutes.' });
    next();
  });
  // serviceArea shows which municipality a deployed server accepts bookings in.
  app.get('/api/health', (req, res) => res.status(connection.readyState === 1 ? 200 : 503).json({ ok: connection.readyState === 1, serviceArea: SERVICE_AREA_NAME }));
  // Signing up takes two calls: the form gets an emailed code, then the form
  // with that code creates the account.
  app.post('/api/register/code', async (req, res) => res.json(await auth.sendSignupCode(req.body)));
  app.post('/api/register', async (req, res) => {
    const user = await auth.register(req.body);
    res.status(201).json({ user, message: user.pendingApproval
      ? "Your driver account was created. An admin will check your details against your TODA's list of registered drivers before you can take bookings."
      : 'Account created successfully.' });
  });
  app.post('/api/login', async (req, res) => res.json(await auth.login(req.body)));
  // Forgot password: email a code, check it, then set the new password with it.
  app.post('/api/password/code', async (req, res) => res.json(await auth.sendResetCode(req.body)));
  app.post('/api/password/verify', async (req, res) => res.json(await auth.checkResetCode(req.body)));
  app.post('/api/password/reset', async (req, res) => res.json(await auth.resetPassword(req.body)));
  app.use('/api', auth.middleware);
  // Staff only (utils/roles.js): a superadmin, or an admin with a TODA.
  app.use('/api/admin', admin.middleware);
  // The app's admin screens (IndangGoAdmin): Dashboard, Accounts, Trips,
  // Account Approval and Driver Review. A superadmin sees everyone; an admin
  // only their TODA's drivers and those drivers' trips. Drivers who sign up
  // wait here for an admin to check them against their TODA's list of
  // registered drivers. God view's Accounts view uses these too.
  app.get('/api/admin/dashboard', async (req, res) => res.json(await admin.dashboard(req.adminAccess)));
  app.get('/api/admin/accounts', async (req, res) => res.json(await admin.accounts(req.adminAccess)));
  app.get('/api/admin/trips', async (req, res) => res.json({ trips: await admin.trips(req.adminAccess) }));
  app.get('/api/admin/approvals', async (req, res) => res.json(await admin.approvals(req.adminAccess)));
  app.get('/api/admin/drivers/:id', async (req, res) => res.json(await admin.driver(req.params.id, req.adminAccess)));
  app.post('/api/admin/drivers/:id/approve', async (req, res) => res.json(await admin.approve(req.params.id, req.adminAccess)));
  app.post('/api/admin/drivers/:id/decline', async (req, res) => res.json(await admin.decline(req.params.id, req.body, req.adminAccess)));
  app.post('/api/admin/drivers/:id/terminate', async (req, res) => res.json(await admin.terminate(req.params.id, req.body, req.adminAccess)));
  app.post('/api/admin/drivers/:id/delete', async (req, res) => res.json(await admin.remove(req.params.id, req.body, req.adminAccess)));
  app.post('/api/admin/drivers/:id/unblock', async (req, res) => res.json(await admin.unblock(req.params.id, req.adminAccess)));
  // Everything below is God view's, for superadmins only; an admin route
  // added after this line is too.
  app.use('/api/admin', admin.superadminsOnly);
  app.get('/api/admin/overview', async (req, res) => res.json(await admin.overview()));
  app.get('/api/admin/rides/:id/messages', async (req, res) => res.json(await chat.transcript(req.params.id)));
  // The service area and the same places layer the app draws (assets/places).
  app.get('/api/admin/map', (req, res) => res.json({ boundary: INDANG_BOUNDARY_SHAPE, places: SERVICE_AREA_PLACES }));
  // God view's TODAs tab: each TODA's drivers, with their ratings.
  app.get('/api/admin/todas', async (req, res) => res.json(await admin.todas()));
  // One account's trip history (God view).
  app.get('/api/admin/accounts/:id', async (req, res) => res.json(await admin.history(req.params.id, req.query.days)));
  // A superadmin cancels a booking or trip that has not ended (God view's trip histories).
  app.post('/api/admin/rides/:id/cancel', async (req, res) => res.json(await admin.cancelTrip(req.params.id, req.body)));
  // Drivers' reports about passengers (God view's Reports tab): upholding one
  // suspends the passenger, longer each time, then disables the account.
  app.get('/api/admin/reports', async (req, res) => res.json(await admin.reports()));
  app.post('/api/admin/reports/:id/uphold', async (req, res) => res.json(await admin.uphold(req.params.id, req.user)));
  app.post('/api/admin/reports/:id/dismiss', async (req, res) => res.json(await admin.dismiss(req.params.id, req.user)));
  // God view's Fares tab: each TODA's fares, which a superadmin changes when
  // the fares change. New bookings are charged the saved fares at once.
  app.get('/api/admin/fares', async (req, res) => res.json(await fares.sheet()));
  app.post('/api/admin/fares', async (req, res) => res.json(await fares.update(req.body, req.user)));
  // Staff accounts oversee the service; they do not book, drive or chat on trips.
  app.use(['/api/rides', '/api/driver', '/api/passenger'], (req, res, next) => {
    requireValue(!isStaff(req.user.role), 403, 'Admin accounts cannot book or drive.');
    next();
  });
  // fares: what the app quotes with (data/fares.js quoteTrip's prices), and
  // their revision, which /api/state also names so the app knows when to
  // fetch them again.
  app.get('/api/config', (req, res) => {
    const { prices, revision } = fares.current();
    res.json({ fare: prices.flat, currency: 'PHP', maxPassengers: 4, gpsMaxAgeMs: 30000, fares: { revision, prices } });
  });
  app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.patch('/api/me', async (req, res) => {
    const user = await dispatch.run(async () => {
      if (req.user.role === 'driver') requireValue(!await models.Ride.exists({ active: true, driverSlot: String(req.user._id) }), 409, 'Finish or decline your trip before editing vehicle details.');
      return models.User.findByIdAndUpdate(req.user._id, { $set: profileFields(req.body, req.user.role || 'passenger', req.user) }, { returnDocument: 'after', runValidators: true });
    });
    dispatch.notify(req.user._id); res.json({ user: publicUser(user) });
  });
  // Sets the profile picture, or removes it with { photo: null }.
  app.put('/api/me/photo', async (req, res) => {
    const update = req.body?.photo === null
      ? { $unset: { photo: 1, photoAt: 1 } }
      : { $set: { photo: photoBytes(req.body?.photo), photoAt: new Date(clock()) } };
    const user = await models.User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after' });
    dispatch.notify(req.user._id); res.json({ user: publicUser(user) });
  });
  // A profile picture is shown to its owner, to superadmins, to an admin for
  // their TODA's drivers, and to the other person on a trip they share or a
  // booking a driver can see; to no one else.
  app.get('/api/users/:id/photo', async (req, res) => {
    const id = req.params.id, me = String(req.user._id), access = adminAccess(req.user);
    requireValue(/^[a-f0-9]{24}$/i.test(id), 404, 'No photo.');
    const managed = async () => managesDriver(access, await models.User.findOne({ _id: id, role: 'driver' }).select('toda').lean());
    const allowed = id === me || access?.superadmin || (access && await managed()) || await models.Ride.exists({ $or: [
      { passengerId: me, $or: [{ driverId: id }, { driverSlot: id }] },
      { passengerId: id, $or: [{ driverId: me }, { driverSlot: me }] },
      ...(req.user.role === 'driver' ? [{ passengerId: id, status: 'searching', active: true }] : []),
    ] });
    requireValue(allowed, 404, 'No photo.');
    const user = await models.User.findById(id).select('+photo');
    requireValue(user?.photo?.length, 404, 'No photo.');
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }).send(user.photo);
  });
  app.get('/api/state', async (req, res) => {
    await dispatch.tick();
    const state = await chat.addUnread(await dispatch.snapshot(req.user._id), req.user._id);
    res.json({ ...state, fareRevision: fares.current().revision });
  });
  app.post('/api/logout', async (req, res) => {
    await models.Session.deleteOne({ _id: req.session._id });
    io.in(`session:${req.session._id}`).disconnectSockets(true);
    await dispatch.run(() => dispatch.disconnect(req.user._id, { offline: true }));
    res.json({ ok: true });
  });
  app.post('/api/driver/location', async (req, res) => res.json(await dispatch.run(() => dispatch.location(req.user, req.body))));
  app.post('/api/passenger/location', async (req, res) => res.json(await dispatch.run(() => dispatch.passengerLocation(req.user, req.body))));
  app.post('/api/passenger/location/unavailable', async (req, res) => res.json(await dispatch.run(() => dispatch.passengerLocationUnavailable(req.user))));
  app.post('/api/driver/location/unavailable', async (req, res) => res.json(await dispatch.run(() => dispatch.locationUnavailable(req.user))));
  app.get('/api/driver/bookings', async (req, res) => res.json(await dispatch.run(() => dispatch.bookings(req.user))));
  app.post('/api/driver/availability', async (req, res) => res.json(await dispatch.run(() => dispatch.availability(req.user, req.body.available))));
  app.post('/api/rides', async (req, res) => {
    const result = await dispatch.run(() => dispatch.book(req.user, req.body));
    res.status(result.reused ? 200 : 201).json(result);
  });
  // Before the generic action route, which would otherwise take "rating", "report" and "messages".
  app.post('/api/rides/:id/rating', async (req, res) => res.json(await dispatch.run(() => dispatch.rate(req.user, req.params.id, req.body))));
  app.post('/api/rides/:id/report', async (req, res) => res.json(await dispatch.run(() => dispatch.report(req.user, req.params.id, req.body))));
  app.get('/api/rides/:id/messages', async (req, res) => res.json(await chat.list(req.user, req.params.id)));
  app.post('/api/rides/:id/messages', async (req, res) => res.json(await chat.send(req.user, req.params.id, req.body)));
  app.post('/api/rides/:id/messages/read', async (req, res) => res.json(await chat.markRead(req.user, req.params.id)));
  app.post('/api/rides/:id/:action', async (req, res) => res.json(await dispatch.run(() => dispatch.action(req.user, req.params.id, req.params.action, req.body))));
  app.get('/api/history', async (req, res) => {
    const filter = req.user.role === 'driver' ? { driverId: String(req.user._id) } : { passengerId: String(req.user._id) };
    const rides = await models.Ride.find({ ...filter, active: false }).sort({ createdAt: -1 }).limit(100);
    // The viewer's ratings for the whole list in one query.
    const given = await models.Rating.find({ rideId: { $in: rides.map((ride) => String(ride._id)) }, raterId: String(req.user._id) });
    const ratings = new Map(given.map((rating) => [rating.rideId, rating]));
    // A driver's past trips show only the trip, never who the passenger was.
    const driver = req.user.role === 'driver';
    res.json({ rides: await Promise.all(rides.map(async (ride) => {
      const view = await dispatch.view(ride, req.user._id, false, ratings);
      if (driver) delete view.passenger;
      return view;
    })) });
  });
  app.get('/api/stats', async (req, res) => {
    const identity = req.user.role === 'driver' ? { driverId: String(req.user._id) } : { passengerId: String(req.user._id) };
    const today = new Date(clock() + 8 * 3600000).toISOString().slice(0, 10);
    const start = new Date(`${today}T00:00:00+08:00`);
    const [totals] = await models.Ride.aggregate([
      { $match: { ...identity, status: 'completed' } },
      { $group: { _id: null, trips: { $sum: 1 }, totalFare: { $sum: '$fare' },
        todayTrips: { $sum: { $cond: [{ $gte: ['$completedAt', start] }, 1, 0] } },
        todayFare: { $sum: { $cond: [{ $gte: ['$completedAt', start] }, '$fare', 0] } } } },
    ]);
    // Fares may have centavos, so their sums are rounded to the centavo.
    res.json(totals ? { trips: totals.trips, totalFare: roundToCentavos(totals.totalFare), todayTrips: totals.todayTrips, todayFare: roundToCentavos(totals.todayFare) }
      : { trips: 0, totalFare: 0, todayTrips: 0, todayFare: 0 });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.name === 'ValidationError' ? 400 : 500);
    if (status >= 500) console.error('API request failed:', error.message);
    res.status(status).json({ error: status >= 500 ? 'The service is temporarily unavailable. Please retry.' : error.message });
  });
  io.use(async (socket, next) => {
    try { socket.identity = await auth.authenticate(socket.handshake.auth?.token); next(); }
    catch { next(new Error('Your session has expired. Please log in again.')); }
  });
  io.on('connection', (socket) => {
    const { user, session } = socket.identity, id = String(user._id);
    if (!presence.has(id)) presence.set(id, new Set());
    presence.get(id).add(socket.id);
    socket.join(`user:${id}`); socket.join(`session:${session._id}`);
    if (user.role === 'driver') socket.join('drivers');
    // No client-controlled room subscription or unauthenticated trip-write event.
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, +session.expiresAt - clock()));
    expiry.unref();
    socket.emit('state:changed');
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      presence.get(id)?.delete(socket.id);
      if (!presence.get(id)?.size) presence.delete(id);
      dispatch.run(() => dispatch.disconnect(id)).catch((error) => console.error('Disconnect reconciliation failed:', error.message));
    });
  });
  await dispatch.tick();
  const timer = setInterval(() => dispatch.tick().catch((error) => console.error('Dispatch reconciliation failed:', error.message)), 1000);
  timer.unref();
  async function close() {
    clearInterval(timer);
    await new Promise((resolve) => io.close(resolve));
    await dispatch.run(async () => {});
    await connection.close();
  }
  return { app, server, io, models, dispatch, close };
}

module.exports = { createBackend };
