const { haversineDistance } = require('./pathfinding');
const { OFF_ROUTE_METERS, createRouteTrack, getGuidance, getRemainingCoordinates, projectOntoTrack } = require('./navigationGuide');

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

module.exports = { ARRIVE_RADIUS_METERS, distanceToStop, hasReachedStop, remainingRoute };
