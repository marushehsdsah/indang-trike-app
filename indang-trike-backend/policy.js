const { normalizePhilippinePhone } = require('../utils/registration');
const { SERVICE_AREA_EITHER, getMunicipalityAt, isInIndangServiceArea } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { findToda } = require('../data/todaZones');
const { resolveBookingRoute, createBookingPayload } = require('../utils/bookingRoute');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireValue(condition, status, message) { if (!condition) throw new HttpError(status, message); }
function cleanText(value, max = 80) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function profileFields(body, role) {
  const firstName = cleanText(body.firstName), lastName = cleanText(body.lastName), email = cleanText(body.email, 254).toLowerCase();
  requireValue(firstName && lastName, 400, 'First and last names are required.');
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Enter a valid email address.');
  const fields = { firstName, lastName, email };
  if (role === 'driver') {
    // An Indang TODA is stored under its official name, which ties the driver to its barangays.
    fields.plate = cleanText(body.plate, 24).toUpperCase(); fields.toda = cleanText(body.toda, 80); fields.capacity = body.capacity;
    fields.toda = findToda(fields.toda)?.name ?? fields.toda;
    requireValue(fields.plate && fields.toda && Number.isInteger(fields.capacity) && fields.capacity >= 1 && fields.capacity <= 4, 400, 'Enter your plate, TODA, and capacity (1–4).');
  }
  return fields;
}
function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id), phone: user.phone, firstName: user.firstName || '', lastName: user.lastName || '',
    email: user.email || '', role: user.role || 'passenger', plate: user.plate, toda: user.toda, capacity: user.capacity,
    available: Boolean(user.available), createdAt: user.createdAt,
    profileComplete: Boolean(user.firstName && user.lastName && user.email && (user.role !== 'driver' || (user.plate && user.toda && user.capacity))),
  };
}
function bookingFields(body) {
  requireValue(typeof body.idempotencyKey === 'string' && /^[\w-]{10,100}$/.test(body.idempotencyKey), 400, 'A booking request key is required.');
  const trip = body.trip;
  requireValue(trip?.pickup?.coordinate && trip?.dropoff?.coordinate, 400, 'Choose pickup and destination.');
  const endpoints = [trip.pickup, trip.dropoff];
  for (const endpoint of endpoints) {
    requireValue(typeof endpoint.name === 'string' && endpoint.name.trim() && endpoint.name.length <= 150 &&
      Number.isFinite(endpoint.coordinate.latitude) && Number.isFinite(endpoint.coordinate.longitude), 400, 'Invalid pickup or destination.');
    requireValue(isInIndangServiceArea(endpoint.coordinate), 400, `Pickup and destination must be inside ${SERVICE_AREA_EITHER}.`);
  }
  // Each town is its own network of roads and drivers.
  requireValue(getMunicipalityAt(trip.pickup.coordinate) === getMunicipalityAt(trip.dropoff.coordinate), 400, 'Pickup and destination must be in the same town.');
  requireValue(Number.isInteger(body.passengers) && body.passengers >= 1 && body.passengers <= 4, 400, 'Choose 1–4 passengers.');
  requireValue(body.note === undefined || (typeof body.note === 'string' && body.note.length <= 200), 400, 'Pickup notes can have at most 200 characters.');
  const result = resolveBookingRoute({ roadGraph: getRoadGraph(), pickup: trip.pickup, destination: trip.dropoff, isInServiceArea: isInIndangServiceArea, getMunicipalityAt });
  requireValue(result.status === 'ok' && result.details.distanceMeters > 0, 400, 'No drivable route connects those stops.');
  return { ...createBookingPayload({ trip, route: result.details, passengers: body.passengers, note: body.note }), idempotencyKey: body.idempotencyKey };
}

module.exports = { HttpError, requireValue, cleanText, profileFields, publicUser, bookingFields, normalizePhilippinePhone };
