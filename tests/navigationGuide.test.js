const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRouteTrack,
  formatClockTime,
  formatManeuverDistance,
  getGuidance,
  getRemainingCoordinates,
  getTrackHeading,
  pointAlongTrack,
  projectOntoTrack,
} = require('../utils/navigationGuide');
const { haversineDistance } = require('../utils/pathfinding');
const { resolveBookingRoute } = require('../utils/bookingRoute');
const { loadRoadGraph } = require('../utils/roadGraph');
const { DEFAULT_TRIP, isInIndangServiceArea } = require('../data/indangMap');

// About 100 m north, then about 100 m east: a right turn at `corner`.
const start = { latitude: 14.2, longitude: 120.88 };
const corner = { latitude: 14.2009, longitude: 120.88 };
const end = { latitude: 14.2009, longitude: 120.88093 };
const route = {
  coordinates: [start, corner, end],
  distanceMeters: 200,
  durationSeconds: 40,
  steps: [
    { type: 'depart', instruction: 'Head north on Mabini Street', roadName: 'Mabini Street', distanceMeters: 100, startDistanceMeters: 0, startCoordinate: start },
    { type: 'right', instruction: 'Turn right on Rizal Street', roadName: 'Rizal Street', distanceMeters: 100, startDistanceMeters: 100, startCoordinate: corner },
    { type: 'arrive', instruction: 'Arrive at destination', roadName: null, distanceMeters: 0, startDistanceMeters: 200, startCoordinate: end },
  ],
};
const track = createRouteTrack(route);
const firstLeg = haversineDistance(start, corner);

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
}

test('measures cumulative Haversine distance along the route', () => {
  assert.equal(track.cumulative.length, 3);
  assert.equal(track.cumulative[0], 0);
  assert.equal(track.cumulative[1], firstLeg);
  assert.equal(track.totalMeters, firstLeg + haversineDistance(corner, end));
  assert.equal(track.routeScale, 200 / track.totalMeters);
});

test('locates points by distance and clamps to the route ends', () => {
  assert.deepEqual(pointAlongTrack(track, 0), start);
  assert.deepEqual(pointAlongTrack(track, -50), start);
  assert.deepEqual(pointAlongTrack(track, track.totalMeters + 50), end);
  const halfway = pointAlongTrack(track, firstLeg / 2);
  assertNear(halfway.latitude, 14.20045, 1e-9, 'halfway latitude');
  assert.equal(halfway.longitude, 120.88);
  assert.equal(pointAlongTrack(createRouteTrack({ coordinates: [] }), 10), null);
});

test('heads along the road just ahead, and behind at the very end', () => {
  assertNear(getTrackHeading(track, 0), 0, 0.5, 'start heading');
  assertNear(getTrackHeading(track, firstLeg + 20), 90, 0.5, 'heading after the turn');
  // Within the look-ahead of the turn, the heading already swings towards it.
  const approaching = getTrackHeading(track, firstLeg - 10);
  assert.ok(approaching > 10 && approaching < 80, `approaching heading ${approaching}`);
  assertNear(getTrackHeading(track, track.totalMeters), 90, 0.5, 'arrival heading');
  assert.equal(getTrackHeading(createRouteTrack({ coordinates: [start] }), 0), 0);
});

test('projects a nearby fix onto the route with its offset', () => {
  // About 10 m east of the middle of the first leg.
  const fix = { latitude: 14.20045, longitude: 120.880093 };
  const projection = projectOntoTrack(track, fix, 0);
  assertNear(projection.offsetMeters, 10, 0.2, 'offset');
  assertNear(projection.distanceAlong, firstLeg / 2, 0.5, 'distance along');
  assertNear(projection.coordinate.longitude, 120.88, 1e-9, 'projected longitude');
});

test('searches only near the current progress so a repeated road cannot pull it back', () => {
  // Out and back along the same street, about 100 m each way.
  const outAndBack = createRouteTrack({
    coordinates: [start, corner, { latitude: 14.2, longitude: 120.88 }],
    distanceMeters: 200,
  });
  const fix = { latitude: 14.2002, longitude: 120.88 };
  assertNear(projectOntoTrack(outAndBack, fix, 0).distanceAlong, 22.2, 0.5, 'outbound match');
  const returning = projectOntoTrack(outAndBack, fix, 170);
  assertNear(returning.distanceAlong, outAndBack.totalMeters - 22.2, 0.5, 'return match');
  assert.equal(projectOntoTrack(track, fix, 1000, { behind: 10 }), null, 'no route inside the window');
});

