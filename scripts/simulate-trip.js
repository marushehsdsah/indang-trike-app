#!/usr/bin/env node
// Plays the other side of a trip against a local backend, so one emulator can
// test a whole ride, including the end-of-trip rating.
//
//   node scripts/simulate-trip.js driver      A test driver goes online near the
//                                              town centre, accepts your booking,
//                                              drives to you and to the
//                                              destination, completes the trip,
//                                              and rates you.
//   node scripts/simulate-trip.js passenger   A test passenger books CvSU Main
//                                              Campus -> Harasan for the driver
//                                              logged in on the emulator, waits
//                                              for you to complete it, then rates
//                                              you.
//
// Options:
//   --stars <1-5>       Rating to give at the end (default 5). --no-rate skips it.
//   --tags "<a>,<b>"    Rating tags, from utils/rating.js (must suit the stars).
//   --at <lat>,<lng>    Where the test driver starts (default Indang Municipal Hall).
//   --wait <seconds>    Pause at the pickup and before each step (default 6).
//   --speed <x>         Driving speed multiplier, 1 = real time (default 8).
//   --api <url>         Backend (default http://127.0.0.1:3000, or EXPO_PUBLIC_API_URL).
//
// The test accounts below exist only in your local database. Press Ctrl+C to
// stop; the test driver goes offline first.
const { io } = require('socket.io-client');
const { randomUUID } = require('node:crypto');
const { DEFAULT_TRIP } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { calculateRoute } = require('../utils/roadGraph');
const { haversineDistance } = require('../utils/pathfinding');

const ACCOUNTS = {
  driver: {
    phone: '09990000101', password: 'simulated-driver', role: 'driver', firstName: 'Sim', lastName: 'Driver',
    email: 'sim.driver@example.com', plate: 'SIM-101', toda: 'Indang Poblacion TODA', capacity: 4,
  },
  passenger: {
    phone: '09990000102', password: 'simulated-passenger', role: 'passenger', firstName: 'Sim', lastName: 'Passenger',
    email: 'sim.passenger@example.com',
  },
};
const MUNICIPAL_HALL = { latitude: 14.202808, longitude: 120.875309 };
// The backend accepts GPS no older than 30 s; send well inside that.
const GPS_EVERY_MS = 2000;

