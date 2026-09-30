const test = require('node:test');
test('missing stops cannot produce a bookable route', () => {
  const { resolveBookingRoute, getBookingState } = require('../utils/bookingRoute');
  const result = resolveBookingRoute({ roadGraph: { status: 'ready' }, pickup: null, destination: null, isInServiceArea: () => true });
  require('node:assert/strict').equal(result.status, 'missing-endpoints');
  require('node:assert/strict').equal(getBookingState(result).canConfirm, false);
});
const assert = require('node:assert/strict');
const {
  createBookingPayload,
  getBookingState,
  resolveBookingRoute,
} = require('../utils/bookingRoute');
const { loadRoadGraph } = require('../utils/roadGraph');
const { buildRoadGraph } = require('../scripts/build-road-graph');
const { DEFAULT_TRIP, isInIndangServiceArea } = require('../data/indangMap');

const NO_METRICS = { distanceLabel: '—', durationLabel: '—' };
const staleDetails = {
  coordinates: [{ latitude: 14.2, longitude: 120.88 }, { latitude: 14.21, longitude: 120.88 }],
  distanceMeters: 1112,
  durationSeconds: 200,
  distanceLabel: '1.1 km',
  durationLabel: '4 min',
  steps: [],
};

const trip = {
  pickup: { id: 'current-location', name: 'Current location', coordinate: { latitude: 14.2, longitude: 120.88 } },
  dropoff: { name: 'Harasan Cuevas Compound', coordinate: { latitude: 14.15988, longitude: 120.86997 } },
};
const route = {
  ...staleDetails,
  nodeIds: ['1', '2'],
  segments: [{ fromNodeId: '1', toNodeId: '2' }],
  steps: [
    { type: 'depart', instruction: 'Head north', roadName: null, distanceMeters: 1112, startDistanceMeters: 0 },
    { type: 'arrive', instruction: 'Arrive at destination', roadName: null, distanceMeters: 0, startDistanceMeters: 1112 },
  ],
};

test('describes every booking state with literal copy', () => {
  assert.deepEqual(getBookingState({ status: 'calculating' }), {
    canConfirm: false,
    message: 'Finding the fastest road route…',
    ...NO_METRICS,
  });
  assert.deepEqual(getBookingState({ status: 'outside-service-area', endpoint: 'destination' }), {
    canConfirm: false,
    message: 'Destination is outside the Indang service area. Choose a point inside Indang.',
    ...NO_METRICS,
  });
  assert.deepEqual(getBookingState({ status: 'unsnappable', endpoint: 'pickup' }), {
    canConfirm: false,
    message: 'Pickup is too far from a road. Choose a point nearer a road.',
    ...NO_METRICS,
  });
  assert.deepEqual(getBookingState({ status: 'unsnappable', endpoint: 'destination' }), {
    canConfirm: false,
    message: 'Destination is too far from a road. Choose a point nearer a road.',
    ...NO_METRICS,
  });
  assert.deepEqual(getBookingState({ status: 'no-route' }), {
    canConfirm: false,
    message: 'No drivable route found. Choose another pickup or destination.',
    distanceLabel: '—',
    durationLabel: '—',
  });
  assert.deepEqual(getBookingState({ status: 'error', message: 'Invalid road graph: nodes must not be empty' }), {
    canConfirm: false,
    message: 'Offline road data is unavailable, so booking is disabled.',
    ...NO_METRICS,
  });
  assert.deepEqual(getBookingState({ status: 'ok', route }, staleDetails), {
    canConfirm: true,
    message: null,
    distanceLabel: '1.1 km',
    durationLabel: '4 min',
  });
});

test('never carries route metrics into a failure state', () => {
  for (const status of ['calculating', 'outside-service-area', 'unsnappable', 'no-route', 'error', 'unexpected']) {
    const state = getBookingState({ status }, staleDetails);
    assert.equal(state.canConfirm, false, status);
    assert.equal(state.distanceLabel, '—', status);
    assert.equal(state.durationLabel, '—', status);
  }
  assert.deepEqual(getBookingState({ status: 'ok', route }), {
    canConfirm: false,
    message: 'Finding the fastest road route…',
    ...NO_METRICS,
  });
});

test('refuses to book a zero-length route', () => {
  const sameNode = { ...staleDetails, coordinates: [staleDetails.coordinates[0]], distanceMeters: 0, durationSeconds: 0 };
  assert.deepEqual(getBookingState({ status: 'ok', route: sameNode }, sameNode), {
    canConfirm: false,
    message: 'Pickup and destination are the same place. Choose a different destination.',
    ...NO_METRICS,
  });
});

