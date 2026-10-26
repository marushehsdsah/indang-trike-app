const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { io } = require('socket.io-client');
const { createBackend } = require('../indang-trike-backend/app');
const { ADMIN_CANCELLATION } = require('../indang-trike-backend/admin');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { quoteTrip } = require('../data/fares');
const { SEND_LIMIT, SEND_WINDOW_MS } = require('../indang-trike-backend/chat');
const { MAX_MESSAGES_PER_RIDE, MESSAGE_RETENTION_DAYS } = require('../utils/chat');
const bcrypt = createRequire(require.resolve('../indang-trike-backend/package.json'))('bcryptjs');

let backend, base, sequence = 1000000;
let now = Date.now();
const sockets = [];
// Atlas allows database names of at most 38 bytes.
const dbName = `indang_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const adminPhone = '09179999999';
// Stands in for Brevo: the last code emailed to each address, and every
// notice to a driver about an admin's decision.
const emailedCodes = new Map(), notices = [];
const sendEmail = async ({ to, code, ...notice }) => { if (code) emailedCodes.set(to, code); else notices.push({ to, ...notice }); };
const fix = (latitude = 14.197805) => ({ latitude, longitude: 120.881639, accuracy: 5, timestamp: now, speed: 0, heading: 0 });

before(async () => {
  const mongoRoot = process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017';
  backend = await createBackend({ mongoUri: `${mongoRoot}/${dbName}`, clock: () => now, adminPhones: adminPhone, sendEmail });
  await new Promise((resolve) => backend.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${backend.server.address().port}`;
});
after(async () => {
  sockets.forEach((socket) => socket.disconnect());
  if (backend) {
    // Only the unique database created by this test may be dropped.
    assert.equal(backend.models.User.db.name, dbName);
    await backend.models.User.db.dropDatabase();
    await backend.close();
  }
});