function parseArgs(argv) {
  const args = { mode: argv[0], stars: 5, tags: [], rate: true, at: MUNICIPAL_HALL, wait: 6, speed: 8,
    api: process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000' };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index], value = argv[index + 1];
    if (flag === '--no-rate') { args.rate = false; continue; }
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    index += 1;
    if (flag === '--stars') args.stars = Number(value);
    else if (flag === '--tags') args.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
    else if (flag === '--at') { const [latitude, longitude] = value.split(',').map(Number); args.at = { latitude, longitude }; }
    else if (flag === '--wait') args.wait = Number(value);
    else if (flag === '--speed') args.speed = Number(value);
    else if (flag === '--api') args.api = value;
    else throw new Error(`Unknown option ${flag}.`);
  }
  if (!['driver', 'passenger'].includes(args.mode)) throw new Error('Usage: node scripts/simulate-trip.js <driver|passenger> [options]');
  if (!Number.isInteger(args.stars) || args.stars < 1 || args.stars > 5) throw new Error('--stars must be 1 to 5.');
  if (!Number.isFinite(args.at.latitude) || !Number.isFinite(args.at.longitude)) throw new Error('--at must be <lat>,<lng>.');
  if (!(args.wait >= 0) || !(args.speed > 0)) throw new Error('--wait must be 0 or more and --speed above 0.');
  args.api = args.api.replace(/\/+$/, '');
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(`[${new Date().toLocaleTimeString('en-PH')}] ${message}`);

function createClient(api) {
  let token = null;
  async function request(path, body) {
    const response = await fetch(`${api}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { status: response.status });
    return payload;
  }
  // Registers the test account the first time, then logs in.
  async function signIn(account) {
    try { await request('/register', account); log(`Created test ${account.role} ${account.firstName} ${account.lastName} (${account.phone}).`); }
    catch (error) { if (error.status !== 409) throw error; }
    const session = await request('/login', { phone: account.phone, password: account.password });
    token = session.token;
    const socket = io(api, { auth: { token }, transports: ['websocket'], reconnection: true });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  return { request, signIn };
}

const fixAt = ({ latitude, longitude }, heading = 0, speed = 0) => ({ latitude, longitude, accuracy: 5, timestamp: Date.now(), heading, speed });

// Road route between two points, or a straight line when there is none.
function roadPath(from, to) {
  const roadGraph = getRoadGraph();
  const result = roadGraph.status === 'ready' ? calculateRoute(roadGraph.graph, from, to) : null;
  return result?.status === 'ok' ? result.route : { coordinates: [from, to], durationSeconds: 60 };
}

function bearing(from, to) {
  const rad = Math.PI / 180, y = Math.sin((to.longitude - from.longitude) * rad) * Math.cos(to.latitude * rad);
  const x = Math.cos(from.latitude * rad) * Math.sin(to.latitude * rad) - Math.sin(from.latitude * rad) * Math.cos(to.latitude * rad) * Math.cos((to.longitude - from.longitude) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

async function rate(client, rideId, args, rateeRole) {
  if (!args.rate) return;
  try {
    await client.request(`/rides/${rideId}/rating`, { stars: args.stars, tags: args.tags });
    log(`Rated the ${rateeRole} ${args.stars} star${args.stars > 1 ? 's' : ''}${args.tags.length ? ` (${args.tags.join(', ')})` : ''}.`);
  } catch (error) { log(`Could not rate the ${rateeRole}: ${error.message}`); }
}

async function runDriver(args) {
  const client = createClient(args.api);
  const socket = await client.signIn(ACCOUNTS.driver);
  let position = args.at, heading = 0, stopping = false;
  const sendGps = () => client.request('/driver/location', fixAt(position, heading)).catch((error) => log(`GPS update failed: ${error.message}`));
  await sendGps();
  const gps = setInterval(sendGps, GPS_EVERY_MS);
  const goOffline = async () => {
    clearInterval(gps);
    await client.request('/driver/availability', { available: false }).catch(() => {});
    socket.disconnect();
  };
  process.once('SIGINT', async () => { stopping = true; log('Stopping: going offline.'); await goOffline(); process.exit(0); });


  // Moves along a road route at its estimated pace, compressed by --speed,
  // reporting where it has got to about once a second.
  async function drive(to, label) {
    const route = roadPath(position, to), points = route.coordinates;
    const along = [0];
    for (let index = 1; index < points.length; index += 1) along.push(along[index - 1] + haversineDistance(points[index - 1], points[index]));
    const total = along.at(-1), durationMs = (route.durationSeconds * 1000) / args.speed, startedAt = Date.now();
    log(`Driving ${label} (${Math.round(total)} m, about ${Math.round(durationMs / 1000)} s at ${args.speed}x).`);
    let segment = 1;
    while (!stopping) {
      const travelled = Math.min(1, (Date.now() - startedAt) / durationMs) * total;
      while (segment < points.length - 1 && along[segment] < travelled) segment += 1;
      const from = points[segment - 1], next = points[segment], length = along[segment] - along[segment - 1];
      const share = length > 0 ? Math.min(1, Math.max(0, (travelled - along[segment - 1]) / length)) : 1;
      position = { latitude: from.latitude + (next.latitude - from.latitude) * share, longitude: from.longitude + (next.longitude - from.longitude) * share };
      heading = bearing(from, next);
      await sendGps();
      if (travelled >= total) return;
      await sleep(1000);
    }
  }

  // Carries an accepted ride through to completion from whatever stage it is
  // at, so a run stopped mid-trip can be resumed.
  async function finishTrip(ride) {
    const step = async (action, message) => {
      await sleep(args.wait * 1000);
      if (stopping) return;
      await client.request(`/rides/${ride.id}/${action}`, {}); log(message);
    };
    if (ride.status === 'accepted') {
      await drive(ride.trip.pickup.coordinate, 'to the pickup');
      await step('arrive', 'Arrived at the pickup.');
    }
    if (['accepted', 'arrived'].includes(ride.status)) await step('start', 'Trip started.');
    await drive(ride.trip.dropoff.coordinate, 'to the destination');
    await step('complete', 'Trip completed. The rating card should now show on the emulator.');
    if (!stopping) await rate(client, ride.id, args, 'passenger');
  }

  try {
    const { ride: unfinished } = await client.request('/state');
    if (unfinished) {
      log(`Resuming the test driver's unfinished ${unfinished.status} trip.`);
      await finishTrip(unfinished);
    } else {
      await client.request('/driver/availability', { available: true });
      log(`Test driver is online at ${position.latitude}, ${position.longitude}. Book a ride inside Indang on the emulator.`);
      while (!stopping) {
        const { offer } = await client.request('/state');
        if (offer) {
          log(`Offer from ${offer.passenger?.firstName || 'a passenger'}: ${offer.trip.pickup.name} -> ${offer.trip.dropoff.name}. Accepting.`);
          const { ride } = await client.request(`/rides/${offer.id}/accept`, { offerId: offer.offerId });
          await finishTrip(ride);
          break;
        }
        await sleep(1500);
      }
    }
  } catch (error) {
    // For example, the passenger cancelled while the driver was on the way.
    log(`The trip ended early: ${error.message}`);
  }
  await goOffline();
  log('Test driver is offline. Done.');
}

async function runPassenger(args) {
  const client = createClient(args.api);
  const socket = await client.signIn(ACCOUNTS.passenger);
  const pickup = DEFAULT_TRIP.pickup.coordinate;
  const sendGps = () => client.request('/passenger/location', fixAt(pickup)).catch(() => {});
  await sendGps();
  const gps = setInterval(sendGps, GPS_EVERY_MS);
  const finish = () => { clearInterval(gps); socket.disconnect(); };

  const current = await client.request('/state');
  let ride = current.ride;
  if (ride) log(`Resuming the test passenger's ${ride.status} ride.`);
  else {
    ride = (await client.request('/rides', { trip: DEFAULT_TRIP, passengers: 1, note: 'Simulated booking', idempotencyKey: randomUUID() })).ride;
    log(`Booked ${DEFAULT_TRIP.pickup.name} -> ${DEFAULT_TRIP.dropoff.name}. Go online as a driver near CvSU on the emulator to get the offer.`);
  }
  process.once('SIGINT', async () => {
    log('Stopping: cancelling the booking if it is still open.');
    await client.request(`/rides/${ride.id}/cancel`, { reason: 'Simulation stopped' }).catch(() => {});
    finish(); process.exit(0);
  });

  let status = null;
  for (;;) {
    const state = await client.request('/state');
    const latest = state.ride || (state.lastRide?.id === ride.id ? state.lastRide : null);
    if (latest && latest.status !== status) { status = latest.status; log(`Ride status: ${status}.`); }
    if (status === 'completed') { await rate(client, ride.id, args, 'driver'); break; }
    if (['cancelled', 'no_driver'].includes(status)) break;
    await sleep(1500);
  }
  finish();
  log('Done.');
}

const args = (() => {
  try { return parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(1); }
})();
(args.mode === 'driver' ? runDriver(args) : runPassenger(args)).catch((error) => {
  console.error(`simulate-trip: ${error.message}${error.cause?.code === 'ECONNREFUSED' ? ' (is the backend running? npm run start in indang-trike-backend)' : ''}`);
  process.exit(1);
});
