const { haversineDistance } = require('./pathfinding');
const { getBearing } = require('./routeDirections');

// Headings are measured to a point this far ahead, so the camera turns smoothly
// into a bend instead of snapping at every vertex of the road geometry.
const LOOK_AHEAD_METERS = 30;
// A fix farther than this from the route is treated as off the route.
const OFF_ROUTE_METERS = 40;
const ARRIVAL_METERS = 15;
// The maneuver after next is previewed ("Then …") when it follows this closely.
const THEN_WITHIN_METERS = 120;
const DISTANCE_EPSILON = 1e-6;
const METRES_PER_DEGREE = 2 * Math.PI * 6371000 / 360;

// Cumulative metres along a route's coordinates, for locating a position by
// distance. `routeScale` converts these Haversine metres into the route's own
// edge-summed metres, which step start distances are measured in.
function createRouteTrack(route) {
  const coordinates = route?.coordinates ?? [];
  const cumulative = coordinates.length ? [0] : [];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineDistance(coordinates[index - 1], coordinates[index]));
  }
  const totalMeters = cumulative.length ? cumulative[cumulative.length - 1] : 0;
  return {
    coordinates,
    cumulative,
    totalMeters,
    routeScale: totalMeters > 0 && route.distanceMeters > 0 ? route.distanceMeters / totalMeters : 1,
  };
}

function clampDistance(track, distance) {
  return Math.min(track.totalMeters, Math.max(0, Number.isFinite(distance) ? distance : 0));
}

// Index of the segment containing `distance`: the last vertex at or before it.
function findSegmentIndex(track, distance) {
  let low = 0;
  let high = Math.max(0, track.cumulative.length - 2);
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (track.cumulative[middle] <= distance) low = middle;
    else high = middle - 1;
  }
  return low;
}

function pointAlongTrack(track, distance) {
  const { coordinates, cumulative } = track;
  if (!coordinates.length) return null;
  if (coordinates.length === 1) return { ...coordinates[0] };
  const clamped = clampDistance(track, distance);
  const index = findSegmentIndex(track, clamped);
  const from = coordinates[index];
  const to = coordinates[index + 1];
  const length = cumulative[index + 1] - cumulative[index];
  const t = length > 0 ? (clamped - cumulative[index]) / length : 0;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
}

// Direction of travel at `distance`, sampled over the road just ahead (or, at
// the very end of the route, just behind).
function getTrackHeading(track, distance) {
  if (track.coordinates.length < 2 || !(track.totalMeters > 0)) return 0;
  const clamped = clampDistance(track, distance);
  const ahead = Math.min(track.totalMeters, clamped + LOOK_AHEAD_METERS);
  const from = ahead - clamped < 1 ? Math.max(0, ahead - LOOK_AHEAD_METERS) : clamped;
  return getBearing(pointAlongTrack(track, from), pointAlongTrack(track, ahead));
}

// The closest point on the route to `coordinate`, searched only from `behind`
// metres before `nearDistance` to `ahead` metres after it, so a stretch of road
// the route passes twice cannot pull progress backwards or far forwards.
function projectOntoTrack(track, coordinate, nearDistance = 0, { behind = 60, ahead = 400 } = {}) {
  const { coordinates, cumulative } = track;
  if (!coordinates.length || !coordinate) return null;
  // Local flat projection around the fix; accurate to well under a metre at
  // the few-hundred-metre scale of a search window.
  const metresPerLongitude = METRES_PER_DEGREE * Math.cos(coordinate.latitude * Math.PI / 180);
  const toLocal = ({ latitude, longitude }) => ({
    x: (longitude - coordinate.longitude) * metresPerLongitude,
    y: (latitude - coordinate.latitude) * METRES_PER_DEGREE,
  });

  if (coordinates.length === 1) {
    const { x, y } = toLocal(coordinates[0]);
    return { distanceAlong: 0, offsetMeters: Math.hypot(x, y), coordinate: { ...coordinates[0] } };
  }

  const windowStart = nearDistance - behind;
  const windowEnd = nearDistance + ahead;
  let best = null;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    if (cumulative[index + 1] < windowStart || cumulative[index] > windowEnd) continue;
    const from = toLocal(coordinates[index]);
    const to = toLocal(coordinates[index + 1]);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.min(1, Math.max(0, -(from.x * dx + from.y * dy) / lengthSquared)) : 0;
    const offsetMeters = Math.hypot(from.x + dx * t, from.y + dy * t);
    if (!best || offsetMeters < best.offsetMeters - DISTANCE_EPSILON) {
      best = { index, t, offsetMeters };
    }
  }
  if (!best) return null;

  const from = coordinates[best.index];
  const to = coordinates[best.index + 1];
  return {
    distanceAlong: cumulative[best.index] + (cumulative[best.index + 1] - cumulative[best.index]) * best.t,
    offsetMeters: best.offsetMeters,
    coordinate: {
      latitude: from.latitude + (to.latitude - from.latitude) * best.t,
      longitude: from.longitude + (to.longitude - from.longitude) * best.t,
    },
  };
}

// The part of the route still ahead of `distance`, starting at that exact point.
function getRemainingCoordinates(track, distance) {
  const { coordinates } = track;
  if (coordinates.length < 2) return coordinates;
  const clamped = clampDistance(track, distance);
  const index = findSegmentIndex(track, clamped);
  return [pointAlongTrack(track, clamped), ...coordinates.slice(index + 1)];
}

// What a turn-by-turn banner shows `distance` metres into the route: the next
// maneuver and how far away it is, a closely following one, and what is left.
function getGuidance(route, track, distance) {
  const steps = route?.steps ?? [];
  const routeMeters = route?.distanceMeters ?? 0;
  const travelled = Math.min(routeMeters, clampDistance(track, distance) * track.routeScale);
  let stepIndex = 0;
  steps.forEach((step, index) => {
    if (step.startDistanceMeters <= travelled + DISTANCE_EPSILON) stepIndex = index;
  });

  const remainingMeters = Math.max(0, routeMeters - travelled);
  const arrived = remainingMeters <= ARRIVAL_METERS || (steps.length > 0 && stepIndex === steps.length - 1);
  const nextStep = arrived ? steps[steps.length - 1] ?? null : steps[stepIndex + 1] ?? null;
  const followingStep = arrived ? null : steps[stepIndex + 2];
  const thenStep = followingStep && nextStep &&
    followingStep.startDistanceMeters - nextStep.startDistanceMeters <= THEN_WITHIN_METERS
    ? followingStep
    : null;

  return {
    stepIndex,
    currentStep: steps[stepIndex] ?? null,
    nextStep,
    thenStep,
    distanceToNextMeters: nextStep ? Math.max(0, nextStep.startDistanceMeters - travelled) : 0,
    remainingMeters,
    remainingSeconds: routeMeters > 0 ? (route.durationSeconds ?? 0) * (remainingMeters / routeMeters) : 0,
    arrived,
  };
}

// Banner distances in the steps a driver can use at a glance.
function formatManeuverDistance(metres) {
  if (!(metres > 0)) return 'Now';
  if (metres < 100) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  const roundedMetres = Math.round(metres / 50) * 50;
  return roundedMetres < 1000 ? `${roundedMetres} m` : `${(metres / 1000).toFixed(1)} km`;
}

function formatClockTime(date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

module.exports = {
  ARRIVAL_METERS,
  LOOK_AHEAD_METERS,
  OFF_ROUTE_METERS,
  createRouteTrack,
  formatClockTime,
  formatManeuverDistance,
  getGuidance,
  getRemainingCoordinates,
  getTrackHeading,
  pointAlongTrack,
  projectOntoTrack,
};