async function request(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
// Signs up the way the app does: the form gets an emailed code, then the form with the code.
async function signup(body) {
  const sent = await request('/register/code', null, body);
  if (sent.status !== 200) return sent;
  return request('/register', null, { ...body, code: emailedCodes.get(body.email) });
}
// A driver is approved as if an admin did it, unless `approved` is false.
async function account(role = 'passenger', phoneOverride, { approved = true } = {}) {
  const phone = phoneOverride || `0917${sequence++}`;
  const result = await signup({
    phone, password: 'strong-password', firstName: 'Test', lastName: role, email: `${phone}@example.com`, role,
    ...(role === 'driver' ? { plate: `TEST-${sequence}`, toda: 'Test TODA', capacity: 4 } : {}),
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  if (role === 'driver' && approved) await approve(result.body.user.id);
  const login = await request('/login', null, { phone, password: 'strong-password' });
  assert.equal(login.status, 200);
  return login.body;
}
const approve = (id) => backend.models.User.updateOne({ _id: id }, { $set: { approval: 'approved' } });
async function connect(token) {
  const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
async function online(driver, latitude) {
  await connect(driver.token);
  assert.equal((await request('/driver/location', driver.token, fix(latitude))).status, 200);
  const response = await request('/driver/availability', driver.token, { available: true });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}
async function book(passenger, key = randomUUID()) {
  return request('/rides', passenger.token, { trip: DEFAULT_TRIP, passengers: 1, note: 'Near gate', idempotencyKey: key });
}
async function state(accountValue) { return (await request('/state', accountValue.token)).body; }
async function action(accountValue, rideId, name, body = {}) { return request(`/rides/${rideId}/${name}`, accountValue.token, body); }

test('health reports the database and the service area bookings are accepted in', async () => {
  assert.deepEqual(await request('/health'), { status: 200, body: { ok: true, serviceArea: 'Indang' } });
});

test('the separate God view website may call the API, but every overview needs admin authorization', async () => {
  // The dashboard is its own website (web/god-view); the API no longer serves it.
  assert.equal((await fetch(`${base}/god-view/`)).status, 404);
  const preflight = await fetch(`${base}/api/admin/overview`, { method: 'OPTIONS', headers: {
    Origin: 'https://god-view.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
  assert.equal((await request('/admin/overview')).status, 401);
  const ordinary = await account();
  assert.equal((await request('/admin/overview', ordinary.token)).status, 403);
  const admin = await account('passenger', adminPhone);
  assert.equal((await request('/admin/map', ordinary.token)).status, 403);
  const map = await request('/admin/map', admin.token);
  assert.equal(map.body.boundary.features.length, 1, 'Indang');
  assert.ok(map.body.places.features.length > 400, 'the same establishments and landmarks the app draws');
  const initial = await request('/admin/overview', admin.token);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.users.some(item => item.id === admin.user.id), false, 'dashboard login is not mobile presence');
  const first = await connect(ordinary.token), second = await connect(ordinary.token);
  assert.equal((await request('/passenger/location', ordinary.token, fix())).status, 200);
  const snapshot = (await request('/admin/overview', admin.token)).body;
  const person = snapshot.users.find(item => item.id === ordinary.user.id);
  assert.equal(person.locationStatus, 'live');
  assert.equal(person.location.latitude, fix().latitude);
  assert.equal(Object.hasOwn(person, 'phone'), false);
  assert.equal(Object.hasOwn(person, 'password'), false);
  first.disconnect();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.ok((await request('/admin/overview', admin.token)).body.users.some(item => item.id === ordinary.user.id));
  await request('/passenger/location/unavailable', ordinary.token, {});
  assert.equal((await request('/admin/overview', admin.token)).body.users.find(item => item.id === ordinary.user.id).locationStatus, 'unavailable');
  second.disconnect();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal((await request('/admin/overview', admin.token)).body.users.some(item => item.id === ordinary.user.id), false);
  await request('/logout', admin.token, {});
  assert.equal((await request('/admin/overview', admin.token)).status, 401);
});

test('an admin account added in the database logs in on the app login, may use God view, and cannot ride', async () => {
  const phone = `0917${sequence++}`;
  // As an administrator adds one in Atlas: the password as a bcrypt hash, and role "admin".
  await backend.models.User.collection.insertOne({ phone: `+63${phone.slice(1)}`, password: await bcrypt.hash('strong-password', 10),
    firstName: 'Pilot', lastName: 'Admin', email: `${phone}@example.com`, role: 'admin', createdAt: new Date(now), updatedAt: new Date(now) });
  const login = await request('/login', null, { phone, password: 'strong-password' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const admin = login.body;
  assert.equal(admin.user.role, 'admin');
  assert.equal(admin.user.profileComplete, true);
  assert.equal((await request('/state', admin.token)).status, 200);
  // The app's live link makes the admin present, but admins are not shown among the riders.
  const socket = await connect(admin.token);
  const overview = await request('/admin/overview', admin.token);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.users.some(item => item.id === admin.user.id), false);
  assert.equal((await book(admin)).status, 403);
  assert.equal((await request('/passenger/location', admin.token, fix())).status, 403);
  assert.equal((await request('/driver/availability', admin.token, { available: true })).status, 403);
  socket.disconnect();
  // Sign-up cannot make one.
  const other = `0917${sequence++}`;
  const signupAdmin = await request('/register/code', null, { phone: other, password: 'strong-password', firstName: 'Not', lastName: 'Admin', email: `${other}@example.com`, role: 'admin' });
  assert.equal(signupAdmin.status, 400);
});

test('the admin interface lists the accounts and trips in the database, for admins only', async () => {
  const passenger = await account(), driver = await account('driver');
  // A completed trip, a cancelled one, then one still looking for a driver.
  const socket = await connect(driver.token);
  assert.equal((await request('/driver/location', driver.token, fix())).status, 200);
  assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 200);
  const completed = (await book(passenger)).body.ride;
  assert.equal((await action(driver, completed.id, 'accept', { offerId: (await state(driver)).offer.offerId })).status, 200);
  for (const step of ['arrive', 'start', 'complete']) assert.equal((await action(driver, completed.id, step)).status, 200);
  assert.equal((await request('/driver/availability', driver.token, { available: false })).status, 200);
  const cancelled = (await book(passenger)).body.ride;
  assert.equal((await action(passenger, cancelled.id, 'cancel')).status, 200);
  const searching = (await book(passenger)).body.ride;

  for (const path of ['/admin/dashboard', '/admin/accounts', '/admin/trips']) assert.equal((await request(path, passenger.token)).status, 403, path);
  // The God view test registered the admin earlier in this run.
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  const route = `${DEFAULT_TRIP.pickup.name} → ${DEFAULT_TRIP.dropoff.name}`;
  const trips = (await request('/admin/trips', admin.token)).body.trips;
  assert.deepEqual(trips.slice(0, 3).map(({ key, id, todaId, passenger: rider, driver: assigned, status, route: path }) => ({ key, id, todaId, rider, assigned, status, path })), [
    { key: searching.id, id: `#TR-${searching.id.slice(-6).toUpperCase()}`, todaId: '—', rider: 'Test passenger', assigned: '—', status: 'Ongoing', path: route },
    { key: cancelled.id, id: `#TR-${cancelled.id.slice(-6).toUpperCase()}`, todaId: '—', rider: 'Test passenger', assigned: '—', status: 'Cancelled', path: route },
    { key: completed.id, id: `#TR-${completed.id.slice(-6).toUpperCase()}`, todaId: 'Test TODA', rider: 'Test passenger', assigned: 'Test driver', status: 'Completed', path: route },
  ]);
  assert.ok(Number.isFinite(Date.parse(trips[0].date)));

  const { accounts, total } = (await request('/admin/accounts', admin.token)).body;
  assert.equal(total, accounts.length);
  assert.deepEqual(accounts.find((item) => item.key === passenger.user.id),
    { key: passenger.user.id, id: passenger.user.phone.replace('+63', '0'), name: 'Test passenger', email: passenger.user.email, role: 'PASSENGER', status: 'Offline', languageWarnings: 0 });
  assert.deepEqual(accounts.find((item) => item.key === driver.user.id),
    { key: driver.user.id, id: driver.user.phone.replace('+63', '0'), name: 'Test driver', email: driver.user.email, role: 'RIDER', status: 'Online', languageWarnings: 0, toda: 'Test TODA', plate: driver.user.plate, approval: 'Approved' });
  assert.equal(accounts.some((item) => item.name === 'Pilot Admin'), false, 'admin accounts are not listed');
  assert.equal(accounts.length, await backend.models.User.countDocuments({ role: { $ne: 'admin' } }));

  // One account's whole trip history, as passenger or as driver.
  const fare = (await backend.models.Ride.findById(completed.id)).fare;
  const passengerHistory = (await request(`/admin/accounts/${passenger.user.id}`, admin.token)).body;
  assert.equal(passengerHistory.account.key, passenger.user.id);
  assert.equal(passengerHistory.account.role, 'PASSENGER');
  assert.ok(Number.isFinite(Date.parse(passengerHistory.account.joined)));
  assert.deepEqual(passengerHistory.trips.map(({ key, as, status, with: other }) => ({ key, as, status, other })), [
    { key: searching.id, as: 'passenger', status: 'Ongoing', other: null },
    { key: cancelled.id, as: 'passenger', status: 'Cancelled', other: null },
    { key: completed.id, as: 'passenger', status: 'Completed', other: 'Test driver' },
  ]);
  assert.equal(passengerHistory.trips[1].cancelledBy, 'passenger');
  assert.equal(passengerHistory.trips[2].fare, fare);
  assert.deepEqual(passengerHistory.summary, { trips: 3, completed: 1, cancelled: 1, noDriver: 0, ongoing: 1, fares: fare });
  const driverHistory = (await request(`/admin/accounts/${driver.user.id}`, admin.token)).body;
  assert.deepEqual(driverHistory.trips.map(({ key, as, status, with: other }) => ({ key, as, status, other })),
    [{ key: completed.id, as: 'driver', status: 'Completed', other: 'Test passenger' }], 'only the trips this driver accepted');
  assert.equal(driverHistory.account.status, 'Online');
  assert.equal((await request(`/admin/accounts/${driver.user.id}`, passenger.token)).status, 403);
  // Admin accounts (added earlier in this run) have no trip history to show.
  const adminAccount = String((await backend.models.User.findOne({ role: 'admin' }))._id);
  for (const id of [adminAccount, '0123456789abcdef01234567', 'not-an-id']) assert.equal((await request(`/admin/accounts/${id}`, admin.token)).status, 404, id);

  const dashboard = (await request('/admin/dashboard', admin.token)).body;
  assert.deepEqual(dashboard, { totalAccounts: accounts.length, onlineNow: 1, ongoingTrips: 1, recentTrips: trips.slice(0, 3), pendingDrivers: await backend.models.User.countDocuments({ role: 'driver', approval: 'pending' }) });

  // A trip history of the last 7 days leaves out the completed trip, booked 10 days ago.
  const day = 24 * 3600000, booked = await backend.models.Ride.findById(completed.id).lean();
  await backend.models.Ride.collection.updateOne({ _id: booked._id }, { $set: { createdAt: new Date(now - 10 * day) } });
  const lastWeek = (await request(`/admin/accounts/${passenger.user.id}?days=7`, admin.token)).body;
  assert.deepEqual(lastWeek.period, { days: 7, since: new Date(now - 7 * day).toISOString() });
  assert.deepEqual(lastWeek.trips.map(({ key }) => key), [searching.id, cancelled.id]);
  assert.deepEqual(lastWeek.summary, { trips: 2, completed: 0, cancelled: 1, noDriver: 0, ongoing: 1, fares: 0 }, 'the totals cover the period too');
  const lastFortnight = (await request(`/admin/accounts/${passenger.user.id}?days=14`, admin.token)).body;
  assert.deepEqual([lastFortnight.trips.length, lastFortnight.summary.completed], [3, 1]);
  assert.equal((await request(`/admin/accounts/${passenger.user.id}`, admin.token)).body.period, null, 'every trip');
  for (const days of ['0', '31', 'week']) assert.equal((await request(`/admin/accounts/${passenger.user.id}?days=${days}`, admin.token)).status, 400, days);
  await backend.models.Ride.collection.updateOne({ _id: booked._id }, { $set: { createdAt: booked.createdAt } });
  await action(passenger, searching.id, 'cancel');
  socket.disconnect();
  await request('/logout', admin.token, {});
});

test('a driver who signs up gets no bookings until an admin approves them, and an admin can suspend, unblock or delete a driver', async () => {
  const passenger = await account(), phone = `0917${sequence++}`, email = `${phone}@example.com`;
  const form = { phone, password: 'strong-password', firstName: 'Nora', lastName: 'Driver', email, role: 'driver', plate: 'NEW-1', toda: 'Test TODA', capacity: 3 };
  const registered = await signup(form);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.user.pendingApproval, true);
  assert.match(registered.body.message, /An admin will check your details against your TODA's list/);
  const id = registered.body.user.id;
  let driver = (await request('/login', null, { phone, password: 'strong-password' })).body;
  assert.equal(driver.user.pendingApproval, true, 'a pending driver can log in');
  const socket = await connect(driver.token);
  assert.equal((await request('/driver/location', driver.token, fix())).status, 200);

  // The three checks: a pending driver cannot go online, is never offered a
  // booking (even if marked available some other way), and cannot take one.
  assert.deepEqual(await request('/driver/availability', driver.token, { available: true }), { status: 403, body: { error: 'Your driver account is waiting for admin approval.' } });
  await backend.models.User.updateOne({ _id: id }, { $set: { available: true } });
  const ride = (await book(passenger)).body.ride;
  assert.equal((await backend.models.Ride.findById(ride.id)).driverSlot, undefined, 'not offered to the pending driver');
  assert.deepEqual((await request('/driver/bookings', driver.token)).body.bookings, [], 'no bookings listed');
  assert.deepEqual(await action(driver, ride.id, 'claim'), { status: 403, body: { error: 'Your driver account is waiting for admin approval.' } });
  assert.equal((await action(passenger, ride.id, 'cancel')).status, 200);
  await backend.models.User.updateOne({ _id: id }, { $set: { available: false } });

  // Account Approval lists the pending driver, for admins only.
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  for (const [path, body] of [['/admin/approvals'], [`/admin/drivers/${id}`], [`/admin/drivers/${id}/approve`, {}]]) assert.equal((await request(path, driver.token, body)).status, 403, path);
  const listed = (await request('/admin/approvals', admin.token)).body.drivers.find((item) => item.key === id);
  assert.deepEqual({ ...listed, joined: typeof listed.joined }, { key: id, id: phone, name: 'Nora Driver', email, role: 'RIDER', status: 'Online', languageWarnings: 0, toda: 'Test TODA', plate: 'NEW-1',
    approval: 'Pending', capacity: 3, joined: 'string', approvedAt: null, terminatedAt: null, terminationReason: '' });
  assert.equal((await request('/admin/dashboard', admin.token)).body.pendingDrivers, await backend.models.User.countDocuments({ role: 'driver', approval: 'pending' }));
  assert.ok((await request('/admin/overview', admin.token)).body.pendingDrivers >= 1, 'the count on the Accounts tab of God view');
  assert.equal((await request('/admin/accounts', admin.token)).body.accounts.find((item) => item.key === id).approval, 'Pending');

  // Approving updates the driver's app at once and lets them go online.
  const changed = new Promise((resolve) => socket.once('state:changed', resolve));
  const approved = await request(`/admin/drivers/${id}/approve`, admin.token, {});
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.deepEqual([approved.body.driver.approval, approved.body.emailed], ['Approved', true]);
  assert.deepEqual(notices.at(-1), { to: email, purpose: 'driverApproved', name: 'Nora', reason: undefined });
  await changed;
  assert.equal((await state(driver)).user.pendingApproval, undefined);
  assert.equal((await request(`/admin/drivers/${id}/approve`, admin.token, {})).status, 409, 'only once');
  await online(driver);

  // Suspending cancels the trip the driver is on, signs them out and blocks
  // their number and email from signing up again.
  const trip = (await book(passenger)).body.ride;
  assert.equal((await action(driver, trip.id, 'accept', { offerId: (await state(driver)).offer.offerId })).status, 200);
  const terminated = await request(`/admin/drivers/${id}/terminate`, admin.token, { reason: '  Plate not on the TODA list  ' });
  assert.equal(terminated.status, 200, JSON.stringify(terminated.body));
  assert.deepEqual([terminated.body.driver.approval, terminated.body.driver.terminationReason, terminated.body.emailed], ['Suspended', 'Plate not on the TODA list', true]);
  assert.deepEqual(notices.at(-1), { to: email, purpose: 'driverTerminated', name: 'Nora', reason: 'Plate not on the TODA list' });
  const ended = await backend.models.Ride.findById(trip.id);
  assert.deepEqual([ended.status, ended.active, ended.cancelledBy, ended.cancellationReason], ['cancelled', false, 'admin', 'Driver account removed']);
  assert.equal((await state(driver)).error, 'Your session has expired. Please log in again.');
  assert.deepEqual(await request('/login', null, { phone, password: 'strong-password' }), { status: 403, body: { error: 'This driver account was suspended by an IndangGO admin.' } });
  assert.equal((await signup({ ...form, phone: `0917${sequence++}` })).status, 403, 'the email is blocked');
  assert.equal((await request('/register/code', null, { ...form, email: `other${phone}@example.com` })).status, 403, 'the number is blocked');
  assert.deepEqual(await request(`/admin/drivers/${id}/terminate`, admin.token, {}), { status: 409, body: { error: 'This driver was already suspended.' } });
  assert.deepEqual(await request(`/admin/drivers/${id}/delete`, admin.token, {}), { status: 409, body: { error: 'Unblock this driver before deleting the account.' } });
  assert.equal((await request('/admin/approvals', admin.token)).body.drivers.find((item) => item.key === id).approval, 'Suspended');

  // Unblocking frees the number and email; the driver waits for approval again.
  const unblocked = await request(`/admin/drivers/${id}/unblock`, admin.token, {});
  assert.deepEqual([unblocked.status, unblocked.body.driver.approval, unblocked.body.driver.terminatedAt], [200, 'Pending', null]);
  assert.equal(await backend.models.Blocked.countDocuments({ userId: id }), 0);
  driver = (await request('/login', null, { phone, password: 'strong-password' })).body;
  assert.equal(driver.user.pendingApproval, true);
  assert.equal((await request(`/admin/drivers/${id}/unblock`, admin.token, {})).status, 409, 'not suspended now');

  // Deleting removes the account; the same number and email can sign up again.
  const deleted = await request(`/admin/drivers/${id}/delete`, admin.token, { reason: 'Wrong plate number' });
  assert.deepEqual([deleted.status, deleted.body.emailed], [200, true]);
  assert.deepEqual(notices.at(-1), { to: email, purpose: 'driverDeleted', name: 'Nora', reason: 'Wrong plate number' });
  assert.equal(await backend.models.User.exists({ _id: id }), null);
  assert.equal((await state(driver)).error, 'Your session has expired. Please log in again.');
  assert.equal((await request(`/admin/drivers/${id}`, admin.token)).status, 404);
  assert.equal((await request(`/admin/drivers/${id}/delete`, admin.token, {})).status, 404);
  for (const other of [passenger.user.id, 'not-an-id']) assert.equal((await request(`/admin/drivers/${other}/approve`, admin.token, {})).status, 404, other);
  const again = await signup(form);
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.equal(again.body.user.pendingApproval, true);
  await backend.models.User.deleteOne({ _id: again.body.user.id });
  socket.disconnect();
  await request('/logout', admin.token, {});
});

test('an admin can decline a driver\'s registration, and the driver can sign up again with the same number and email', async () => {
  const phone = `0917${sequence++}`, email = `${phone}@example.com`;
  const form = { phone, password: 'strong-password', firstName: 'Lea', lastName: 'Driver', email, role: 'driver', plate: 'TYPO-1', toda: 'Test TODA', capacity: 3 };
  const registered = await signup(form);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const id = registered.body.user.id;
  const driver = (await request('/login', null, { phone, password: 'strong-password' })).body;
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  assert.equal((await request(`/admin/drivers/${id}/decline`, driver.token, {})).status, 403, 'admins only');

  // Declining removes the registration and signs the driver out, but blocks nothing.
  const declined = await request(`/admin/drivers/${id}/decline`, admin.token, { reason: '  Plate number mistyped  ' });
  assert.deepEqual([declined.status, declined.body.emailed], [200, true], JSON.stringify(declined.body));
  assert.deepEqual(notices.at(-1), { to: email, purpose: 'driverDeclined', name: 'Lea', reason: 'Plate number mistyped' });
  assert.equal(await backend.models.User.exists({ _id: id }), null);
  assert.equal(await backend.models.Blocked.countDocuments({ $or: [{ userId: id }, { email }] }), 0, 'nothing is blocked');
  assert.equal((await state(driver)).error, 'Your session has expired. Please log in again.');
  assert.equal((await request(`/admin/drivers/${id}/decline`, admin.token, {})).status, 404);

  // The driver signs up again with the same number and email and the right
  // plate, and waits for approval again.
  const again = await signup({ ...form, plate: 'RIGHT-1' });
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.equal(again.body.user.pendingApproval, true);
  // Only a registration waiting for approval can be declined.
  assert.equal((await request(`/admin/drivers/${again.body.user.id}/approve`, admin.token, {})).status, 200);
  assert.deepEqual(await request(`/admin/drivers/${again.body.user.id}/decline`, admin.token, {}), { status: 409, body: { error: 'This driver is no longer waiting for approval.' } });
  await backend.models.User.deleteOne({ _id: again.body.user.id });
  await request('/logout', admin.token, {});
});

test('an admin can cancel any booking or trip that has not ended, and the driver is free for the next booking', async () => {
  const passenger = await account(), driver = await account('driver');
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  const cancel = (rideId, body = {}, token = admin.token) => request(`/admin/rides/${rideId}/cancel`, token, body);

  // A booking still finding a driver; only admins may cancel it this way.
  const searching = (await book(passenger)).body.ride;
  assert.equal((await cancel(searching.id, {}, passenger.token)).status, 403);
  const first = await cancel(searching.id);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.trip, { key: searching.id, id: `#TR-${searching.id.slice(-6).toUpperCase()}`, status: 'Cancelled', cancelledBy: 'admin', cancellationReason: ADMIN_CANCELLATION });
  const told = await state(passenger);
  assert.deepEqual([told.ride, told.lastRide.status, told.lastRide.cancellationReason], [null, 'cancelled', ADMIN_CANCELLATION]);

  // A trip under way: the passenger and driver both see it cancelled with the admin's reason.
  await online(driver);
  const ride = (await book(passenger)).body.ride;
  const offer = (await state(driver)).offer;
  assert.equal(offer?.id, ride.id);
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });
  for (const step of ['arrive', 'start']) await action(driver, ride.id, step);
  const underWay = await cancel(ride.id, { reason: '  Passenger called the hotline  ' });
  assert.equal(underWay.status, 200, JSON.stringify(underWay.body));
  assert.deepEqual([underWay.body.trip.status, underWay.body.trip.cancellationReason], ['Cancelled', 'Passenger called the hotline']);
  const ended = await backend.models.Ride.findById(ride.id).lean();
  assert.deepEqual([ended.status, ended.active, ended.cancelledBy, ended.driverSlot], ['cancelled', false, 'admin', undefined]);
  for (const person of [passenger, driver]) {
    const seen = await state(person);
    assert.deepEqual([seen.ride, seen.lastRide.status, seen.lastRide.cancellationReason], [null, 'cancelled', 'Passenger called the hotline']);
  }
  const listed = (await request(`/admin/accounts/${driver.user.id}`, admin.token)).body.trips.find((trip) => trip.key === ride.id);
  assert.deepEqual([listed.status, listed.cancelledBy, listed.cancellationReason], ['Cancelled', 'admin', 'Passenger called the hotline']);

  // Only a trip that has not ended can be cancelled.
  assert.deepEqual(await cancel(ride.id), { status: 409, body: { error: 'This trip has already ended.' } });
  assert.deepEqual(await cancel('0123456789abcdef01234567'), { status: 404, body: { error: 'Trip not found.' } });
  assert.equal((await cancel('not-a-trip')).status, 404);

  // The driver is offered the next booking.
  const next = (await book(passenger)).body.ride;
  assert.equal((await state(driver)).offer?.id, next.id);
  await action(passenger, next.id, 'cancel');
  await request('/driver/availability', driver.token, { available: false });
  await request('/logout', admin.token, {});
});

test('a booking outside Indang is rejected before any ride is created', async () => {
  const passenger = await account();
  const book = (dropoff) => request('/rides', passenger.token, {
    trip: { pickup: DEFAULT_TRIP.pickup, dropoff: { name: 'Elsewhere', coordinate: dropoff } }, passengers: 1, note: '', idempotencyKey: randomUUID(),
  });
  // Tanza, and CvSU General Trias Campus: General Trias is no longer served.
  for (const elsewhere of [{ latitude: 14.385026, longitude: 120.86 }, { latitude: 14.385026, longitude: 120.880477 }]) {
    const outside = await book(elsewhere);
    assert.equal(outside.status, 400);
    assert.equal(outside.body.error, 'Pickup and destination must be inside Indang.');
  }
  assert.equal(await backend.models.Ride.countDocuments({ passengerId: String(passenger.user.id) }), 0);
});

test('an Indang pickup is offered only to Indang drivers within Indang\'s 5 km radius', async () => {
  // A pickup 330 m inside Indang, near where the towns are closest.
  const trip = {
    pickup: { name: 'Near the northern boundary', coordinate: { latitude: 14.222498, longitude: 120.893654 } },
    dropoff: { name: 'CvSU Main Campus', coordinate: { latitude: 14.197805, longitude: 120.881639 } },
  };
  const spots = {
    generalTrias: { latitude: 14.227011, longitude: 120.899407 }, // 0.8 km, but outside Indang (General Trias)
    cvsuMain: { latitude: 14.197805, longitude: 120.881639 }, // 3.0 km, in Indang
    harasan: { latitude: 14.15988, longitude: 120.86997 }, // 7.4 km: beyond Indang's 5 km radius
  };
  const passenger = await account(), drivers = {};
  for (const [name, coordinate] of Object.entries(spots)) {
    drivers[name] = await account('driver');
    await connect(drivers[name].token);
    assert.equal((await request('/driver/location', drivers[name].token, { ...fix(), ...coordinate })).status, 200);
    assert.equal((await request('/driver/availability', drivers[name].token, { available: true })).status, 200);
  }
  // Mataas na Lupa has three fare areas on the taripa; distance picks one.
  const booked = await request('/rides', passenger.token, { trip, passengers: 1, note: '', idempotencyKey: randomUUID() });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const rideId = booked.body.ride.id;
  assert.equal((await state(drivers.cvsuMain)).offer?.id, rideId, 'the nearest Indang driver is offered');
  assert.equal((await state(drivers.generalTrias)).offer, null, 'a closer driver outside Indang is not');
  const offer = (await state(drivers.cvsuMain)).offer;
  assert.equal((await action(drivers.cvsuMain, rideId, 'decline', { offerId: offer.offerId })).status, 200);
  assert.equal((await state(drivers.harasan)).offer, null, 'nobody beyond Indang\'s radius is asked');
  assert.equal((await state(drivers.generalTrias)).offer, null);
  await action(passenger, rideId, 'cancel');
  for (const driver of Object.values(drivers)) await request('/driver/availability', driver.token, { available: false });
});

test('matching offers the nearest Indang driver inside the radius, then the next one', async () => {
  // Places around the CvSU Main Campus pickup.
  const spots = {
    cityHall: { latitude: 14.199043, longitude: 120.881964 }, // 142 m
    tanza: { latitude: 14.227011, longitude: 120.899407 }, // 3.8 km, outside Indang (General Trias)
    annunciation: { latitude: 14.16053, longitude: 120.87006 }, // 4.3 km, Harasan
    manggahan: { latitude: 14.121075, longitude: 120.927235 }, // 9.8 km, beyond the 5 km radius
  };
  const passenger = await account(), drivers = {};
  for (const [name, coordinate] of Object.entries(spots)) {
    drivers[name] = await account('driver');
    await connect(drivers[name].token);
    assert.equal((await request('/driver/location', drivers[name].token, { ...fix(), ...coordinate })).status, 200);
    assert.equal((await request('/driver/availability', drivers[name].token, { available: true })).status, 200);
  }
  const booked = await book(passenger);
  assert.equal(booked.status, 201);
  const rideId = booked.body.ride.id;

  const first = (await state(drivers.cityHall)).offer;
  assert.equal(first?.id, rideId, 'the closest driver is offered first');
  for (const name of ['tanza', 'annunciation', 'manggahan']) assert.equal((await state(drivers[name])).offer, null, `${name} waits`);
  assert.equal((await action(drivers.cityHall, rideId, 'decline', { offerId: first.offerId })).status, 200);

  const second = (await state(drivers.annunciation)).offer;
  assert.equal(second?.id, rideId, 'the next driver inside Indang is offered, skipping the one outside');
  assert.equal((await state(drivers.tanza)).offer, null);
  assert.equal((await state(drivers.manggahan)).offer, null);
  assert.equal((await state(drivers.cityHall)).offer, null, 'a driver who declined is not asked again');

  assert.equal((await action(drivers.annunciation, rideId, 'accept', { offerId: second.offerId })).body.ride.status, 'accepted');
  for (const step of ['arrive', 'start', 'complete']) assert.equal((await action(drivers.annunciation, rideId, step)).status, 200);
  const done = await backend.models.Ride.findById(rideId);
  assert.equal(done.status, 'completed');
  assert.equal(done.driverId, String(drivers.annunciation.user.id));
  assert.deepEqual(done.attemptedDrivers, [String(drivers.cityHall.user.id), String(drivers.annunciation.user.id)]);
  for (const driver of Object.values(drivers)) await request('/driver/availability', driver.token, { available: false });
});

test('only the TODA tester can change its TODA from the profile', async () => {
  const profile = (who, toda) => ({ firstName: 'Test', lastName: 'Driver', email: who.user.email, plate: 'TEST-1', toda, capacity: 4 });
  const driver = await account('driver');
  const locked = await request('/me', driver.token, profile(driver, 'BITODA'), 'PATCH');
  assert.equal(locked.status, 200, JSON.stringify(locked.body));
  assert.equal(locked.body.user.toda, 'Test TODA', 'a driver keeps the TODA it signed up with');
  assert.equal(locked.body.user.todaChoices, undefined);
  const tester = await account('driver');
  await backend.models.User.updateOne({ _id: tester.user.id }, { $set: { todaTester: true } });
  const me = (await request('/me', tester.token)).body.user;
  assert.ok(me.todaChoices.includes('BITODA') && me.todaChoices.includes('ALITODA'), 'the tester is offered every Indang TODA');
  const switched = await request('/me', tester.token, profile(tester, 'alitoda'), 'PATCH');
  assert.equal(switched.status, 200, JSON.stringify(switched.body));
  assert.equal(switched.body.user.toda, 'ALITODA');
  assert.equal((await request('/me', tester.token, profile(tester, 'Somewhere TODA'), 'PATCH')).status, 400, 'only an Indang TODA');
  assert.equal((await request('/me', driver.token, { ...profile(driver, 'BITODA'), todaTester: true }, 'PATCH')).body.user.todaChoices, undefined,
    'the API cannot grant the tester mark');
});

test('an Indang TODA driver is offered only trips that pick up inside its TODA\'s barangays, to any drop-off', async () => {
  // PCHTI-TODA serves Pulo, Carasuchi, Harasan and Tambo Ilaya (TODAs_coordinates.xlsx).
  const place = (name, latitude, longitude) => ({ name, coordinate: { latitude, longitude } });
  const pulo = place('Pulo Barangay Hall', 14.16990, 120.87269), harasan = place('Barangay Harasan', 14.16053, 120.87006);
  const poblacion = place('Poblacion', 14.19558, 120.87956);
  const phone = `0917${sequence++}`;
  const registered = await signup({ phone, password: 'strong-password', firstName: 'Pulo', lastName: 'Driver',
    email: `${phone}@example.com`, role: 'driver', plate: 'PCH-1', toda: 'pchti toda', capacity: 4 });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.user.toda, 'PCHTI-TODA', 'stored under the official name');
  await approve(registered.body.user.id);
  const pchti = (await request('/login', null, { phone, password: 'strong-password' })).body;
  const unzoned = await account('driver'); // "Test TODA": not an Indang TODA, so no barangay limit
  for (const [driver, spot] of [[pchti, pulo], [unzoned, harasan]]) {
    await connect(driver.token);
    assert.equal((await request('/driver/location', driver.token, { ...fix(), ...spot.coordinate })).status, 200);
    assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 200);
  }
  const book = async (pickup, dropoff) => {
    const passenger = await account();
    const booked = await request('/rides', passenger.token, { trip: { pickup, dropoff }, passengers: 1, note: '', idempotencyKey: randomUUID() });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    return { passenger, rideId: booked.body.ride.id };
  };

  const inside = await book(pulo, harasan);
  assert.equal((await state(pchti)).offer?.id, inside.rideId, 'Pulo to Harasan: the nearest driver, from PCHTI-TODA');
  await action(inside.passenger, inside.rideId, 'cancel');

  const leaving = await book(pulo, poblacion);
  assert.equal((await state(pchti)).offer?.id, leaving.rideId, 'Pulo to Poblacion picks up in PCHTI-TODA\'s barangays, so it may drop off outside them');
  await action(leaving.passenger, leaving.rideId, 'cancel');

  const arriving = await book(poblacion, pulo);
  assert.equal((await state(pchti)).offer, null, 'Poblacion to Pulo picks up outside PCHTI-TODA\'s barangays');
  assert.equal((await state(unzoned)).offer?.id, arriving.rideId, 'a driver without an Indang TODA still gets it');
  await action(arriving.passenger, arriving.rideId, 'cancel');
  for (const driver of [pchti, unzoned]) await request('/driver/availability', driver.token, { available: false });
});

test('auth validates credentials, returns stored identity, rejects foreign roles and revokes sessions', async () => {
  const passenger = await account();
  assert.equal(passenger.user.firstName, 'Test');
  assert.equal(passenger.user.role, 'passenger');
  assert.equal(passenger.user.password, undefined);
  assert.equal((await request('/state')).status, 401);
  assert.equal((await request('/login', null, { phone: passenger.user.phone, password: 'wrong' })).status, 401);
  assert.equal((await request('/driver/availability', passenger.token, { available: true })).status, 403);
  await request('/logout', passenger.token, {});
  assert.equal((await request('/state', passenger.token)).status, 401);
});

test('a forgotten password is reset with the code emailed to the number\'s account and ends every session', async () => {
  const user = await account();
  const email = user.user.email, phone = user.user.phone;
  assert.equal((await request('/password/code', null, { phone: '09180000001' })).status, 404, 'no account uses that number');
  const sent = await request('/password/code', null, { phone });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.notEqual(sent.body.email, email, 'the app gets the email masked');
  assert.match(sent.body.email, /^\w{2}\*+\w@example\.com$/);
  const code = emailedCodes.get(email);
  assert.equal((await request('/password/verify', null, { phone, code })).status, 200);
  const reset = await request('/password/reset', null, { phone, code, password: 'a-new-password' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await request('/me', user.token)).status, 401);
  assert.equal((await request('/login', null, { phone, password: 'strong-password' })).status, 401);
  assert.equal((await request('/login', null, { phone, password: 'a-new-password' })).status, 200);
  assert.equal((await request('/password/reset', null, { phone, code, password: 'yet-another-one' })).status, 400);
});

test('real passenger/driver flow persists exclusive assignment, authorized actions and history', async () => {
  const passenger = await account(), driver = await account('driver'), stranger = await account();
  await online(driver);
  const booking = await book(passenger);
  assert.equal(booking.status, 201);
  const ride = booking.body.ride;
  const offer = (await state(driver)).offer;
  assert.equal(offer.id, ride.id);
  assert.equal(offer.passenger.phone, undefined, 'contacts are private until acceptance');
  assert.equal((await action(stranger, ride.id, 'cancel')).status, 403);
  assert.equal((await action(passenger, ride.id, 'accept')).status, 403);
  assert.equal((await action(driver, ride.id, 'accept', { offerId: offer.offerId })).body.ride.status, 'accepted');
  assert.equal((await action(driver, ride.id, 'complete')).status, 409);
  assert.equal((await action(driver, ride.id, 'arrive')).body.ride.status, 'arrived');
  assert.equal((await action(driver, ride.id, 'start')).body.ride.status, 'in_progress');
  assert.equal((await action(passenger, ride.id, 'cancel')).status, 409);
  assert.equal((await action(driver, ride.id, 'complete')).body.ride.status, 'completed');
  const history = (await request('/history', passenger.token)).body.rides;
  assert.equal(history[0].status, 'completed');
  // The taripa's special fare for the default trip, day or night by the server clock.
  const fare = quoteTrip({ pickup: DEFAULT_TRIP.pickup.coordinate, dropoff: DEFAULT_TRIP.dropoff.coordinate, at: now }).special.fare;
  assert.equal(history[0].fare, fare);
  assert.deepEqual((await request('/stats', driver.token)).body, { trips: 1, totalFare: fare, todayTrips: 1, todayFare: fare });
  assert.equal((await state(driver)).ride, null);
  await request('/driver/availability', driver.token, { available: false });
});

test('drivers see every open booking and can take one that is offered to someone else', async () => {
  const passenger = await account(), d1 = await account('driver'), d2 = await account('driver');
  await online(d1, 14.1979); await online(d2, 14.2000);
  const { body: { ride } } = await book(passenger);
  const offer = (await state(d1)).offer;
  assert.equal(offer.id, ride.id, 'the nearest driver still gets the offer');
  const [own, other] = await Promise.all([request('/driver/bookings', d1.token), request('/driver/bookings', d2.token)]);
  assert.equal(own.body.bookings[0].offerId, offer.offerId, 'the list marks the booking offered to this driver');
  const listed = other.body.bookings.find((entry) => entry.id === ride.id);
  assert.ok(listed, 'other drivers in the area see it too');
  assert.equal(listed.offerId, undefined);
  assert.equal(listed.passenger.phone, undefined, 'contacts are private until acceptance');
  assert.ok(listed.distanceMeters >= 0);
  assert.equal((await request('/driver/bookings', passenger.token)).status, 403);
  const taken = await action(d2, ride.id, 'claim');
  assert.equal(taken.status, 200, JSON.stringify(taken.body));
  assert.equal(taken.body.ride.status, 'accepted');
  assert.equal(taken.body.ride.driver.id, d2.user.id);
  assert.equal((await action(d1, ride.id, 'accept', { offerId: offer.offerId })).status, 409, 'the offer is gone');
  assert.equal((await action(d1, ride.id, 'claim')).status, 409);
  assert.equal((await state(d1)).offer, null);
  assert.ok(!(await request('/driver/bookings', d1.token)).body.bookings.some((entry) => entry.id === ride.id));
  assert.equal((await action(d2, ride.id, 'arrive')).status, 200);
  assert.equal((await action(d2, ride.id, 'start')).status, 200);
  assert.equal((await action(d2, ride.id, 'cancel')).status, 409, 'only the TODA tester cancels a trip under way');
  await backend.models.User.updateOne({ _id: d2.user.id }, { $set: { todaTester: true } });
  const cancelled = await action(d2, ride.id, 'cancel', { reason: 'Test ride' });
  assert.equal(cancelled.body.ride.status, 'cancelled', JSON.stringify(cancelled.body));
  assert.equal((await state(d2)).lastRide.status, 'cancelled');
  await backend.models.User.updateOne({ _id: d2.user.id }, { $set: { todaTester: false } });
  await request('/driver/availability', d1.token, { available: false });
  await request('/driver/availability', d2.token, { available: false });
});

test('retrying a booking is idempotent and cannot create a second active request', async () => {
  const passenger = await account();
  const key = randomUUID();
  const results = await Promise.all([book(passenger, key), book(passenger, key)]);
  assert.equal(results[0].body.ride.id, results[1].body.ride.id);
  assert.equal((await book(passenger)).status, 409);
  await action(passenger, results[0].body.ride.id, 'cancel');
});

test('one driver receives only one concurrent reservation and cancellation cannot resurrect a ride', async () => {
  const p1 = await account(), p2 = await account(), driver = await account('driver');
  await online(driver);
  const [r1, r2] = await Promise.all([book(p1), book(p2)]);
  const offer = (await state(driver)).offer;
  assert.ok(offer);
  const passenger = offer.id === r1.body.ride.id ? p1 : p2;
  const results = await Promise.all([action(driver, offer.id, 'accept', { offerId: offer.offerId }), action(passenger, offer.id, 'cancel')]);
  assert.ok(results.some((result) => result.status === 200));
  const stored = await backend.models.Ride.findById(offer.id);
  assert.equal(stored.status, 'cancelled');
  assert.equal(await backend.models.Ride.countDocuments({ driverSlot: driver.user.id, active: true }), 1);
  await action(offer.id === r1.body.ride.id ? p2 : p1, offer.id === r1.body.ride.id ? r2.body.ride.id : r1.body.ride.id, 'cancel');
  await request('/driver/availability', driver.token, { available: false });
});

test('offer expiry moves to the next nearest driver and search timeout is real', async () => {
  const p = await account(), d1 = await account('driver'), d2 = await account('driver');
  await online(d1, 14.1979); await online(d2, 14.2000);
  const { body: { ride } } = await book(p);
  const original = (await state(d1)).offer;
  assert.equal(original.id, ride.id);
  now += 21000;
  await backend.dispatch.tick();
  assert.equal((await action(d1, ride.id, 'accept', { offerId: original.offerId })).status, 409);
  assert.equal((await state(d2)).offer.id, ride.id);
  now += 120000;
  await backend.dispatch.tick();
  assert.equal((await backend.models.Ride.findById(ride.id)).status, 'no_driver');
  await request('/driver/availability', d1.token, { available: false });
  await request('/driver/availability', d2.token, { available: false });
});

test('bad or stale GPS never makes a driver available', async () => {
  const driver = await account('driver');
  await connect(driver.token);
  assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 409);
  for (const location of [{ ...fix(), latitude: 999 }, { ...fix(), timestamp: now - 31000 }, { ...fix(), accuracy: null }]) {
    assert.equal((await request('/driver/location', driver.token, location)).status, 400);
  }
});

