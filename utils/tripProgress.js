const { haversineDistance } = require('./pathfinding');
const { OFF_ROUTE_METERS, createRouteTrack, getGuidance, getRemainingCoordinates, projectOntoTrack } = require('./navigationGuide');
const { formatDistance, formatDuration } = require('./routeDirections');

// A vehicle off its route is routed again at most this often, and only after
// moving this far from where it was last routed: the search is the costliest
// thing a live trip screen does.
const REROUTE_COOLDOWN_MS = 5000;
const REROUTE_MOVE_METERS = 40;

// How close a driver's live GPS must be to a stop before they can mark it
// reached ("Arrived at pickup", "Complete trip").
const ARRIVE_RADIUS_METERS = 30;

// Metres from a position to a stop: the nearer of the stop itself and the
// road point the route reaches it at, since a stop pinned off the road can be
// out of reach of a tricycle that is already at the roadside.
function distanceToStop(position, stop, route) {
  if (!position || !stop) return Infinity;
  const coordinates = route?.coordinates;
  const roadEnd = coordinates?.length ? coordinates[coordinates.length - 1] : null;
  return Math.min(haversineDistance(position, stop), roadEnd ? haversineDistance(position, roadEnd) : Infinity);
}

function hasReachedStop(position, stop, route, radius = ARRIVE_RADIUS_METERS) {
  return distanceToStop(position, stop, route) <= radius;
}

// The part of a route still ahead of a live position, with the distance and
// time left, or null when the position is off the route (the caller then
// routes again from where the vehicle really is).
function remainingRoute(route, position) {
  if (!(route?.coordinates?.length > 1) || !position) return null;
  const track = createRouteTrack(route);
  const projection = projectOntoTrack(track, position, 0, { behind: 0, ahead: Infinity });
  if (!projection || projection.offsetMeters > OFF_ROUTE_METERS) return null;
  const { remainingMeters, remainingSeconds } = getGuidance(route, track, projection.distanceAlong);
  return { coordinates: getRemainingCoordinates(track, projection.distanceAlong), remainingMeters, remainingSeconds };
}

// One step of a live leg (the line from a moving vehicle to a stop). While
// the vehicle stays on the current route the line is that route trimmed to
// what is ahead of it, which costs no search; off it, `reroute(vehicle)` runs
// (the road search), throttled. `state` is { route, reroutedAt, reroutedFrom }
// and is returned updated; `display` is the route to draw, with its distance
// and time labels counting down; `live` says it follows the vehicle.
function advanceLeg(state, { vehicle, now, reroute }) {
  if (!vehicle) return { state, display: state.route ?? null, live: false };
  if (state.route) {
    const remaining = remainingRoute(state.route, vehicle);
    if (remaining) {
      return { state, live: true, display: { ...state.route, coordinates: remaining.coordinates,
        distanceLabel: formatDistance(remaining.remainingMeters), durationLabel: formatDuration(remaining.remainingSeconds) } };
    }
  }
  const due = !state.route || (now - (state.reroutedAt ?? -Infinity) >= REROUTE_COOLDOWN_MS &&
    (!state.reroutedFrom || haversineDistance(vehicle, state.reroutedFrom) > REROUTE_MOVE_METERS));
  if (!due) return { state, display: state.route, live: false };
  const route = reroute(vehicle);
  const next = { route: route ?? state.route ?? null, reroutedAt: now, reroutedFrom: vehicle };
  return { state: next, display: next.route, live: Boolean(route) };
}

module.exports = { ARRIVE_RADIUS_METERS, REROUTE_COOLDOWN_MS, advanceLeg, distanceToStop, hasReachedStop, remainingRoute };
