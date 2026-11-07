const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { io } = require('socket.io-client');
const { createBackend } = require('../indang-trike-backend/app');
const { ADMIN_CANCELLATION } = require('../indang-trike-backend/admin');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { findToda } = require('../data/todaZones');
const { fareTotal, quoteTrip } = require('../data/fares');
const { getRoadGraph } = require('../data/roadNetwork');
const { calculateRoute } = require('../utils/roadGraph');
const { SEND_LIMIT, SEND_WINDOW_MS } = require('../indang-trike-backend/chat');
const { MAX_MESSAGES_PER_RIDE, MESSAGE_RETENTION_DAYS } = require('../utils/chat');
const bcrypt = createRequire(require.resolve('../indang-trike-backend/package.json'))('bcryptjs');

let backend, base, sequence = 1000000;
let now = Date.now();
const sockets = [];
// Atlas allows database names of at most 38 bytes.
const dbName = `indang_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
// The superadmin's number; the God view test makes the account a superadmin,
// and later tests log in with it.
const adminPhone = '09179999999';
// Stands in for Brevo: the last code emailed to each address, and every
// notice to a driver about an admin's decision.
const emailedCodes = new Map(), notices = [];
const sendEmail = async ({ to, code, ...notice }) => { if (code) emailedCodes.set(to, code); else notices.push({ to, ...notice }); };
const fix = (latitude = 14.197805) => ({ latitude, longitude: 120.881639, accuracy: 5, timestamp: now, speed: 0, heading: 0 });

before(async () => {
  const mongoRoot = process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017';
  backend = await createBackend({ mongoUri: `${mongoRoot}/${dbName}`, clock: () => now, sendEmail });
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

test('the separate God view website may call the API, but every overview needs a superadmin', async () => {
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
  // The number that was once on GOD_VIEW_ADMIN_PHONES grants nothing now:
  // only the superadmin role, set in the database, does.
  const admin = await account('passenger', adminPhone);
  assert.deepEqual(await request('/admin/overview', admin.token), { status: 403, body: { error: 'This account does not have admin access.' } });
  await backend.models.User.updateOne({ _id: admin.user.id }, { $set: { role: 'superadmin' } });
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

// As one is added in Atlas (or by the local scripts): the password as a bcrypt
// hash, the role, and for an admin their TODA, in whatever spelling. Staff
// are seeded with no email (for now an admin too).
async function staffAccount(role, fields = {}) {
  const phone = `0917${sequence++}`;
  await backend.models.User.collection.insertOne({ phone: `+63${phone.slice(1)}`, password: await bcrypt.hash('strong-password', 10),
    firstName: 'Staff', lastName: role === 'superadmin' ? 'Super' : 'Officer',
    role, createdAt: new Date(now), updatedAt: new Date(now), ...fields });
  const login = await request('/login', null, { phone, password: 'strong-password' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return login.body;
}
// Every God view request, for superadmins only.
const GOD_VIEW = [['/admin/overview'], ['/admin/map'], ['/admin/todas'], ['/admin/reports'], ['/admin/fares'], ['/admin/fares', { changes: [] }],
  ['/admin/accounts/0123456789abcdef01234567'], ['/admin/rides/0123456789abcdef01234567/messages'], ['/admin/rides/0123456789abcdef01234567/cancel', {}],
  ['/admin/reports/0123456789abcdef01234567/uphold', {}], ['/admin/reports/0123456789abcdef01234567/dismiss', {}], ['/admin/no-such-page']];

test('an admin of a TODA logs in on the app login, uses the app\'s admin screens but not God view, and cannot ride', async () => {
  const admin = await staffAccount('admin', { toda: 'BCITODA' });
  assert.equal(admin.user.role, 'admin');
  assert.equal(admin.user.toda, 'BCITODA');
  assert.equal(admin.user.profileComplete, true);
  assert.equal((await request('/state', admin.token)).status, 200);
  // The app's live link makes the admin present, but staff are not shown among the riders.
  const socket = await connect(admin.token);
  const superadmin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  const watcher = await connect(superadmin.token);
  const overview = await request('/admin/overview', superadmin.token);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.users.some(item => [admin.user.id, superadmin.user.id].includes(item.id)), false);
  for (const path of ['/admin/dashboard', '/admin/accounts', '/admin/trips', '/admin/approvals']) assert.equal((await request(path, admin.token)).status, 200, path);
  for (const [path, body] of GOD_VIEW) {
    assert.deepEqual(await request(path, admin.token, body), { status: 403, body: { error: "God view is for superadmins. Manage your TODA's drivers in the IndangGO app." } }, path);
  }
  // Paths the server reads as the same route reach the same check.
  for (const path of ['/admin/Dashboard', '/admin/dashboard/']) assert.equal((await request(path, admin.token)).status, 200, path);
  for (const path of ['/admin/Overview', '/admin/overview/']) assert.equal((await request(path, admin.token)).status, 403, path);
  // Neither staff role books or drives.
  for (const staff of [admin, superadmin]) {
    assert.equal((await book(staff)).status, 403);
    assert.equal((await request('/passenger/location', staff.token, fix())).status, 403);
    assert.equal((await request('/driver/availability', staff.token, { available: true })).status, 403);
  }
  // A profile edit keeps the role and the TODA, and saves no email.
  assert.equal(admin.user.email, '');
  const edited = await request('/me', admin.token, { firstName: 'Staff', lastName: 'Officer', email: 'officer@example.com', role: 'superadmin', toda: 'ITODA' }, 'PATCH');
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.deepEqual([edited.body.user.role, edited.body.user.toda, edited.body.user.email, edited.body.user.profileComplete], ['admin', 'BCITODA', '', true]);
  assert.equal((await request('/admin/overview', admin.token)).status, 403, 'still not a superadmin');
  socket.disconnect(); watcher.disconnect();
  // Sign-up cannot make either staff role.
  for (const role of ['admin', 'superadmin']) {
    const other = `0917${sequence++}`;
    const signup = await request('/register/code', null, { phone: other, password: 'strong-password', firstName: 'Not', lastName: 'Staff', email: `${other}@example.com`, role });
    assert.equal(signup.status, 400, role);
  }
  await request('/logout', admin.token, {});
  await request('/logout', superadmin.token, {});
});

test('a superadmin seeded with no email signs in, edits its names, and has no Forgot password, nor for now does an admin', async () => {
  const superadmin = await staffAccount('superadmin');
  assert.deepEqual([superadmin.user.role, superadmin.user.email, superadmin.user.profileComplete], ['superadmin', '', true]);
  for (const path of ['/admin/overview', '/admin/dashboard']) assert.equal((await request(path, superadmin.token)).status, 200, path);
  // A profile edit needs no email, and one sent is not saved.
  for (const body of [{ firstName: 'Pilot', lastName: 'Super' }, { firstName: 'Pilot', lastName: 'Super', email: 'someone@example.com' }]) {
    const edited = await request('/me', superadmin.token, body, 'PATCH');
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const { firstName, email, role, profileComplete } = edited.body.user;
    assert.deepEqual({ firstName, email, role, profileComplete }, { firstName: 'Pilot', email: '', role: 'superadmin', profileComplete: true });
  }
  assert.equal((await backend.models.User.findById(superadmin.user.id).lean()).email, '');
  // Forgot password answers its number exactly as a number no account uses,
  // and so it does for the superadmin made earlier with an email (adminPhone),
  // and for now for a TODA admin, with no email or one left from before.
  const legacy = await backend.models.User.findOne({ phone: `+63${adminPhone.slice(1)}` }).lean();
  assert.equal(legacy.role, 'superadmin');
  assert.ok(legacy.email, 'made from a signed-up account, so it has an email');
  const officer = await staffAccount('admin', { toda: 'BCITODA' });
  const oldOfficer = await staffAccount('admin', { toda: 'ITODA', email: 'old.officer@example.com' });
  assert.deepEqual([officer.user.email, officer.user.profileComplete], ['', true]);
  const staff = [superadmin, officer, oldOfficer].map((account) => account.user);
  const attempt = { code: '123456', password: 'a-new-password' };
  for (const path of ['/password/code', '/password/verify', '/password/reset']) {
    const unknown = await request(path, null, { phone: '09189999999', ...attempt });
    assert.deepEqual(unknown, { status: 404, body: { error: 'No account uses this mobile number.' } }, path);
    for (const phone of [...staff.map((user) => user.phone), adminPhone]) assert.deepEqual(await request(path, null, { phone, ...attempt }), unknown, `${path} ${phone}`);
  }
  assert.equal(await backend.models.ResetCode.countDocuments({ userId: { $in: [...staff.map((user) => user.id), legacy._id] } }), 0, 'no code was sent');
  // Every one still signs in with the password they had.
  for (const phone of [...staff.map((user) => user.phone), adminPhone]) {
    const login = await request('/login', null, { phone, password: 'strong-password' });
    assert.equal(login.status, 200, phone);
    await request('/logout', login.body.token, {});
  }
  for (const account of [superadmin, officer, oldOfficer]) await request('/logout', account.token, {});
});

test('an admin without one of Indang\'s TODAs reaches nothing until a superadmin assigns one', async () => {
  const unassigned = await staffAccount('admin');
  const NO_TODA = { error: 'This admin account is not assigned to a TODA yet. Ask a superadmin to assign one.' };
  for (const [path, body] of [['/admin/dashboard'], ['/admin/accounts'], ['/admin/approvals'], ['/admin/overview'], ['/admin/drivers/0123456789abcdef01234567/approve', {}]]) {
    assert.deepEqual(await request(path, unassigned.token, body), { status: 403, body: NO_TODA }, path);
  }
  // A TODA that is not Indang's counts as none.
  await backend.models.User.updateOne({ _id: unassigned.user.id }, { $set: { toda: 'Pilot TODA' } });
  assert.deepEqual(await request('/admin/dashboard', unassigned.token), { status: 403, body: NO_TODA });
  // Assigned one, the same session works at once.
  await backend.models.User.updateOne({ _id: unassigned.user.id }, { $set: { toda: 'ITODA' } });
  assert.equal((await request('/admin/dashboard', unassigned.token)).status, 200);
  // A role typed wrong in Atlas grants nothing.
  await backend.models.User.updateOne({ _id: unassigned.user.id }, { $set: { role: 'SuperAdmin' } });
  assert.deepEqual(await request('/admin/dashboard', unassigned.token), { status: 403, body: { error: 'This account does not have admin access.' } });
  await backend.models.User.deleteOne({ _id: unassigned.user.id });
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

  for (const path of ['/admin/dashboard', '/admin/accounts', '/admin/todas', '/admin/trips']) assert.equal((await request(path, passenger.token)).status, 403, path);
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
  assert.equal(total, await backend.models.User.countDocuments(), 'a superadmin gets every account');
  assert.deepEqual(accounts.find((item) => item.key === passenger.user.id),
    { key: passenger.user.id, id: passenger.user.phone.replace('+63', '0'), name: 'Test passenger', email: passenger.user.email, role: 'PASSENGER', status: 'Offline', languageWarnings: 0 });
  assert.deepEqual(accounts.find((item) => item.key === driver.user.id),
    { key: driver.user.id, id: driver.user.phone.replace('+63', '0'), name: 'Test driver', email: driver.user.email, role: 'RIDER', status: 'Online', languageWarnings: 0, toda: 'Test TODA', plate: driver.user.plate, approval: 'Approved' });
  // Staff accounts (the admins added earlier in this run, and the superadmins)
  // are listed too, after everyone else, for the Admins filter: a superadmin
  // as SUPERADMIN, an admin as ADMIN with the Indang TODA they manage.
  const staff = await backend.models.User.find({ role: { $in: ['admin', 'superadmin'] } }).sort({ createdAt: -1, _id: -1 }).lean();
  assert.ok(staff.some((user) => user.role === 'admin') && staff.some((user) => String(user._id) === admin.user.id));
  assert.deepEqual(accounts.slice(-staff.length).map((item) => item.key), staff.map((user) => String(user._id)), 'the staff, newest first, come last');
  assert.ok(accounts.slice(0, -staff.length).every((item) => ['PASSENGER', 'RIDER'].includes(item.role)));
  const listed = (user) => accounts.find((item) => item.key === String(user._id));
  for (const user of staff) {
    if (user.role === 'superadmin') assert.equal(listed(user).role, 'SUPERADMIN');
    else assert.deepEqual([listed(user).role, listed(user).toda], ['ADMIN', findToda(user.toda)?.name || ''], user.toda);
  }
  const self = listed({ _id: admin.user.id });
  assert.deepEqual([self.id, self.role, self.status], [adminPhone, 'SUPERADMIN', 'Offline']);
  assert.deepEqual(Object.keys(self).sort(), ['email', 'id', 'key', 'languageWarnings', 'name', 'role', 'status'], 'no password or other secrets');

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
  // Staff accounts never ride, so they have no trip history to show.
  for (const id of [...staff.map((user) => String(user._id)), '0123456789abcdef01234567', 'not-an-id']) assert.equal((await request(`/admin/accounts/${id}`, admin.token)).status, 404, id);

  const dashboard = (await request('/admin/dashboard', admin.token)).body;
  // The Dashboard counts the people using the service: staff are not among them.
  assert.deepEqual(dashboard, { totalAccounts: accounts.filter((item) => ['PASSENGER', 'RIDER'].includes(item.role)).length, onlineNow: 1, ongoingTrips: 1, recentTrips: trips.slice(0, 3), pendingDrivers: await backend.models.User.countDocuments({ role: 'driver', approval: 'pending' }) });

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

test('an admin sees and manages only the drivers of their TODA, and a superadmin every driver', async () => {
  const superadmin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  // Drivers of two of Indang's TODAs, saved in the spellings hand edits and
  // older data use, and one of a TODA not on Indang's list.
  async function driverOf(toda, approved) {
    const driver = await account('driver', undefined, { approved });
    await backend.models.User.updateOne({ _id: driver.user.id }, { $set: { toda } });
    return driver;
  }
  const bci = await driverOf('BCITODA', true), bciPending = await driverOf('bci toda', false);
  const itodaPending = await driverOf('ITODA PITODA', false), other = await driverOf('Test TODA', false);
  const passenger = await account(), rider = await account();
  const ride = (passengerId, driverId, status, extra = {}) => backend.models.Ride.create({
    passengerId, driverId, idempotencyKey: randomUUID(), status, active: false, trip: DEFAULT_TRIP, passengers: 1, fare: 50, ...extra });
  const bciTrip = await ride(passenger.user.id, bci.user.id, 'completed');
  const otherTrip = await ride(passenger.user.id, other.user.id, 'completed');
  const ongoing = await ride(rider.user.id, bci.user.id, 'in_progress', { active: true, driverSlot: bci.user.id });
  // The admin's TODA as typed by hand.
  const admin = await staffAccount('admin', { toda: 'bci toda' });
  const keys = (list) => list.map((item) => item.key).sort();
  const NOT_FOUND = { status: 404, body: { error: 'No driver has this ID.' } };

  // Every list and count covers BCITODA's drivers and their trips, and no passenger.
  const accounts = (await request('/admin/accounts', admin.token)).body;
  assert.deepEqual(keys(accounts.accounts), [bci.user.id, bciPending.user.id].sort());
  assert.equal(accounts.total, 2);
  assert.ok(accounts.accounts.every((item) => item.role === 'RIDER' && item.toda === 'BCITODA'));
  assert.deepEqual(keys((await request('/admin/approvals', admin.token)).body.drivers), [bciPending.user.id]);
  assert.deepEqual(keys((await request('/admin/trips', admin.token)).body.trips), [String(bciTrip._id), String(ongoing._id)].sort());
  const live = await connect(bci.token);
  const dashboard = (await request('/admin/dashboard', admin.token)).body;
  assert.deepEqual({ ...dashboard, recentTrips: dashboard.recentTrips.map((trip) => trip.key) },
    { totalAccounts: 2, onlineNow: 1, ongoingTrips: 1, recentTrips: [String(ongoing._id), String(bciTrip._id)], pendingDrivers: 1 });

  // Another TODA's driver, a driver of no listed TODA, or a passenger is not
  // found for this admin, to view or to decide on, and stays as it was.
  for (const id of [itodaPending.user.id, other.user.id, passenger.user.id]) {
    assert.deepEqual(await request(`/admin/drivers/${id}`, admin.token), NOT_FOUND, id);
    for (const decision of ['approve', 'decline', 'terminate', 'delete', 'unblock']) {
      assert.deepEqual(await request(`/admin/drivers/${id}/${decision}`, admin.token, {}), NOT_FOUND, `${decision} ${id}`);
    }
  }
  const untouched = await backend.models.User.findById(itodaPending.user.id).lean();
  assert.deepEqual([untouched.approval, untouched.disabled, untouched.terminatedAt], ['pending', false, undefined]);
  assert.ok(await backend.models.User.exists({ _id: other.user.id }));

  // Their own drivers they approve, suspend, unblock and decline as before.
  assert.equal((await request(`/admin/drivers/${bciPending.user.id}`, admin.token)).body.driver.toda, 'BCITODA');
  const approved = await request(`/admin/drivers/${bciPending.user.id}/approve`, admin.token, {});
  assert.deepEqual([approved.status, approved.body.driver.approval], [200, 'Approved'], JSON.stringify(approved.body));
  assert.deepEqual(await request(`/admin/drivers/${bciPending.user.id}/approve`, admin.token, {}), { status: 409, body: { error: 'This driver is no longer waiting for approval.' } });
  assert.equal((await request(`/admin/drivers/${bciPending.user.id}/terminate`, admin.token, { reason: 'Not on the list' })).status, 200);
  assert.equal((await request(`/admin/drivers/${bciPending.user.id}/unblock`, admin.token, {})).status, 200);
  assert.equal((await request(`/admin/drivers/${bciPending.user.id}/decline`, admin.token, {})).status, 200);
  assert.equal(await backend.models.User.exists({ _id: bciPending.user.id }), null);

  // Profile pictures: their drivers' only; a superadmin's, anyone's.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 1]);
  await backend.models.User.updateMany({ _id: { $in: [bci.user.id, other.user.id] } }, { $set: { photo: jpeg, photoAt: new Date(now) } });
  const photo = async (id, token) => (await fetch(`${base}/api/users/${id}/photo`, { headers: { Authorization: `Bearer ${token}` } })).status;
  assert.deepEqual([await photo(bci.user.id, admin.token), await photo(other.user.id, admin.token)], [200, 404]);
  assert.deepEqual([await photo(bci.user.id, superadmin.token), await photo(other.user.id, superadmin.token)], [200, 200]);

  // A superadmin moves the admin to ITODA: the same session sees ITODA's
  // drivers at once, one saved under its former name too, and BCITODA's no more.
  await backend.models.User.updateOne({ _id: admin.user.id }, { $set: { toda: 'ITODA' } });
  assert.deepEqual(keys((await request('/admin/approvals', admin.token)).body.drivers), [itodaPending.user.id]);
  assert.deepEqual(await request(`/admin/drivers/${bci.user.id}`, admin.token), NOT_FOUND);

  // A superadmin sees and decides on every driver, a listed TODA's or not.
  const everyone = keys((await request('/admin/accounts', superadmin.token)).body.accounts);
  for (const id of [bci.user.id, itodaPending.user.id, other.user.id, passenger.user.id]) assert.ok(everyone.includes(id), id);
  assert.ok(keys((await request('/admin/trips', superadmin.token)).body.trips).includes(String(otherTrip._id)));
  assert.equal((await request(`/admin/drivers/${other.user.id}/approve`, superadmin.token, {})).status, 200);

  // A passenger made staff after being reported is not penalized for it.
  const reported = await account();
  const report = await backend.models.Report.create({ rideId: String(otherTrip._id), reporterId: other.user.id, passengerId: reported.user.id, reason: 'fake_booking' });
  await backend.models.User.updateOne({ _id: reported.user.id }, { $set: { role: 'superadmin' } });
  assert.deepEqual(await request(`/admin/reports/${report._id}/uphold`, superadmin.token, {}),
    { status: 409, body: { error: 'The reported account is now a staff account. Dismiss this report instead.' } });
  assert.equal((await backend.models.User.findById(reported.user.id)).offenses, 0, 'no penalty');
  assert.equal((await request(`/admin/reports/${report._id}/dismiss`, superadmin.token, {})).status, 200);

  live.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 40));
  await backend.models.Ride.deleteMany({ _id: { $in: [bciTrip._id, otherTrip._id, ongoing._id] } });
  await backend.models.Report.deleteOne({ _id: report._id });
  await backend.models.User.deleteMany({ _id: { $in: [bci.user.id, itodaPending.user.id, other.user.id, passenger.user.id, rider.user.id, reported.user.id, admin.user.id] } });
  await request('/logout', superadmin.token, {});
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
  // The taripa's special fare for the default trip on its road route, day or
  // night by the server clock.
  const { route } = calculateRoute(getRoadGraph().graph, DEFAULT_TRIP.pickup.coordinate, DEFAULT_TRIP.dropoff.coordinate);
  const fare = quoteTrip({ pickup: DEFAULT_TRIP.pickup.coordinate, dropoff: DEFAULT_TRIP.dropoff.coordinate, route: route.coordinates, at: now }).special.fare;
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

test('a driver stays online when the phone disconnects or loses GPS, and gets requests again on reconnecting', async () => {
  const passenger = await account(), driver = await account('driver');
  const socket = await connect(driver.token);
  assert.equal((await request('/driver/location', driver.token, fix())).status, 200);
  assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 200);
  socket.disconnect();
  await new Promise(resolve => setTimeout(resolve, 100));
  await request('/driver/location/unavailable', driver.token, { reason: 'stale' });
  assert.equal((await state(driver)).user.available, true);
  const booked = await book(passenger);
  assert.equal((await state(driver)).offer, null, 'no request while the phone is away');
  await connect(driver.token);
  now += 1000;
  assert.equal((await request('/driver/location', driver.token, fix())).status, 200);
  assert.equal((await state(driver)).offer?.id, booked.body.ride.id);
  await action(passenger, booked.body.ride.id, 'cancel');
  // Logging out is going offline.
  assert.equal((await request('/logout', driver.token, {})).status, 200);
  assert.equal((await backend.models.User.findById(driver.user.id)).available, false);
});

test('a profile picture is shown to its owner and to the other person on a trip, and can be removed', async () => {
  const passenger = await account(), driver = await account('driver'), stranger = await account();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const photo = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  const fetchPhoto = (viewer, owner) => fetch(`${base}/api/users/${owner.user.id}/photo`, { headers: { Authorization: `Bearer ${viewer.token}` } });

  assert.equal((await request('/me/photo', passenger.token, { photo: 'data:image/png;base64,iVBORw0KGgo=' }, 'PUT')).status, 400);
  const tooLarge = `data:image/jpeg;base64,${Buffer.concat([jpeg, Buffer.alloc(160 * 1024)]).toString('base64')}`;
  assert.equal((await request('/me/photo', passenger.token, { photo: tooLarge }, 'PUT')).status, 413);
  const saved = await request('/me/photo', passenger.token, { photo }, 'PUT');
  assert.equal(saved.status, 200);
  assert.ok(saved.body.user.photoAt);

  const own = await fetchPhoto(passenger, passenger);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await own.arrayBuffer()), jpeg);
  assert.equal((await fetchPhoto(stranger, passenger)).status, 404, 'a stranger cannot see it');

  // The driver offered the booking sees it, along with its photoAt on the offer.
  await online(driver);
  const booked = await book(passenger);
  const offer = (await state(driver)).offer;
  assert.equal(offer.passenger.photoAt, saved.body.user.photoAt);
  assert.equal((await fetchPhoto(driver, passenger)).status, 200);
  await action(passenger, booked.body.ride.id, 'cancel');
  await request('/driver/availability', driver.token, { available: false });

  assert.equal((await request('/me/photo', passenger.token, { photo: null }, 'PUT')).body.user.photoAt, null);
  assert.equal((await fetchPhoto(passenger, passenger)).status, 404);
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
  backend = await createBackend({ mongoUri: `${process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017'}/${dbName}`, clock: () => now, sendEmail });
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
  // TARIPA, Purok III from Indang by day: ₱34 for two passengers, ₱15 for the third.
  now = Date.UTC(2026, 9, 2, 2, 0); // 10:00 AM in the Philippines
  const day = await book({ fareAreas: { dropoff: 'bancod-purok-1' } });
  assert.equal(day.status, 201, JSON.stringify(day.body));
  assert.equal(day.body.ride.fare, 34 + 15, 'the fare the app sent is ignored');
  assert.equal(day.body.ride.fareDetails.type, 'special');
  assert.equal((await action(passenger, day.body.ride.id, 'cancel')).status, 200);
  // A special trip at night: ₱39 for two passengers, ₱15 for the third.
  now = Date.UTC(2026, 9, 2, 14, 0); // 10:00 PM in the Philippines
  const special = await book({ fareType: 'special' });
  assert.equal(special.status, 201, JSON.stringify(special.body));
  assert.equal(special.body.ride.fare, 39 + 15);
  assert.equal(special.body.ride.fareDetails.night, true);
  assert.equal((await action(passenger, special.body.ride.id, 'cancel')).status, 200);
  // Every trip is a special trip: an older app asking for a regular one is refused.
  const noRegular = await book({ fareType: 'regular', discounted: 1 });
  assert.equal(noRegular.status, 400);
  // A trip through the town pays both barangays' fares: Alulod (₱35) and Pulo (₱75).
  now = Date.UTC(2026, 9, 2, 2, 0);
  const alulod = { name: 'Alulod Elementary School', coordinate: { latitude: 14.20623, longitude: 120.88944 } };
  const pulo = { name: 'Pulo', coordinate: { latitude: 14.16990, longitude: 120.87269 } };
  const across = await request('/rides', passenger.token, { trip: { pickup: alulod, dropoff: pulo }, passengers: 1, note: '',
    idempotencyKey: randomUUID() });
  assert.equal(across.status, 201, JSON.stringify(across.body));
  assert.equal(across.body.ride.fare, 35 + 75);
  assert.equal((await action(passenger, across.body.ride.id, 'cancel')).status, 200);
  now = Date.now();
});