test('a driver outside the service area stays online with live GPS but is offered rides only inside it', async () => {
  const passenger = await account(), driver = await account('driver');
  // 3.8 km from the pickup: inside the matching radius, outside Indang (in General Trias).
  const outside = { ...fix(), latitude: 14.227011, longitude: 120.899407 };
  await connect(driver.token);
  assert.equal((await request('/driver/location', driver.token, outside)).status, 200);
  assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 200);
  const booked = await book(passenger);
  assert.equal((await state(driver)).offer, null);
  now += 1000;
  assert.equal((await request('/driver/location', driver.token, fix())).status, 200);
  assert.equal((await state(driver)).offer?.id, booked.body.ride.id);
  await action(passenger, booked.body.ride.id, 'cancel');
  await request('/driver/availability', driver.token, { available: false });
});

test('GPS invalidation immediately releases an offer and disables matching', async () => {
  const passenger = await account(), driver = await account('driver');
  await online(driver);
  const booked = await book(passenger);
  const offer = (await state(driver)).offer;
  assert.equal(offer.id, booked.body.ride.id);
  const unavailable = await request('/driver/location/unavailable', driver.token, { reason: 'denied' });
  assert.equal(unavailable.status, 200);
  assert.equal((await state(driver)).offer, null);
  assert.equal((await action(driver, offer.id, 'accept', { offerId: offer.offerId })).status, 409);
  assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 409);
  await action(passenger, booked.body.ride.id, 'cancel');
});

