// A local simulation of passenger reports, to try the God view Reports tab:
//
//   node scripts/simulate-reports.js
//
// Starts the API on http://localhost:4100 with its own throwaway database
// (indang_report_sim on the local MongoDB, wiped on every run) and plays out
// real trips through the API: drivers finish or cancel trips and report the
// passenger, and earlier offenses are upheld as if days ago, so each pending
// report shows a different next penalty. Then build God view against it:
//
//   cd web/god-view && GOD_VIEW_API_URL=http://localhost:4100 npm start
//
// and sign in with the simulation admin below. Nothing here touches the real
// database. Stop it with Ctrl+C.
const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');
const { createBackend } = require('../indang-trike-backend/app');
const { DEFAULT_TRIP } = require('../data/indangMap');

const PORT = Number(process.env.PORT) || 4100;
const MONGO = process.env.SIM_MONGO_URL || 'mongodb://127.0.0.1:27017/indang_report_sim';
// Simulation-only accounts. Every one shares this password.
const PASSWORD = 'simulation-only';
const ADMIN_PHONE = '09170000001';
const DAY = 24 * 60 * 60 * 1000;

// The server's clock runs `offset` behind or ahead of the real one, so past
// offenses can be played out days ago.
let offset = 0;
const clock = () => Date.now() + offset;
const codes = new Map();
let base;

async function call(path, token, body) {
  const response = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(`${path}: ${data.error}`), { status: response.status, body: data });
  return data;
}
async function account(phone, firstName, lastName, role = 'passenger') {
  const form = { phone, password: PASSWORD, firstName, lastName, email: `${firstName}.${lastName}@sim.indanggo.test`.toLowerCase().replaceAll(' ', ''), role,
    ...(role === 'driver' ? { plate: `SIM ${phone.slice(-3)}`, toda: 'Simulation TODA', capacity: 4 } : {}) };
  await call('/register/code', null, form);
  await call('/register', null, { ...form, code: codes.get(form.email) });
  return login(phone);
}
async function login(phone) {
  const { token, user } = await call('/login', null, { phone, password: PASSWORD });
  return { token, user, phone };
}
const fix = () => ({ latitude: 14.197805, longitude: 120.881639, accuracy: 5, timestamp: clock(), speed: 0, heading: 0 });
async function online(driver) {
  if (!driver.socket) {
    driver.socket = io(base, { auth: { token: driver.token }, transports: ['websocket'] });
    await new Promise((resolve, reject) => { driver.socket.once('connect', resolve); driver.socket.once('connect_error', reject); });
  }
  await call('/driver/location', driver.token, fix());
  await call('/driver/availability', driver.token, { available: true });
}
// One trip from booking to its end; returns the ride id.
async function trip(passenger, driver, { noShow = false } = {}) {
  await online(driver);
  const { ride } = await call('/rides', passenger.token, { trip: DEFAULT_TRIP, passengers: 1, note: '', idempotencyKey: randomUUID() });
  const { offer } = await call('/state', driver.token);
  if (offer?.id !== ride.id) throw new Error('The driver did not get the offer.');
  await call(`/rides/${ride.id}/accept`, driver.token, { offerId: offer.offerId });
  await call(`/rides/${ride.id}/arrive`, driver.token, {});
  if (noShow) await call(`/rides/${ride.id}/cancel`, driver.token, { reason: 'Passenger did not show up' });
  else for (const step of ['start', 'complete']) await call(`/rides/${ride.id}/${step}`, driver.token, {});
  return ride.id;
}
const report = (driver, rideId, reason, details) => call(`/rides/${rideId}/report`, driver.token, { reason, details });
async function uphold(admin, rideId) {
  const { reports } = await call('/admin/reports', admin.token);
  return call(`/admin/reports/${reports.find((item) => item.trip?.key === rideId).key}/uphold`, admin.token, {});
}
// Moves the server's clock; the driver's GPS must be fresh on the new clock.
const travel = (to) => { offset = to; };
const stamp = () => new Date(clock()).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

