const { normalizePhilippinePhone, sanitizeName } = require('../utils/registration');
const { SERVICE_AREA_EITHER, getMunicipalityAt, isInIndangServiceArea } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { findToda, todaName, TODA_NAMES } = require('../data/todaZones');
const { fareDetails, quoteTrip } = require('../data/fares');
const { resolveBookingRoute, createBookingPayload } = require('../utils/bookingRoute');
const { ratingSummary } = require('../utils/rating');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireValue(condition, status, message) { if (!condition) throw new HttpError(status, message); }
function cleanText(value, max = 80) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
// current is the stored user when a profile is edited, absent at sign-up.
function profileFields(body, role, current) {
  const firstName = cleanText(body.firstName), lastName = cleanText(body.lastName), email = cleanText(body.email, 254).toLowerCase();
  requireValue(firstName && lastName, 400, 'First and last names are required.');
  requireValue(sanitizeName(firstName) === firstName && sanitizeName(lastName) === lastName, 400, 'Names can only contain letters and spaces.');
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Enter a valid email address.');
  const fields = { firstName, lastName, email };
  if (role === 'driver') {
    // An Indang TODA is stored under its official name, which ties the driver to its barangays.
    fields.plate = cleanText(body.plate, 24).toUpperCase(); fields.toda = cleanText(body.toda, 80); fields.capacity = body.capacity;
    fields.toda = todaName(fields.toda);
    // A driver keeps the TODA it signed up with (under its current name); only
    // the TODA tester may switch, and only between Indang's TODAs.
    if (current?.todaTester) requireValue(findToda(fields.toda), 400, "Choose one of Indang's TODAs.");
    else if (current?.toda) fields.toda = todaName(current.toda);
    requireValue(fields.plate && fields.toda && Number.isInteger(fields.capacity) && fields.capacity >= 1 && fields.capacity <= 4, 400, 'Enter your plate, TODA, and capacity (1–4).');
  }
  return fields;
}
// A driver who signed up gets no bookings until an admin approves them.
const awaitingApproval = (user) => user?.role === 'driver' && user.approval === 'pending';
const AWAITING_APPROVAL = 'Your driver account is waiting for admin approval.';
// A TODA saved under a former name ("ITODA PITODA") is shown by its current one.
function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id), phone: user.phone, firstName: user.firstName || '', lastName: user.lastName || '',
    email: user.email || '', role: user.role || 'passenger', plate: user.plate, toda: todaName(user.toda), capacity: user.capacity,
    available: Boolean(user.available), createdAt: user.createdAt, rating: ratingSummary(user),
    profileComplete: Boolean(user.firstName && user.lastName && user.email && (user.role !== 'driver' || (user.plate && user.toda && user.capacity))),
    ...(awaitingApproval(user) ? { pendingApproval: true } : {}),
    // Only the TODA tester may pick another TODA in the profile, and cancel a
    // trip at any stage.
    ...(user.role === 'driver' && user.todaTester ? { todaChoices: TODA_NAMES, tester: true } : {}),
  };
}
// The fare is set here from the taripa (data/fares.js) and the server's own
// clock; the app's quote is only a preview.
function fareFields(body, trip, now) {
  requireValue(body.fareType === undefined || ['special', 'regular'].includes(body.fareType), 400, 'Choose a special or regular trip.');
  requireValue(body.discounted === undefined || (Number.isInteger(body.discounted) && body.discounted >= 0 && body.discounted <= body.passengers),
    400, 'Choose how many passengers have a student, senior or PWD ID.');
  // A barangay's area is set by the stop's distance from the town (data/fares.js).
  const quote = quoteTrip({ pickup: trip.pickup.coordinate, dropoff: trip.dropoff.coordinate, at: now });
  const type = body.fareType ?? 'special';
  requireValue(type !== 'regular' || quote.regular || quote.flat !== null, 400, 'Regular fares are listed only for the Bancod routes; book a special trip.');
  const details = fareDetails(quote, { type, passengers: body.passengers, discounted: body.discounted ?? 0 });
  requireValue(Number.isFinite(details.total), 400, 'This trip has no listed fare.');
  return { fare: details.total, fareDetails: details };
}

function bookingFields(body, now = Date.now()) {
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
  return { ...createBookingPayload({ trip, route: result.details, passengers: body.passengers, note: body.note }), ...fareFields(body, trip, now),
    idempotencyKey: body.idempotencyKey };
}

module.exports = { HttpError, requireValue, cleanText, profileFields, publicUser, bookingFields, normalizePhilippinePhone, awaitingApproval, AWAITING_APPROVAL };