test('draws the remaining route from the current point onwards', () => {
  const remaining = getRemainingCoordinates(track, firstLeg / 2);
  assert.equal(remaining.length, 3);
  assert.deepEqual(remaining[0], pointAlongTrack(track, firstLeg / 2));
  assert.deepEqual(remaining.slice(1), [corner, end]);
  assert.deepEqual(getRemainingCoordinates(track, firstLeg + 10).slice(1), [end]);
});

test('guides to the next maneuver, previews a close one, and detects arrival', () => {
  const atStart = getGuidance(route, track, 0);
  assert.equal(atStart.stepIndex, 0);
  assert.equal(atStart.nextStep.type, 'right');
  assertNear(atStart.distanceToNextMeters, 100, 1e-9, 'distance to the turn');
  assert.equal(atStart.thenStep.type, 'arrive');
  assert.equal(atStart.remainingMeters, 200);
  assert.equal(atStart.remainingSeconds, 40);
  assert.equal(atStart.arrived, false);

  const afterTurn = getGuidance(route, track, track.totalMeters * 0.75);
  assert.equal(afterTurn.currentStep.type, 'right');
  assert.equal(afterTurn.nextStep.type, 'arrive');
  assertNear(afterTurn.distanceToNextMeters, 50, 1e-9, 'distance to arrival');
  assertNear(afterTurn.remainingSeconds, 10, 1e-9, 'remaining seconds');
  assert.equal(afterTurn.thenStep, null);

  const nearlyThere = getGuidance(route, track, track.totalMeters - 5);
  assert.equal(nearlyThere.arrived, true);
  assert.equal(nearlyThere.nextStep.type, 'arrive');
});

test('formats maneuver distances in glanceable steps', () => {
  assert.equal(formatManeuverDistance(0), 'Now');
  assert.equal(formatManeuverDistance(4), '10 m');
  assert.equal(formatManeuverDistance(94), '90 m');
  assert.equal(formatManeuverDistance(96), '100 m');
  assert.equal(formatManeuverDistance(260), '250 m');
  assert.equal(formatManeuverDistance(980), '1.0 km');
  assert.equal(formatManeuverDistance(1540), '1.5 km');
});

test('formats arrival clock times', () => {
  assert.equal(formatClockTime(new Date(2026, 8, 23, 0, 5)), '12:05 AM');
  assert.equal(formatClockTime(new Date(2026, 8, 23, 12, 0)), '12:00 PM');
  assert.equal(formatClockTime(new Date(2026, 8, 23, 16, 52)), '4:52 PM');
});

test('follows the production default route from pickup to arrival', () => {
  const result = resolveBookingRoute({
    roadGraph: loadRoadGraph(require('../assets/routing/indang-road-graph.json')),
    pickup: DEFAULT_TRIP.pickup,
    destination: DEFAULT_TRIP.dropoff,
    isInServiceArea: isInIndangServiceArea,
  });
  assert.equal(result.status, 'ok');
  const production = result.details;
  const productionTrack = createRouteTrack(production);
  assertNear(productionTrack.totalMeters, production.distanceMeters, 5, 'track length');

  let previous = getGuidance(production, productionTrack, 0);
  for (let distance = 25; distance <= productionTrack.totalMeters; distance += 25) {
    const guidance = getGuidance(production, productionTrack, distance);
    assert.ok(guidance.stepIndex >= previous.stepIndex, 'steps never go backwards');
    assert.ok(guidance.remainingMeters <= previous.remainingMeters, 'remaining distance never grows');
    if (guidance.stepIndex === previous.stepIndex && !guidance.arrived) {
      assert.ok(guidance.distanceToNextMeters <= previous.distanceToNextMeters, 'the next maneuver only gets closer');
    }
    const onRoute = projectOntoTrack(productionTrack, pointAlongTrack(productionTrack, distance), distance - 25);
    assert.ok(onRoute.offsetMeters < 0.5, `a point on the route projects onto it (offset ${onRoute.offsetMeters})`);
    previous = guidance;
  }
  assert.equal(getGuidance(production, productionTrack, productionTrack.totalMeters).arrived, true);
});
