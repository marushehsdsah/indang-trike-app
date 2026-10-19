const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');
const { createBackend } = require('../indang-trike-backend/app');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { quoteTrip } = require('../data/fares');

let backend, base, sequence = 1000000;
let now = Date.now();
const sockets = [];
// Atlas allows database names of at most 38 bytes.
const dbName = `indang_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const adminPhone = '09179999999';
// Stands in for Brevo: the last code emailed to each address.
const emailedCodes = new Map();
const sendEmail = async ({ to, code }) => { emailedCodes.set(to, code); };
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
async function account(role = 'passenger', phoneOverride) {
  const phone = phoneOverride || `0917${sequence++}`;
  const result = await signup({
    phone, password: 'strong-password', firstName: 'Test', lastName: role, email: `${phone}@example.com`, role,
    ...(role === 'driver' ? { plate: `TEST-${sequence}`, toda: 'Test TODA', capacity: 4 } : {}),
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const login = await request('/login', null, { phone, password: 'strong-password' });
  assert.equal(login.status, 200);
  return login.body;
}
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
  // Mataas na Lupa has three fare areas on the taripa; the rider names one.
  const booked = await request('/rides', passenger.token, { trip, passengers: 1, note: '', idempotencyKey: randomUUID(),
    fareAreas: { pickup: 'mataas-na-lupa-metrogate' } });
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

test('an Indang TODA driver is offered only trips inside its TODA\'s barangays', async () => {
  // PCHTI-TODA serves Pulo, Carasuchi, Harasan and Tambo Ilaya (TODAs_coordinates.xlsx).
  const place = (name, latitude, longitude) => ({ name, coordinate: { latitude, longitude } });
  const pulo = place('Pulo Barangay Hall', 14.16990, 120.87269), harasan = place('Barangay Harasan', 14.16053, 120.87006);
  const poblacion = place('Poblacion', 14.19558, 120.87956);
  const phone = `0917${sequence++}`;
  const registered = await signup({ phone, password: 'strong-password', firstName: 'Pulo', lastName: 'Driver',
    email: `${phone}@example.com`, role: 'driver', plate: 'PCH-1', toda: 'pchti toda', capacity: 4 });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.user.toda, 'PCHTI-TODA', 'stored under the official name');
  const pchti = (await request('/login', null, { phone, password: 'strong-password' })).body;
  const unzoned = await account('driver'); // "Test TODA": not an Indang TODA, so no barangay limit
  for (const [driver, spot] of [[pchti, pulo], [unzoned, harasan]]) {
    await connect(driver.token);
    assert.equal((await request('/driver/location', driver.token, { ...fix(), ...spot.coordinate })).status, 200);
    assert.equal((await request('/driver/availability', driver.token, { available: true })).status, 200);
  }
  const book = async (dropoff) => {
    const passenger = await account();
    const booked = await request('/rides', passenger.token, { trip: { pickup: pulo, dropoff }, passengers: 1, note: '', idempotencyKey: randomUUID() });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    return { passenger, rideId: booked.body.ride.id };
  };

  const inside = await book(harasan);
  assert.equal((await state(pchti)).offer?.id, inside.rideId, 'Pulo to Harasan: the nearest driver, from PCHTI-TODA');
  await action(inside.passenger, inside.rideId, 'cancel');

  const leaving = await book(poblacion);
  assert.equal((await state(pchti)).offer, null, 'Pulo to Poblacion leaves PCHTI-TODA\'s barangays');
  assert.equal((await state(unzoned)).offer?.id, leaving.rideId, 'a driver without an Indang TODA still gets it');
  await action(leaving.passenger, leaving.rideId, 'cancel');
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

test('a forgotten password is reset with the emailed code and ends every session', async () => {
  const user = await account();
  const email = user.user.email, phone = user.user.phone;
  assert.equal((await request('/password/code', null, { email: 'nobody@example.com' })).status, 200);
  assert.equal(emailedCodes.has('nobody@example.com'), false);
  assert.equal((await request('/password/code', null, { email })).status, 200);
  const code = emailedCodes.get(email);
  assert.equal((await request('/password/verify', null, { email, code })).status, 200);
  const reset = await request('/password/reset', null, { email, code, password: 'a-new-password' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await request('/me', user.token)).status, 401);
  assert.equal((await request('/login', null, { phone, password: 'strong-password' })).status, 401);
  assert.equal((await request('/login', null, { phone, password: 'a-new-password' })).status, 200);
  assert.equal((await request('/password/reset', null, { email, code, password: 'yet-another-one' })).status, 400);
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
  const bancod = { name: 'Bancod Elementary School', coordinate: { latitude: 14.21077, longitude: 120.87758 } };
  const book = (extra) => request('/rides', passenger.token, { trip: { pickup: plaza, dropoff: bancod }, passengers: 3, note: '',
    idempotencyKey: randomUUID(), fare: 1, ...extra });
  // Bancod's puroks have different fares, so the rider must say which one.
  const unchosen = await book({});
  assert.equal(unchosen.status, 400);
  assert.match(unchosen.body.error, /Choose which part of Bancod/);
  // TARIPA, Purok III from Indang by day: ₱17 regular, ₱14 with a student/senior/PWD ID.
  now = Date.UTC(2026, 9, 2, 2, 0); // 10:00 AM in the Philippines
  const regular = await book({ fareType: 'regular', discounted: 1, fareAreas: { dropoff: 'bancod-purok-3' } });
  assert.equal(regular.status, 201, JSON.stringify(regular.body));
  assert.equal(regular.body.ride.fare, 2 * 17 + 14, 'the fare the app sent is ignored');
  assert.equal(regular.body.ride.fareDetails.type, 'regular');
  assert.equal((await action(passenger, regular.body.ride.id, 'cancel')).status, 200);
  // A special trip at night: ₱39 for two passengers, ₱15 for the third.
  now = Date.UTC(2026, 9, 2, 14, 0); // 10:00 PM in the Philippines
  const special = await book({ fareType: 'special', fareAreas: { dropoff: 'bancod-purok-3' } });
  assert.equal(special.status, 201, JSON.stringify(special.body));
  assert.equal(special.body.ride.fare, 39 + 15);
  assert.equal(special.body.ride.fareDetails.night, true);
  assert.equal((await action(passenger, special.body.ride.id, 'cancel')).status, 200);
  // Regular fares exist only on the Bancod routes.
  const alulod = { name: 'Alulod Elementary School', coordinate: { latitude: 14.20623, longitude: 120.88944 } };
  const noRegular = await request('/rides', passenger.token, { trip: { pickup: plaza, dropoff: alulod }, passengers: 1, note: '',
    idempotencyKey: randomUUID(), fareType: 'regular', fareAreas: { dropoff: 'alulod-school' } });
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
  assert.equal((await request(`/rides/${ride.id}/rating`, passenger.token, { stars: 5 })).status, 409, 'not before the ride is completed');
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
  assert.equal((await state(driver)).lastRide.myRating, null, 'the driver has not rated yet');
  // The driver reports a safety concern about the passenger.
  assert.equal((await rate(driver, { stars: 2, tags: ['Did not pay'] })).status, 200);

  assert.deepEqual((await state(driver)).user.rating, { average: 5, count: 1 });
  assert.deepEqual((await state(passenger)).user.rating, { average: 2, count: 1 });
  const history = (await request('/history', driver.token)).body.rides;
  assert.equal(history.find((entry) => entry.id === ride.id).myRating.stars, 2);
  assert.equal(await backend.models.Rating.countDocuments({ rideId: ride.id }), 2);
  assert.equal(await backend.models.Rating.countDocuments({ rideId: ride.id, flagged: true }), 1);

  // On the next booking the driver sees the passenger's average on the offer,
  // and the passenger sees the driver's once accepted.
  const next = (await book(passenger)).body.ride;
  offer = (await state(driver)).offer;
  assert.equal(offer.id, next.id);
  assert.deepEqual(offer.passenger.rating, { average: 2, count: 1 });
  await action(driver, next.id, 'accept', { offerId: offer.offerId });
  assert.deepEqual((await state(passenger)).ride.driver.rating, { average: 5, count: 1 });

  // Admins see both averages and the safety report.
  // The God view test registered the admin earlier in this run.
  const admin = (await request('/login', null, { phone: adminPhone, password: 'strong-password' })).body;
  await connect(passenger.token);
  const people = (await request('/admin/overview', admin.token)).body.users;
  const reported = people.find((person) => person.id === passenger.user.id);
  assert.deepEqual([reported.rating, reported.safetyReports], [{ average: 2, count: 1 }, 1]);
  assert.equal(people.find((person) => person.id === driver.user.id).safetyReports, 0);
  await action(passenger, next.id, 'cancel');
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