test('GPS invalidation preserves an assigned ride but marks its last position unavailable', async () => {
  const passenger = await account(), driver = await account('driver');
  await online(driver);
  const booked = await book(passenger), offer = (await state(driver)).offer;
  await action(driver, offer.id, 'accept', { offerId: offer.offerId });
  await request('/driver/location/unavailable', driver.token, { reason: 'inaccurate' });
  const snapshot = await state(passenger);
  assert.equal(snapshot.ride.id, booked.body.ride.id);
  assert.equal(snapshot.ride.status, 'accepted');
  assert.equal(snapshot.ride.driverLocationAvailable, false);
  assert.ok(snapshot.ride.driverLocation, 'last measured fix remains clearly marked as last known');
  await action(passenger, offer.id, 'cancel');
});

test('private GPS is delivered to the assigned passenger but never a stranger', async () => {
  const p = await account(), d = await account('driver'), other = await account();
  const passengerSocket = await connect(p.token), strangerSocket = await connect(other.token);
  const received = [], leaked = [];
  passengerSocket.on('driver:location', (event) => received.push(event));
  strangerSocket.on('driver:location', (event) => leaked.push(event));
  await online(d);
  const booked = await book(p), offer = (await state(d)).offer;
  await action(d, offer.id, 'accept', { offerId: offer.offerId });
  now += 2000;
  await request('/driver/location', d.token, fix(14.198));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(received.at(-1).rideId, booked.body.ride.id);
  assert.equal(received.at(-1).location.latitude, 14.198);
  assert.equal(leaked.length, 0);
  await action(p, offer.id, 'cancel');
  await request('/driver/availability', d.token, { available: false });
});