async function main() {
  const backend = await createBackend({ mongoUri: MONGO, clock, adminPhones: ADMIN_PHONE, sendEmail: async ({ to, code }) => { codes.set(to, code); } });
  await backend.models.User.db.dropDatabase();
  await Promise.all(Object.values(backend.models).map((model) => model.init()));
  await new Promise((resolve) => backend.server.listen(PORT, '127.0.0.1', resolve));
  base = `http://localhost:${PORT}`;

  travel(-7 * DAY);
  const admin = await account(ADMIN_PHONE, 'Pilot', 'Admin');
  const [dante, rosa] = [await account('09170000011', 'Dante', 'Reyes', 'driver'), await account('09170000012', 'Rosa', 'Mendoza', 'driver')];
  // Drivers who sign up wait for an admin's approval before taking bookings.
  for (const driver of [dante, rosa]) await call(`/admin/drivers/${driver.user.id}/approve`, admin.token, {});
  const pedro = await account('09170000021', 'Pedro', 'Santos'), maria = await account('09170000022', 'Maria', 'Cruz');
  const juan = await account('09170000023', 'Juan', 'Dela Cruz'), ana = await account('09170000024', 'Ana', 'Lopez');
  const log = (line) => console.log(`  [${stamp()}] ${line}`);
  console.log('\nPlaying out trips and reports…');

  // Seven days ago: Pedro's first fake booking, upheld (24 hours).
  let ride = await trip(pedro, dante, { noShow: true });
  await report(dante, ride, 'fake_booking', 'Pin was at an empty lot, number unreachable');
  await uphold(admin, ride);
  log('Pedro: 1st fake booking upheld -> 24-hour suspension');
  // Five days ago: back, and does it again (3 days).
  travel(-5 * DAY); pedro.token = (await login(pedro.phone)).token;
  ride = await trip(pedro, rosa, { noShow: true });
  await report(rosa, ride, 'fake_booking', 'Booked and switched off his phone');
  await uphold(admin, ride);
  log('Pedro: 2nd fake booking upheld -> 3-day suspension');
  // Six days ago Maria missed a pickup once (24 hours).
  travel(-6 * DAY);
  ride = await trip(maria, dante, { noShow: true });
  await report(dante, ride, 'no_show', 'Waited 10 minutes at the pickup');
  await uphold(admin, ride);
  log('Maria: no-show upheld -> 24-hour suspension');
  // Two days ago: a report the admin found unfounded.
  travel(-2 * DAY);
  ride = await trip(ana, rosa);
  await report(rosa, ride, 'did_not_pay', 'Said she would pay later');
  const { reports } = await call('/admin/reports', admin.token);
  await call(`/admin/reports/${reports.find((item) => item.trip?.key === ride).key}/dismiss`, admin.token, {});
  log('Ana: "did not pay" report dismissed (she paid by GCash)');

  // Today: three reports waiting, each a different next penalty.
  travel(-3 * 60 * 60 * 1000);
  pedro.token = (await login(pedro.phone)).token; maria.token = (await login(maria.phone)).token;
  ride = await trip(juan, dante, { noShow: true });
  await report(dante, ride, 'no_show', 'Nobody at Indang Public Market after 10 minutes');
  log('Juan: no-show reported (first offense if upheld)');
  travel(-2 * 60 * 60 * 1000);
  ride = await trip(maria, rosa, { noShow: true });
  await report(rosa, ride, 'fake_booking', 'Booked for a friend who never came');
  log('Maria: fake booking reported (second offense if upheld)');
  travel(-30 * 60 * 1000);
  ride = await trip(pedro, dante, { noShow: true });
  await report(dante, ride, 'fake_booking', 'Same empty lot again, third time');
  log('Pedro: fake booking reported (third offense if upheld)');
  travel(0);
  // Sessions opened "a week ago" have expired by now; the drivers just go offline.
  for (const driver of [dante, rosa]) { driver.socket?.disconnect(); }

  console.log(`\nSimulation API: ${base}  (database: ${backend.models.User.db.name})`);
  console.log(`God view admin: ${ADMIN_PHONE} / ${PASSWORD}`);
  console.log(`Passengers: Pedro ${pedro.phone}, Maria ${maria.phone}, Juan ${juan.phone}, Ana ${ana.phone} (same password)`);
  console.log('Build God view against it:  cd web/god-view && GOD_VIEW_API_URL=http://localhost:4100 npm start');
  console.log('Ctrl+C stops the simulation.\n');
  const stop = async () => { await backend.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

main().catch((error) => { console.error('Simulation failed:', error.message, error.body || ''); process.exit(1); });
