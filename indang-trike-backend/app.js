const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { createModels } = require('./models');
const { createAuth } = require('./auth');
const { createDispatch } = require('./dispatch');
const { createAdmin } = require('./admin');
const { requireValue, profileFields, publicUser } = require('./policy');
const { SERVICE_AREA_NAME, INDANG_BOUNDARY_SHAPE } = require('../data/indangMap');

async function createBackend({ mongoUri = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/indang_trike_db', clock = Date.now, dispatchOptions, adminPhones = process.env.GOD_VIEW_ADMIN_PHONES || '' } = {}) {
  const connection = await mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const models = createModels(connection);
  await Promise.all(Object.values(models).map((model) => model.init()));
  await models.User.updateMany({ role: 'driver' }, { $set: { available: false, locationAvailable: false } });
  const app = express(), server = createServer(app);
  const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' }, maxHttpBufferSize: 20000 });
  const presence = new Map(), auth = createAuth(models, clock);
  const dispatch = createDispatch({ models, io, clock, presence, options: dispatchOptions });
  const admin = createAdmin({ models, presence, clock, adminPhones });
  app.disable('x-powered-by');
  // The God view website (web/god-view) is hosted separately and calls this
  // API cross-origin with a bearer token; CORS_ORIGIN can restrict callers.
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '32kb' }));
  const attempts = new Map();
  app.use(['/api/register', '/api/login'], (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}:${String(req.body?.phone).slice(0, 30)}`;
    const previous = attempts.get(key), entry = previous && previous.until > clock() ? previous : { count: 0, until: clock() + 300000 };
    entry.count += 1; attempts.set(key, entry);
    if (attempts.size > 10000) for (const [id, value] of attempts) { if (value.until <= clock()) attempts.delete(id); }
    if (entry.count > 15) return res.status(429).json({ error: 'Too many attempts. Try again in five minutes.' });
    next();
  });
  // serviceArea shows which municipality a deployed server accepts bookings in.
  app.get('/api/health', (req, res) => res.status(connection.readyState === 1 ? 200 : 503).json({ ok: connection.readyState === 1, serviceArea: SERVICE_AREA_NAME }));
  app.post('/api/register', async (req, res) => res.status(201).json({ user: await auth.register(req.body), message: 'Account created successfully.' }));
  app.post('/api/login', async (req, res) => res.json(await auth.login(req.body)));
  app.use('/api', auth.middleware);
  app.use('/api/admin', admin.middleware);
  app.get('/api/admin/overview', async (req, res) => res.json(await admin.overview()));
  app.get('/api/admin/map', (req, res) => res.json({ boundary: INDANG_BOUNDARY_SHAPE }));
  app.get('/api/config', (req, res) => res.json({ fare: 45, currency: 'PHP', maxPassengers: 4, gpsMaxAgeMs: 30000 }));
  app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.patch('/api/me', async (req, res) => {
    const user = await dispatch.run(async () => {
      if (req.user.role === 'driver') requireValue(!await models.Ride.exists({ active: true, driverSlot: String(req.user._id) }), 409, 'Finish or decline your trip before editing vehicle details.');
      return models.User.findByIdAndUpdate(req.user._id, { $set: profileFields(req.body, req.user.role || 'passenger') }, { returnDocument: 'after', runValidators: true });
    });
    dispatch.notify(req.user._id); res.json({ user: publicUser(user) });
  });
  app.get('/api/state', async (req, res) => { await dispatch.tick(); res.json(await dispatch.snapshot(req.user._id)); });
  app.post('/api/logout', async (req, res) => {
    await models.Session.deleteOne({ _id: req.session._id });
    io.in(`session:${req.session._id}`).disconnectSockets(true);
    await dispatch.run(() => dispatch.disconnect(req.user._id));
    res.json({ ok: true });
  });
  app.post('/api/driver/location', async (req, res) => res.json(await dispatch.run(() => dispatch.location(req.user, req.body))));
  app.post('/api/passenger/location', async (req, res) => res.json(await dispatch.run(() => dispatch.passengerLocation(req.user, req.body))));
  app.post('/api/passenger/location/unavailable', async (req, res) => res.json(await dispatch.run(() => dispatch.passengerLocationUnavailable(req.user))));
  app.post('/api/driver/location/unavailable', async (req, res) => res.json(await dispatch.run(() => dispatch.locationUnavailable(req.user))));
  app.post('/api/driver/availability', async (req, res) => res.json(await dispatch.run(() => dispatch.availability(req.user, req.body.available))));
  app.post('/api/rides', async (req, res) => {
    const result = await dispatch.run(() => dispatch.book(req.user, req.body));
    res.status(result.reused ? 200 : 201).json(result);
  });
  app.post('/api/rides/:id/:action', async (req, res) => res.json(await dispatch.run(() => dispatch.action(req.user, req.params.id, req.params.action, req.body))));
  app.get('/api/history', async (req, res) => {
    const filter = req.user.role === 'driver' ? { driverId: String(req.user._id) } : { passengerId: String(req.user._id) };
    const rides = await models.Ride.find({ ...filter, active: false }).sort({ createdAt: -1 }).limit(100);
    res.json({ rides: await Promise.all(rides.map((ride) => dispatch.view(ride, req.user._id))) });
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
    res.json(totals ? { trips: totals.trips, totalFare: totals.totalFare, todayTrips: totals.todayTrips, todayFare: totals.todayFare } : { trips: 0, totalFare: 0, todayTrips: 0, todayFare: 0 });
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
