const { calculateRoute } = require('./roadGraph');
const { buildRouteDirections } = require('./routeDirections');
const { SERVICE_AREA_EITHER, SERVICE_AREA_NAME } = require('../data/indangMap');

const NO_METRIC = '—';
const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 4;
const ENDPOINT_LABELS = { pickup: 'Pickup', destination: 'Destination' };
const CALCULATING_MESSAGE = 'Finding the fastest road route…';
// The towns' road networks do not connect, and each town's trikes serve it.
const DIFFERENT_TOWNS_MESSAGE = `Pickup and destination must be in the same town. Trikes do not travel between ${SERVICE_AREA_NAME}.`;

function blocked(message) {
  return { canConfirm: false, message, distanceLabel: NO_METRIC, durationLabel: NO_METRIC };
}

// Booking-sheet copy for a route calculation result. Metrics are shown only for
// a usable route, so a failed recalculation never displays the previous route.
function getBookingState(routeResult, routeDetails) {
  const endpoint = ENDPOINT_LABELS[routeResult?.endpoint];
  switch (routeResult?.status) {
    case 'missing-endpoints':
      return blocked('Choose a pickup and destination to calculate your route.');
    case 'calculating':
      return blocked(CALCULATING_MESSAGE);
    case 'outside-service-area':
      return blocked(endpoint
        ? `${endpoint} is outside ${SERVICE_AREA_NAME}. Choose a point inside ${SERVICE_AREA_EITHER}.`
        : `Choose points inside ${SERVICE_AREA_EITHER}.`);
    case 'different-towns':
      return blocked(DIFFERENT_TOWNS_MESSAGE);
    case 'unsnappable':
      return blocked(`${endpoint ?? 'A stop'} is too far from a road. Choose a point nearer a road.`);
    case 'no-route':
      return blocked('No drivable route found. Choose another pickup or destination.');
    case 'ok':
      if (!routeDetails) return blocked(CALCULATING_MESSAGE);
      if (!(routeDetails.distanceMeters > 0)) {
        return blocked('Pickup and destination are the same place. Choose a different destination.');
      }
      return {
        canConfirm: true,
        message: null,
        distanceLabel: routeDetails.distanceLabel,
        durationLabel: routeDetails.durationLabel,
      };
    default:
      return blocked('Offline road data is unavailable, so booking is disabled.');
  }
}

// Everything BookingScreen needs to route two chosen places: graph health,
// the service area, snapping, A*, and the display directions for an `ok` route.
// getMunicipalityAt, when given, also requires both stops to be in one town.
function resolveBookingRoute({ roadGraph, pickup, destination, isInServiceArea, getMunicipalityAt }) {
  if (!pickup?.coordinate || !destination?.coordinate) return { status: 'missing-endpoints' };
  if (roadGraph?.status !== 'ready') return { status: 'error', message: roadGraph?.message ?? 'Road graph not loaded' };
  if (!isInServiceArea(pickup.coordinate)) return { status: 'outside-service-area', endpoint: 'pickup' };
  if (!isInServiceArea(destination.coordinate)) return { status: 'outside-service-area', endpoint: 'destination' };
  if (getMunicipalityAt && getMunicipalityAt(pickup.coordinate)?.name !== getMunicipalityAt(destination.coordinate)?.name) {
    return { status: 'different-towns' };
  }
  const result = calculateRoute(roadGraph.graph, pickup.coordinate, destination.coordinate);
  if (result.status !== 'ok') return result;
  return { ...result, details: buildRouteDirections(result.route) };
}

function isValidCoordinate(coordinate) {
  return Boolean(coordinate) && Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude);
}

function isBookableRoute(route) {
  return Boolean(route) &&
    Array.isArray(route.coordinates) && route.coordinates.length >= 2 &&
    route.coordinates.every(isValidCoordinate) &&
    route.distanceMeters > 0 && Number.isFinite(route.distanceMeters) &&
    route.durationSeconds > 0 && Number.isFinite(route.durationSeconds) &&
    Array.isArray(route.steps);
}

function isNamedEndpoint(endpoint) {
  return Boolean(endpoint?.name?.trim()) && isValidCoordinate(endpoint.coordinate);
}

function toEndpoint({ id, name, kind, coordinate }) {
  return { id, name, kind, coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude } };
}

// Builds the navigation params shared by Searching and ActiveRide. The JSON
// round trip guarantees a plain, serializable copy that later edits cannot touch.
function createBookingPayload({ trip, route, passengers, note } = {}) {
  if (!Number.isInteger(passengers) || passengers < MIN_PASSENGERS || passengers > MAX_PASSENGERS) {
    throw new Error(`Passengers must be a whole number from ${MIN_PASSENGERS} to ${MAX_PASSENGERS}.`);
  }
  if (!isNamedEndpoint(trip?.pickup) || !isNamedEndpoint(trip?.dropoff)) {
    throw new Error('Trip needs a named pickup and destination.');
  }
  if (!isBookableRoute(route)) {
    throw new Error('A calculated route is required before booking.');
  }

  return JSON.parse(JSON.stringify({
    trip: { pickup: toEndpoint(trip.pickup), dropoff: toEndpoint(trip.dropoff) },
    route: {
      coordinates: route.coordinates,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      distanceLabel: route.distanceLabel,
      durationLabel: route.durationLabel,
      steps: route.steps,
    },
    passengers,
    note: String(note ?? ''),
  }));
}

module.exports = {
  MAX_PASSENGERS,
  MIN_PASSENGERS,
  createBookingPayload,
  getBookingState,
  resolveBookingRoute,
};