test('creates a deep-cloned serializable payload with only the display route', () => {
  const payload = createBookingPayload({ trip, route, passengers: 2, note: 'Near the green gate' });

  assert.deepEqual(payload, {
    trip,
    route: {
      coordinates: route.coordinates,
      distanceMeters: 1112,
      durationSeconds: 200,
      distanceLabel: '1.1 km',
      durationLabel: '4 min',
      steps: route.steps,
    },
    passengers: 2,
    note: 'Near the green gate',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
  assert.notEqual(payload.trip.pickup, trip.pickup);
  assert.notEqual(payload.route.coordinates, route.coordinates);
});

test('accepts one to four whole passengers only', () => {
  assert.equal(createBookingPayload({ trip, route, passengers: 1, note: '' }).passengers, 1);
  assert.equal(createBookingPayload({ trip, route, passengers: 4, note: '' }).passengers, 4);
  for (const passengers of [0, 5, 1.5, '2', undefined, Number.NaN]) {
    assert.throws(
      () => createBookingPayload({ trip, route, passengers, note: '' }),
      /Passengers must be a whole number from 1 to 4/,
      String(passengers),
    );
  }
});

test('requires a calculated route and named endpoints', () => {
  const invalidRoutes = [
    undefined,
    { ...route, coordinates: [route.coordinates[0]] },
    { ...route, distanceMeters: 0 },
    { ...route, durationSeconds: Number.NaN },
    { ...route, steps: undefined },
  ];
  for (const candidate of invalidRoutes) {
    assert.throws(
      () => createBookingPayload({ trip, route: candidate, passengers: 1, note: '' }),
      /A calculated route is required before booking/,
    );
  }
  assert.throws(
    () => createBookingPayload({ trip: { ...trip, dropoff: { name: '', coordinate: trip.dropoff.coordinate } }, route, passengers: 1 }),
    /Trip needs a named pickup and destination/,
  );
  assert.equal(createBookingPayload({ trip, route, passengers: 1 }).note, '');
});

test('books the default trip with the production road route', () => {
  const roadGraph = loadRoadGraph(require('../assets/routing/indang-road-graph.json'));
  const result = resolveBookingRoute({
    roadGraph,
    pickup: DEFAULT_TRIP.pickup,
    destination: DEFAULT_TRIP.dropoff,
    isInServiceArea: isInIndangServiceArea,
  });
  assert.equal(result.status, 'ok');
  assert.equal(getBookingState(result, result.details).canConfirm, true);

  const payload = createBookingPayload({
    trip: { pickup: DEFAULT_TRIP.pickup, dropoff: DEFAULT_TRIP.dropoff },
    route: result.details,
    passengers: 3,
    note: 'Wait by the main gate',
  });
  const roundTripped = JSON.parse(JSON.stringify(payload));
  assert.deepEqual(roundTripped, payload);
  assert.deepEqual(payload.route.coordinates, result.details.coordinates);
  assert.equal(payload.route.distanceMeters, result.route.distanceMeters);
  assert.equal(payload.route.durationSeconds, result.route.durationSeconds);
  assert.deepEqual(payload.route.steps, result.details.steps);
  assert.equal(payload.route.steps.at(-1).type, 'arrive');
  assert.equal(payload.passengers, 3);
  assert.equal(payload.note, 'Wait by the main gate');

  result.details.coordinates[0].latitude = 0;
  result.details.steps.pop();
  result.details.distanceMeters = 1;
  assert.deepEqual(payload, roundTripped, 'later route edits must not reach the payload');
});

test('resolves booking routes to each failure state', () => {
  const fixtureGraph = loadRoadGraph(buildRoadGraph(
    require('./fixtures/indang-osm-small.json'),
    require('../assets/geo/indang-municipality.json'),
  ));
  const at = (latitude, longitude) => ({ name: 'Pin', coordinate: { latitude, longitude } });
  const resolve = (roadGraph, pickup, destination) => resolveBookingRoute({
    roadGraph,
    pickup,
    destination,
    isInServiceArea: isInIndangServiceArea,
  });
  const nearNode1 = at(14.19505, 120.88);
  const nearNode9 = at(14.19905, 120.881);

  assert.deepEqual(resolve({ status: 'error', message: 'Invalid road graph: x' }, nearNode9, nearNode1), {
    status: 'error',
    message: 'Invalid road graph: x',
  });
  assert.deepEqual(resolve(fixtureGraph, at(14.4, 120.95), nearNode1), {
    status: 'outside-service-area',
    endpoint: 'pickup',
  });
  assert.deepEqual(resolve(fixtureGraph, nearNode9, at(14.4, 120.95)), {
    status: 'outside-service-area',
    endpoint: 'destination',
  });
  // Harasan is inside Indang but kilometres from the fixture's few roads.
  assert.deepEqual(resolve(fixtureGraph, nearNode9, DEFAULT_TRIP.dropoff), {
    status: 'unsnappable',
    endpoint: 'destination',
  });
  // oneway=-1 on Rizal Street means node 1 can never reach node 9.
  assert.deepEqual(resolve(fixtureGraph, nearNode1, nearNode9), { status: 'no-route' });

  const routed = resolve(fixtureGraph, nearNode9, nearNode1);
  assert.equal(routed.status, 'ok');
  assert.deepEqual(routed.route.nodeIds, ['9', '5', '12', '4', '3', '2', '1']);
  assert.equal(routed.details.steps.at(-1).type, 'arrive');
});