test('fares changed in God view are charged on new bookings, sent to the app, and survive a restart; only admins change them', async () => {
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  const ordinary = await account(), passenger = await account();
  const purok3Night = 'area/bancod-purok-3/special/poblacion/night', purok3Day = 'area/bancod-purok-3/special/poblacion/day';
  const save = (changes, token = admin.token) => request('/admin/fares', token, { changes });
  try {
    // Only God view admins see or change fares.
    assert.equal((await request('/admin/fares', ordinary.token)).status, 403);
    assert.equal((await save([{ key: purok3Night, from: 39, to: 45 }], ordinary.token)).status, 403);
    const sheet = (await request('/admin/fares', admin.token)).body;
    assert.equal(sheet.prices[purok3Night], 39);
    assert.deepEqual(sheet.prices, sheet.taripa);
    assert.deepEqual(sheet.limits, { min: 1, max: 1000 });
    assert.deepEqual(sheet.todas.find((toda) => toda.name === 'BITODA').groups, ['bancod-purok-1', 'bancod-purok-2', 'bancod-purok-3', 'bancod-purok-4', 'bancod-purok-5']);
    assert.equal(sheet.todas.find((toda) => toda.name === 'ITODA').wholeTown, true);
    assert.equal(sheet.updatedAt, null);
    const config = (await request('/config', passenger.token)).body;
    assert.equal(config.fare, 45);
    assert.equal(config.fares.revision, sheet.revision);
    assert.deepEqual(config.fares.prices, sheet.prices);
    assert.equal((await state(passenger)).fareRevision, sheet.revision);

    // What cannot be saved.
    for (const [changes, why] of [
      [[], 'nothing changed'], [[{ key: 'area/nowhere/special/poblacion/day', from: 1, to: 2 }], 'not on the taripa'],
      [[{ key: '__proto__', from: 1, to: 2 }], 'not a fare'], [[{ key: purok3Night, from: 39, to: 0 }], 'free'],
      [[{ key: purok3Night, from: 39, to: 40.555 }], 'more than two decimal places'], [[{ key: purok3Night, from: 39, to: '40' }], 'text'],
      [[{ key: purok3Night, from: 39, to: 1001 }], 'over the limit'], [[{ key: purok3Night, to: 40 }], 'no amount on screen'],
      [[{ key: purok3Night, from: 39, to: 40 }, { key: purok3Night, from: 39, to: 41 }], 'listed twice'],
      [[{ key: 'area/bancod-purok-3/regular/poblacion/day/price', from: 17, to: 18 }], 'regular trips are not offered'],
    ]) assert.equal((await save(changes)).status, 400, why);
    assert.equal((await request('/admin/fares', admin.token, { changes: 'all' })).status, 400);
    assert.equal(await backend.models.FareSheet.countDocuments(), 0, 'nothing was saved');

    const saved = await save([{ key: purok3Night, from: 39, to: 45 }, { key: 'extraPassenger', from: 15, to: 20 }, { key: 'flat', from: 45, to: 50 },
      { key: purok3Day, from: 34, to: 36 }]);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.prices[purok3Night], 45);
    assert.equal(saved.body.taripa[purok3Night], 39, 'the taripa stays for comparison');
    assert.equal(saved.body.updatedBy, 'Test passenger');
    assert.ok(saved.body.updatedAt);
    assert.notEqual(saved.body.revision, sheet.revision);
    // A fare someone else changed since the admin's page loaded is not overwritten.
    const stale = await save([{ key: purok3Night, from: 39, to: 50 }]);
    assert.equal(stale.status, 409);
    assert.match(stale.body.error, /Bancod · Purok III, from the poblacion, at night changed since you opened the fares/);
    assert.equal((await request('/admin/fares', admin.token)).body.prices[purok3Night], 45);

    // The app is told, and sent the new fares.
    assert.equal((await state(passenger)).fareRevision, saved.body.revision);
    const updated = (await request('/config', passenger.token)).body;
    assert.equal(updated.fare, 50);
    assert.equal(updated.fares.revision, saved.body.revision);
    assert.equal(updated.fares.prices[purok3Night], 45);

    // A booking is charged the new fares; one the app quoted with the old ones
    // is refused, and an older app that names none is charged the new ones.
    const plaza = { name: 'Indang Town Plaza', coordinate: { latitude: 14.19576, longitude: 120.87849 } };
    const bancod = { name: 'Bancod Purok III', coordinate: { latitude: 14.2186, longitude: 120.87265 } };
    const book = (extra) => request('/rides', passenger.token, { trip: { pickup: plaza, dropoff: bancod }, passengers: 3, note: '', idempotencyKey: randomUUID(), ...extra });
    now = Date.UTC(2026, 9, 2, 14, 0); // 10:00 PM in the Philippines
    const quotedBefore = await book({ fareRevision: sheet.revision });
    assert.equal(quotedBefore.status, 409);
    assert.match(quotedBefore.body.error, /Fares were just updated/);
    assert.equal(await backend.models.Ride.countDocuments({ passengerId: passenger.user.id }), 0);
    const current = await book({ fareRevision: saved.body.revision });
    assert.equal(current.status, 201, JSON.stringify(current.body));
    assert.equal(current.body.ride.fare, 45 + 20, 'the night fare and the extra passenger, as changed');
    assert.equal(current.body.ride.fareDetails.extraFare, 20);
    // The app's own quote, with the prices it was sent, is the fare charged.
    const preview = quoteTrip({ pickup: plaza.coordinate, dropoff: bancod.coordinate, at: now, prices: updated.fares.prices });
    assert.equal(fareTotal(preview, { passengers: 3 }), current.body.ride.fare);
    assert.equal((await action(passenger, current.body.ride.id, 'cancel')).status, 200);
    now = Date.UTC(2026, 9, 2, 2, 0); // 10:00 AM
    // Regular trips stay refused, whatever the fares.
    assert.equal((await book({ fareType: 'regular', discounted: 1 })).status, 400);
    const unnamed = await book({ fareRevision: null });
    assert.equal(unnamed.status, 201, 'no revision named');
    assert.equal(unnamed.body.ride.fare, 36 + 20, 'the day fare and the extra passenger, as changed');
    assert.equal((await action(passenger, unnamed.body.ride.id, 'cancel')).status, 200);

    // The saved fares are in force after a restart.
    await backend.close();
    backend = await createBackend({ mongoUri: `${process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017'}/${dbName}`, clock: () => now, sendEmail });
    await new Promise((resolve) => backend.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${backend.server.address().port}`;
    assert.equal((await request('/config', passenger.token)).body.fares.prices[purok3Night], 45);
    assert.equal((await state(passenger)).fareRevision, saved.body.revision);

    // Fares may have centavos: they are saved, charged and quoted to the centavo.
    const centavos = await save([{ key: purok3Night, from: 45, to: 45.5 }, { key: 'extraPassenger', from: 20, to: 12.25 }]);
    assert.equal(centavos.status, 200, JSON.stringify(centavos.body));
    assert.deepEqual([centavos.body.prices[purok3Night], centavos.body.prices.extraPassenger], [45.5, 12.25]);
    now = Date.UTC(2026, 9, 2, 14, 0); // 10:00 PM in the Philippines
    const decimal = await book({ fareRevision: centavos.body.revision });
    assert.equal(decimal.status, 201, JSON.stringify(decimal.body));
    assert.equal(decimal.body.ride.fare, 57.75, 'the night fare and the extra passenger, with centavos');
    assert.equal(decimal.body.ride.fareDetails.extraFare, 12.25);
    const centavoPrices = (await request('/config', passenger.token)).body.fares.prices;
    assert.equal(fareTotal(quoteTrip({ pickup: plaza.coordinate, dropoff: bancod.coordinate, at: now, prices: centavoPrices }), { passengers: 3 }), 57.75, 'the app quotes the same');
    assert.equal((await action(passenger, decimal.body.ride.id, 'cancel')).status, 200);
    now = Date.UTC(2026, 9, 2, 2, 0); // 10:00 AM

    // A fare set back to the taripa's amount follows the taripa again.
    const reset = await save([{ key: purok3Night, from: 45.5, to: 39 }, { key: 'extraPassenger', from: 12.25, to: 15 }, { key: 'flat', from: 50, to: 45 },
      { key: purok3Day, from: 36, to: 34 }]);
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.deepEqual((await backend.models.FareSheet.findById('current').lean()).prices, {});
    assert.equal(reset.body.revision, sheet.revision, 'the taripa again');
  } finally {
    // The other tests are priced from the taripa.
    await backend.models.FareSheet.deleteMany({});
    await request('/admin/fares', admin.token);
    now = Date.now();
  }
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
  assert.equal(history.some((entry) => 'passenger' in entry), false, "a driver's history never names the passenger");
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
  // God view's TODAs tab lists the driver under the TODA they gave, with their rating.
  const { todas, other } = (await request('/admin/todas', admin.token)).body;
  assert.equal(todas.length, 16);
  const listed = other.drivers.find((item) => item.key === driver.user.id);
  assert.deepEqual([listed.toda, listed.approval, listed.rating], ['Test TODA', 'Approved', { average: 5, count: 1 }]);
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