test('passenger GPS reaches only the driver holding the ride', async () => {
  const p = await account(), d = await account('driver'), other = await account('driver');
  const driverSocket = await connect(d.token), otherSocket = await connect(other.token);
  const received = [], leaked = [];
  driverSocket.on('passenger:location', (event) => received.push(event));
  otherSocket.on('passenger:location', (event) => leaked.push(event));
  assert.equal((await request('/passenger/location', d.token, fix())).status, 403);
  await online(d);
  const booked = await book(p), offer = (await state(d)).offer;
  assert.equal(offer.passengerLocation, null, 'an offered driver does not see the passenger yet');
  await action(d, offer.id, 'accept', { offerId: offer.offerId });
  now += 1000;
  assert.equal((await request('/passenger/location', p.token, fix(14.1985))).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(received.at(-1).rideId, booked.body.ride.id);
  assert.equal(received.at(-1).location.latitude, 14.1985);
  assert.equal((await state(d)).ride.passengerLocation.latitude, 14.1985);
  assert.equal(leaked.length, 0);
  await action(p, offer.id, 'cancel');
  assert.equal((await state(d)).lastRide.passengerLocation, null, 'sharing ends with the ride');
  await request('/driver/availability', d.token, { available: false });
});

test('logout revokes socket access and database unique indexes reject double driver reservations', async () => {
  const d = await account('driver'), p1 = await account(), p2 = await account();
  await online(d);
  const a = await book(p1), b = await book(p2);
  const offer = (await state(d)).offer;
  const other = offer.id === a.body.ride.id ? b.body.ride.id : a.body.ride.id;
  await assert.rejects(backend.models.Ride.updateOne({ _id: other }, { $set: { driverSlot: d.user.id } }), (error) => error.code === 11000);
  await request('/logout', d.token, {});
  const socket = io(base, { auth: { token: d.token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const error = await new Promise((resolve) => socket.once('connect_error', resolve));
  assert.match(error.message, /session|log in/i);
  await action(p1, a.body.ride.id, 'cancel'); await action(p2, b.body.ride.id, 'cancel');
});

test('an assigned ride survives server restart and expires authentication by server time', async () => {
  const p = await account(), d = await account('driver');
  await online(d); const booked = await book(p), offer = (await state(d)).offer;
  await action(d, offer.id, 'accept', { offerId: offer.offerId });
  await backend.close();
  backend = await createBackend({ mongoUri: `${process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017'}/${dbName}`, clock: () => now, adminPhones: adminPhone, sendEmail });
  await new Promise((resolve) => backend.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${backend.server.address().port}`;
  const restored = await state(p);
  assert.equal(restored.ride.id, booked.body.ride.id);
  assert.equal(restored.ride.status, 'accepted');
  assert.equal(restored.ride.driverConnected, false);
  await action(p, offer.id, 'cancel');
  now += 8 * 24 * 3600000;
  assert.equal((await request('/state', p.token)).status, 401);
});

test('an Indang booking is charged from the taripa by the server, not the app', async () => {
  const passenger = await account();
  const plaza = { name: 'Indang Town Plaza', coordinate: { latitude: 14.19576, longitude: 120.87849 } };
  // In Bancod's Purok III distance band from the plaza (data/fares.js).
  const bancod = { name: 'Bancod Purok III', coordinate: { latitude: 14.2186, longitude: 120.87265 } };
  const book = (extra) => request('/rides', passenger.token, { trip: { pickup: plaza, dropoff: bancod }, passengers: 3, note: '',
    idempotencyKey: randomUUID(), fare: 1, ...extra });
  // Bancod's puroks have different fares; the stop's distance decides, and an
  // area the app names is ignored.
  // TARIPA, Purok III from Indang by day: ₱17 regular, ₱14 with a student/senior/PWD ID.
  now = Date.UTC(2026, 9, 2, 2, 0); // 10:00 AM in the Philippines
  const regular = await book({ fareType: 'regular', discounted: 1, fareAreas: { dropoff: 'bancod-purok-1' } });
  assert.equal(regular.status, 201, JSON.stringify(regular.body));
  assert.equal(regular.body.ride.fare, 2 * 17 + 14, 'the fare the app sent is ignored');
  assert.equal(regular.body.ride.fareDetails.type, 'regular');
  assert.equal((await action(passenger, regular.body.ride.id, 'cancel')).status, 200);
  // A special trip at night: ₱39 for two passengers, ₱15 for the third.
  now = Date.UTC(2026, 9, 2, 14, 0); // 10:00 PM in the Philippines
  const special = await book({ fareType: 'special' });
  assert.equal(special.status, 201, JSON.stringify(special.body));
  assert.equal(special.body.ride.fare, 39 + 15);
  assert.equal(special.body.ride.fareDetails.night, true);
  assert.equal((await action(passenger, special.body.ride.id, 'cancel')).status, 200);
  // Regular fares exist only on the Bancod routes.
  const alulod = { name: 'Alulod Elementary School', coordinate: { latitude: 14.20623, longitude: 120.88944 } };
  const noRegular = await request('/rides', passenger.token, { trip: { pickup: plaza, dropoff: alulod }, passengers: 1, note: '',
    idempotencyKey: randomUUID(), fareType: 'regular' });
  assert.equal(noRegular.status, 400);
  now = Date.now();
});

test('names with symbols are rejected before a sign-up code is sent, and on profile update', async () => {
  const email = `symbols-${sequence}@example.com`;
  const bad = await request('/register/code', null, { phone: `0917${sequence++}`, password: 'strong-password', firstName: 'Juan1', lastName: 'Cruz', email, role: 'passenger' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Names can only contain letters and spaces.');
  assert.equal(emailedCodes.has(email), false);
  const p = await account();
  assert.equal((await request('/me', p.token, { firstName: 'Juan', lastName: '<b>Cruz</b>', email: 'juan@example.com' }, 'PATCH')).status, 400);
  assert.equal((await request('/me', p.token, { firstName: 'Peña', lastName: 'Dela Cruz', email: 'juan@example.com' }, 'PATCH')).status, 200);
});

test('after a completed ride each side rates the other once, and the next trip shows the averages', async () => {
  const passenger = await account(), driver = await account('driver'), stranger = await account();
  await online(driver);
  const ride = (await book(passenger)).body.ride;
  let offer = (await state(driver)).offer;
  assert.deepEqual(offer.passenger.rating, { average: null, count: 0 }, 'a new passenger has no rating yet');
  assert.equal((await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 5 })).status, 409, 'not before the ride ends');
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });
  for (const step of ['arrive', 'start', 'complete']) await action(driver, ride.id, step);

  const rate = (who, body) => request(`/rides/${ride.id}/rating`, who.token, body);
  assert.equal((await rate(stranger, { stars: 1 })).status, 403, 'only participants rate');
  assert.equal((await rate(passenger, { stars: 0 })).status, 400);
  assert.equal((await rate(passenger, { stars: 5, tags: ['Did not pay'] })).status, 400, 'a passenger tag cannot describe a driver');
  const rated = await rate(passenger, { stars: 5, tags: ['Safe driving'], comment: 'Smooth trip' });
  assert.equal(rated.status, 200, JSON.stringify(rated.body));
  assert.deepEqual(rated.body.ride.myRating, { stars: 5, tags: ['Safe driving'], comment: 'Smooth trip' });
  assert.equal((await rate(passenger, { stars: 1 })).status, 409, 'a ride is rated once per side');
  assert.equal((await state(passenger)).lastRide.myRating.stars, 5, 'the app knows the passenger already rated');
  // Drivers do not rate passengers: they report them instead.
  assert.equal((await rate(driver, { stars: 2, tags: ['Did not pay'] })).status, 403, 'drivers report rather than rate');
  const before = (await state(driver)).lastRide;
  assert.equal(before.myRating, null);
  assert.deepEqual([before.reportable, before.myReport], [true, null], 'the app offers the driver a report');
  const report = (who, body) => request(`/rides/${ride.id}/report`, who.token, body);
  assert.equal((await report(passenger, { reason: 'no_show' })).status, 403, 'only the driver of the trip reports');
  assert.equal((await report(driver, { reason: 'other' })).status, 400, 'something else needs details');
  const filed = await report(driver, { reason: 'did_not_pay', details: 'Left without paying' });
  assert.equal(filed.status, 200, JSON.stringify(filed.body));
  assert.deepEqual(filed.body.ride.myReport, { reason: 'did_not_pay', details: 'Left without paying', status: 'pending' });
  assert.equal((await report(driver, { reason: 'no_show' })).status, 409, 'one report per trip');

  assert.deepEqual((await state(driver)).user.rating, { average: 5, count: 1 });
  assert.deepEqual((await state(passenger)).user.rating, { average: null, count: 0 }, 'a report is not a rating');
  const history = (await request('/history', driver.token)).body.rides;
  assert.equal(history.find((entry) => entry.id === ride.id).myReport.reason, 'did_not_pay');
  assert.equal(await backend.models.Rating.countDocuments({ rideId: ride.id }), 1);

  // On the next booking the driver sees the passenger's average on the offer,
  // and the passenger sees the driver's once accepted.
  const next = (await book(passenger)).body.ride;
  offer = (await state(driver)).offer;
  assert.equal(offer.id, next.id);
  assert.deepEqual(offer.passenger.rating, { average: null, count: 0 });
  await action(driver, next.id, 'accept', { offerId: offer.offerId });
  assert.deepEqual((await state(passenger)).ride.driver.rating, { average: 5, count: 1 });

  // Admins see the driver's average and the passenger's report.
  // The God view test registered the admin earlier in this run.
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  await connect(passenger.token);
  const people = (await request('/admin/overview', admin.token)).body.users;
  const reported = people.find((person) => person.id === passenger.user.id);
  assert.deepEqual([reported.rating, reported.safetyReports], [{ average: null, count: 0 }, 1]);
  assert.equal(people.find((person) => person.id === driver.user.id).safetyReports, 0);
  await action(passenger, next.id, 'cancel');
  await request('/driver/availability', driver.token, { available: false });
});

// A driver's finished trip with a passenger, for reports.
async function finishedTrip(passenger, driver, { cancel = false } = {}) {
  const ride = (await book(passenger)).body.ride;
  const offer = (await state(driver)).offer;
  assert.equal(offer?.id, ride.id);
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });
  if (cancel) { await action(driver, ride.id, 'arrive'); assert.equal((await action(driver, ride.id, 'cancel', { reason: 'Passenger did not show' })).status, 200); }
  else for (const step of ['arrive', 'start', 'complete']) await action(driver, ride.id, step);
  return ride;
}

test('after a cancellation, whoever cancelled, the passenger can rate the driver and the driver can report the passenger', async () => {
  const passenger = await account(), driver = await account('driver');
  await online(driver);
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  // A ride the driver accepted and took to `steps`, then cancelled by `by`.
  async function cancelledTrip(steps, by) {
    const ride = (await book(passenger)).body.ride;
    const offer = (await state(driver)).offer;
    assert.equal(offer?.id, ride.id);
    await action(driver, ride.id, 'accept', { offerId: offer.offerId });
    for (const step of steps) await action(driver, ride.id, step);
    const cancelled = by === admin ? await request(`/admin/rides/${ride.id}/cancel`, admin.token, {}) : await action(by, ride.id, 'cancel');
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    return ride;
  }
  const cases = [['the passenger', [], passenger, 5], ['the driver', ['arrive'], driver, 2], ['an admin', ['arrive', 'start'], admin, 4]];
  for (const [who, steps, by, stars] of cases) {
    const ride = await cancelledTrip(steps, by);
    const seen = (await state(passenger)).lastRide, theirs = (await state(driver)).lastRide;
    assert.deepEqual([seen.id, seen.status, seen.ratable, seen.myRating], [ride.id, 'cancelled', true, null], `cancelled by ${who}: the app offers the passenger a rating`);
    assert.deepEqual([theirs.id, theirs.reportable, theirs.myReport, theirs.ratable], [ride.id, true, null, undefined], `cancelled by ${who}: the app offers the driver a report`);
    const rated = await request(`/rides/${ride.id}/rating`, passenger.token, { stars, tags: stars >= 4 ? ['Friendly'] : ['Late pickup'] });
    assert.equal(rated.status, 200, JSON.stringify(rated.body));
    assert.equal(rated.body.ride.myRating.stars, stars);
    assert.equal((await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 1 })).status, 409, 'once per ride');
    assert.equal((await request(`/rides/${ride.id}/rating`, driver.token, { stars: 1 })).status, 403, 'drivers report rather than rate');
    const reported = await request(`/rides/${ride.id}/report`, driver.token, { reason: 'no_show' });
    assert.equal(reported.status, 200, JSON.stringify(reported.body));
    assert.equal(reported.body.ride.myReport.reason, 'no_show');
  }
  assert.deepEqual((await state(driver)).user.rating, { average: 3.7, count: 3 }, 'cancelled trips count toward the driver’s average');
  const history = (await request('/history', passenger.token)).body.rides;
  assert.equal(history.filter((entry) => entry.ratable && entry.myRating).length, 3, 'History shows each rating');

  // A booking cancelled before any driver accepted has no one to rate or report.
  await request('/driver/availability', driver.token, { available: false });
  const unmatched = (await book(passenger)).body.ride;
  await action(passenger, unmatched.id, 'cancel');
  const lone = (await state(passenger)).lastRide;
  assert.deepEqual([lone.id, lone.ratable, lone.reportable], [unmatched.id, undefined, undefined]);
  assert.deepEqual(await request(`/rides/${unmatched.id}/rating`, passenger.token, { stars: 5 }),
    { status: 409, body: { error: 'No driver accepted this booking, so there is no one to rate.' } });
  assert.equal((await request(`/rides/${unmatched.id}/report`, driver.token, { reason: 'fake_booking' })).status, 403);

  // A driver whose account was deleted can no longer be rated.
  const other = await account('driver');
  await online(other);
  const gone = (await book(passenger)).body.ride;
  const offer = (await state(other)).offer;
  assert.equal(offer?.id, gone.id);
  await action(other, gone.id, 'accept', { offerId: offer.offerId });
  await action(passenger, gone.id, 'cancel');
  await backend.models.User.deleteOne({ _id: other.user.id });
  assert.equal((await state(passenger)).lastRide.ratable, undefined);
  assert.deepEqual(await request(`/rides/${gone.id}/rating`, passenger.token, { stars: 1 }),
    { status: 409, body: { error: "This driver's account no longer exists." } });
  await request('/logout', admin.token, {});
});

test('upheld reports suspend a passenger for 24 hours, then 3 days, then disable the account and block its number and email', async () => {
  const passenger = await account(), driver = await account('driver'), stranger = await account();
  await online(driver);
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  const listed = async (rideId) => (await request('/admin/reports', admin.token)).body.reports.find((entry) => entry.trip?.key === rideId);
  const fileReport = async (rideId, reason) => {
    assert.equal((await request(`/rides/${rideId}/report`, driver.token, { reason })).status, 200);
    return listed(rideId);
  };
  // Logging in again keeps the driver live through the simulated days.
  const keepDriverLive = async () => { await request('/driver/location', driver.token, fix()); await request('/driver/availability', driver.token, { available: true }); };
  assert.equal((await request('/admin/reports', passenger.token)).status, 403, 'only admins see reports');

  // A no-show: the driver cancels at the pickup, then reports. A dismissed report changes nothing.
  const first = await fileReport((await finishedTrip(passenger, driver, { cancel: true })).id, 'no_show');
  assert.deepEqual([first.status, first.reasonLabel, first.passenger.offenses, first.passenger.nextPenalty], ['pending', 'No-show at pickup', 0, '24-hour suspension']);
  assert.equal(first.trip.cancelledBy, 'driver');
  assert.equal((await request(`/admin/reports/${first.key}/uphold`, stranger.token, {})).status, 403);
  assert.equal((await request(`/admin/reports/${first.key}/dismiss`, admin.token, {})).body.report.status, 'dismissed');
  assert.equal((await request(`/admin/reports/${first.key}/uphold`, admin.token, {})).status, 409, 'a report is reviewed once');
  assert.equal((await request('/me', passenger.token)).status, 200, 'still signed in');

  // First offense: 24 hours, every session ends, and logging in says until when.
  const second = await fileReport((await finishedTrip(passenger, driver)).id, 'fake_booking');
  const upheld = (await request(`/admin/reports/${second.key}/uphold`, admin.token, {})).body.report;
  assert.deepEqual([upheld.status, upheld.penalty.offense, upheld.penalty.label, upheld.passenger.offenses], ['upheld', 1, '24-hour suspension', 1]);
  assert.equal(+new Date(upheld.penalty.until), now + 24 * 3600000);
  assert.equal((await request('/me', passenger.token)).status, 401, 'signed out at once');
  const login = () => request('/login', null, { phone: passenger.user.phone, password: 'strong-password' });
  const barred = await login();
  assert.equal(barred.status, 403);
  assert.match(barred.body.error, /suspended until/);
  now += 24 * 3600000 + 1000;
  let session = await login();
  assert.equal(session.status, 200, 'back after 24 hours');
  passenger.token = session.body.token;
  await keepDriverLive();

  // Second offense: 3 days.
  const third = await fileReport((await finishedTrip(passenger, driver)).id, 'fake_booking');
  assert.equal(third.passenger.nextPenalty, '3-day suspension');
  assert.equal((await request(`/admin/reports/${third.key}/uphold`, admin.token, {})).body.report.penalty.label, '3-day suspension');
  now += 2 * 24 * 3600000;
  assert.equal((await login()).status, 403, 'still barred after two days');
  now += 24 * 3600000 + 1000;
  session = await login();
  assert.equal(session.status, 200, 'back after three days');
  passenger.token = session.body.token;
  await keepDriverLive();

  // Third offense: disabled for good. An active booking is cancelled, and the
  // number and email cannot sign up again.
  const fourth = await fileReport((await finishedTrip(passenger, driver)).id, 'fake_booking');
  assert.equal(fourth.passenger.nextPenalty, 'Permanently disabled');
  const pending = (await book(passenger)).body.ride;
  const final = (await request(`/admin/reports/${fourth.key}/uphold`, admin.token, {})).body.report;
  assert.deepEqual([final.penalty.permanent, final.passenger.disabled, final.passenger.offenses], [true, true, 3]);
  const cancelled = await backend.models.Ride.findById(pending.id);
  assert.deepEqual([cancelled.status, cancelled.cancellationReason], ['cancelled', 'Passenger account suspended']);
  now += 365 * 24 * 3600000;
  const refused = await login();
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /permanently disabled/);
  const again = (fields) => request('/register/code', null, { password: 'strong-password', firstName: 'New', lastName: 'Name', role: 'passenger', ...fields });
  assert.equal((await again({ phone: `0917${sequence++}`, email: passenger.user.email })).body.error, 'This mobile number or email cannot be used to create an account.');
  await backend.models.User.deleteOne({ _id: passenger.user.id });
  assert.equal((await again({ phone: passenger.user.phone, email: 'fresh-start@example.com' })).status, 403, 'the number is blocked even after the account is gone');
  assert.equal((await again({ phone: `0917${sequence++}`, email: passenger.user.email })).status, 403, 'and so is the email');
  await request('/driver/availability', driver.token, { available: false });
});

test('a rating whose average update fails is taken back, so rating again works', async () => {
  const passenger = await account(), driver = await account('driver');
  await online(driver);
  const ride = (await book(passenger)).body.ride;
  const offer = (await state(driver)).offer;
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });
  for (const step of ['arrive', 'start', 'complete']) await action(driver, ride.id, step);
  const { User } = backend.models, updateOne = User.updateOne;
  User.updateOne = function failOnce() { User.updateOne = updateOne; throw new Error('connection lost'); };
  const quiet = console.error; console.error = () => {};
  try {
    assert.equal((await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 4 })).status, 500);
  } finally { User.updateOne = updateOne; console.error = quiet; }
  assert.equal(await backend.models.Rating.countDocuments({ rideId: ride.id }), 0, 'nothing half-saved');
  assert.equal((await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 4 })).status, 200, 'the retry is accepted');
  assert.deepEqual((await state(driver)).user.rating, { average: 4, count: 1 });
  await request('/driver/availability', driver.token, { available: false });
});

// A booked ride accepted by the driver, with helpers for its chat.
async function acceptedChat() {
  const passenger = await account(), driver = await account('driver');
  await online(driver);
  const ride = (await book(passenger)).body.ride, offer = (await state(driver)).offer;
  const messages = (who) => request(`/rides/${ride.id}/messages`, who.token);
  const send = (who, body) => request(`/rides/${ride.id}/messages`, who.token, { clientId: randomUUID(), ...body });
  return { passenger, driver, ride, offer, messages, send };
}

test('the passenger and the driver chat live once the trip is accepted, and no one else can read it', async () => {
  const { passenger, driver, ride, offer, messages, send } = await acceptedChat();
  const stranger = await account();
  const events = { passenger: [], driver: [], stranger: [] };
  for (const [name, who] of Object.entries({ passenger, driver, stranger })) {
    const socket = await connect(who.token);
    socket.on('chat:message', (event) => events[name].push(['message', event]));
    socket.on('chat:read', (event) => events[name].push(['read', event]));
  }
  assert.equal((await send(passenger, { text: 'Hello?' })).status, 409, 'no chat before a driver accepts');
  assert.equal((await messages(driver)).status, 403, 'the offered driver cannot read it yet');
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });

  const hello = await send(passenger, { text: '  Nasa blue gate po ako  ' });
  assert.equal(hello.status, 200, JSON.stringify(hello.body));
  assert.deepEqual([hello.body.message.text, hello.body.message.senderRole, hello.body.message.readAt], ['Nasa blue gate po ako', 'passenger', null]);
  assert.equal((await send(driver, { preset: 'imHere' })).body.message.preset, 'imHere');
  assert.equal((await send(passenger, { preset: 'imHere' })).status, 400, "a driver's quick reply");
  assert.equal((await send(stranger, { text: 'Hi' })).status, 403);
  assert.equal((await messages(stranger)).status, 403);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(events.driver.map(([, event]) => event.message.text ?? event.message.preset), ['Nasa blue gate po ako', 'imHere']);
  assert.ok(events.driver.every(([, event]) => event.rideId === ride.id));
  assert.equal(events.passenger.length, 2, "the sender's own phones stay in step too");
  assert.equal(events.stranger.length, 0);

  // A retried send (the same clientId) is saved and delivered once.
  const retry = { clientId: randomUUID(), text: 'Papunta na ako' };
  const first = await request(`/rides/${ride.id}/messages`, driver.token, retry);
  const again = await request(`/rides/${ride.id}/messages`, driver.token, retry);
  assert.equal(again.body.message.id, first.body.message.id);
  const chat = (await messages(passenger)).body;
  assert.equal(chat.open, true);
  assert.deepEqual(chat.messages.map((message) => message.text ?? message.preset), ['Nasa blue gate po ako', 'imHere', 'Papunta na ako']);

  // Unread until the recipient opens the chat; then the sender sees it was read.
  assert.equal((await state(passenger)).ride.unreadMessages, 2);
  assert.equal((await state(driver)).ride.unreadMessages, 1);
  assert.equal((await request(`/rides/${ride.id}/messages/read`, passenger.token, {})).status, 200);
  assert.equal((await state(passenger)).ride.unreadMessages, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const read = events.driver.find(([kind]) => kind === 'read')?.[1];
  assert.deepEqual([read?.rideId, read?.readerId], [ride.id, passenger.user.id]);
  const seen = (await messages(driver)).body.messages;
  assert.ok(seen.filter((message) => message.senderRole === 'driver').every((message) => message.readAt), "the driver's messages are read");
  assert.equal(seen.find((message) => message.senderRole === 'passenger').readAt, null, "the passenger's message is not read yet");

  // After the trip the chat stays readable but takes no new messages.
  for (const step of ['arrive', 'start', 'complete']) await action(driver, ride.id, step);
  assert.match((await send(driver, { text: 'Salamat!' })).body.error, /chat is closed/);
  const after = (await messages(passenger)).body;
  assert.deepEqual([after.open, after.messages.length], [false, 3]);
  assert.equal((await state(driver)).lastRide.unreadMessages, 1, 'the unread count stays with the last trip');
  await request('/driver/availability', driver.token, { available: false });
});

test('chat sending is limited per person, a trip chat has a size cap, and messages expire', async () => {
  const { passenger, driver, ride, offer, messages, send } = await acceptedChat();
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });
  for (let index = 0; index < SEND_LIMIT; index += 1) assert.equal((await send(passenger, { text: `Message ${index}` })).status, 200);
  assert.equal((await send(passenger, { text: 'One more' })).status, 429);
  assert.equal((await send(driver, { preset: 'onMyWay' })).status, 200, 'the limit is per person');
  now += SEND_WINDOW_MS + 1;
  assert.equal((await send(passenger, { text: 'After a pause' })).status, 200);

  // Fill the chat to its cap with older messages.
  const sent = SEND_LIMIT + 2, sentAt = new Date(now - 3600000);
  await backend.models.Message.insertMany(Array.from({ length: MAX_MESSAGES_PER_RIDE - sent }, () => ({
    rideId: ride.id, senderId: driver.user.id, recipientId: passenger.user.id, senderRole: 'driver', clientId: randomUUID(), text: 'Filler', sentAt,
  })));
  assert.match((await send(driver, { text: 'Too many' })).body.error, /chat is full/);
  assert.equal((await messages(passenger)).body.messages.length, MAX_MESSAGES_PER_RIDE);

  const indexes = await backend.models.Message.collection.indexes();
  const expiry = indexes.find((index) => index.expireAfterSeconds !== undefined);
  assert.deepEqual([expiry.key, expiry.expireAfterSeconds], [{ sentAt: 1 }, MESSAGE_RETENTION_DAYS * 24 * 3600]);
  await action(passenger, ride.id, 'cancel');
  await request('/driver/availability', driver.token, { available: false });
});

test('pilot admins can read a trip chat only after a safety report on that trip', async () => {
  const { passenger, driver, ride, offer, send } = await acceptedChat();
  await action(driver, ride.id, 'accept', { offerId: offer.offerId });
  await send(passenger, { text: 'Please slow down' });
  for (const step of ['arrive', 'start', 'complete']) await action(driver, ride.id, step);
  // The God view test registered the admin earlier in this run.
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  const transcript = (who) => request(`/admin/rides/${ride.id}/messages`, who.token);
  assert.equal((await transcript(passenger)).status, 403, 'not an admin');
  assert.equal((await transcript(admin)).status, 403, 'no safety report yet');
  await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 2, tags: ['Rude'] });
  assert.equal((await transcript(admin)).status, 403, 'a low rating is not a safety report');
  await request(`/rides/${ride.id}/report`, driver.token, { reason: 'unsafe', details: 'Shouted at me' });
  const shown = await transcript(admin);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  assert.deepEqual(shown.body.messages.map((message) => [message.senderRole, message.text]), [['passenger', 'Please slow down']]);
  assert.equal((await request('/admin/rides/not-a-ride/messages', admin.token)).status, 404);
  await request('/driver/availability', driver.token, { available: false });
});

test('offensive words are hidden in chat, notes and ratings, each one warns the sender, and offensive names are refused', async () => {
  const passenger = await account(), driver = await account('driver');
  await online(driver);
  const booked = await request('/rides', passenger.token, { trip: DEFAULT_TRIP, passengers: 1, note: 'bilisan mo gago', idempotencyKey: randomUUID() });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  assert.equal(booked.body.censored, true);
  const ride = booked.body.ride;
  assert.equal((await state(driver)).offer.note, 'bilisan mo g***', 'the driver sees the hidden note');
  await action(driver, ride.id, 'accept', { offerId: (await state(driver)).offer.offerId });

  const send = (who, text) => request(`/rides/${ride.id}/messages`, who.token, { clientId: randomUUID(), text });
  const rude = await send(driver, 'Nasaan ka na, t4nga?');
  assert.equal(rude.status, 200, JSON.stringify(rude.body));
  assert.deepEqual([rude.body.message.text, rude.body.censored], ['Nasaan ka na, t****?', true]);
  const polite = await send(passenger, 'Papunta na po, salamat!');
  assert.deepEqual([polite.body.message.text, polite.body.censored], ['Papunta na po, salamat!', undefined]);
  const saved = (await request(`/rides/${ride.id}/messages`, passenger.token)).body.messages.map(({ text }) => text);
  assert.ok(!saved.some((text) => /t4nga/.test(text)), 'only the hidden text is stored');

  for (const step of ['arrive', 'start', 'complete']) await action(driver, ride.id, step);
  const rated = await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 2, comment: 'Ang bastos, bullshit' });
  assert.equal(rated.status, 200, JSON.stringify(rated.body));
  assert.equal(rated.body.censored, true);
  assert.equal(rated.body.ride.myRating.comment, 'Ang bastos, b*******');

  const users = await backend.models.User.find({ _id: { $in: [passenger.user.id, driver.user.id] } }).select('languageWarnings').lean();
  const warnings = Object.fromEntries(users.map((user) => [String(user._id), user.languageWarnings]));
  assert.deepEqual([warnings[passenger.user.id], warnings[driver.user.id]], [2, 1], 'note and rating; one chat message');

  assert.equal((await request('/me', passenger.token, { firstName: 'Juan', lastName: 'Gago', email: passenger.user.email }, 'PATCH')).body.error, 'Please use a respectful name.');
  const email = `rude-${sequence}@example.com`;
  const signup = await request('/register/code', null, { phone: `0917${sequence++}`, password: 'strong-password', firstName: 'Putangina', lastName: 'Cruz', email, role: 'passenger' });
  assert.deepEqual([signup.status, signup.body.error], [400, 'Please use a respectful name.']);
  assert.equal(emailedCodes.has(email), false);
  await request('/driver/availability', driver.token, { available: false });
});
