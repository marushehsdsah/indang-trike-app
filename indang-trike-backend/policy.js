const { normalizePhilippinePhone, sanitizeName } = require('../utils/registration');
const { SERVICE_AREA_EITHER, getMunicipalityAt, isInIndangServiceArea } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { findToda, todaName, TODA_NAMES } = require('../data/todaZones');
const { fareDetails, quoteTrip } = require('../data/fares');
const { resolveBookingRoute, createBookingPayload } = require('../utils/bookingRoute');
const { ratingSummary } = require('../utils/rating');
const { containsProfanity } = require('../utils/profanity');
const { usesEmail } = require('../utils/roles');

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
  // A name cannot be partly hidden, so one with offensive words is refused.
  requireValue(!containsProfanity(`${firstName} ${lastName}`), 400, 'Please use a respectful name.');
  // Staff have no email (utils/roles.js usesEmail): they are seeded in the
  // database and have no Forgot password (auth.js), so one sent here is never
  // saved, and one left from before is cleared.
  if (!usesEmail(role)) return { firstName, lastName, email: '' };
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
// The profile picture's version, or null without one: the app adds it to the
// photo's address, so a new picture is not hidden by the old one in a cache.
const photoVersion = (user) => (user?.photoAt ? new Date(user.photoAt).getTime() : null);
// A profile picture is a JPEG the app has already cut to a small square.
const MAX_PHOTO_BYTES = 150 * 1024;
function photoBytes(photo) {
  const match = typeof photo === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/.exec(photo);
  requireValue(match, 400, 'Choose a photo for your profile picture.');
  const bytes = Buffer.from(match[1], 'base64');
  requireValue(bytes.length <= MAX_PHOTO_BYTES, 413, 'This photo is too large. Choose another one.');
  requireValue(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, 400, 'Choose a photo for your profile picture.');
  return bytes;
}
// A TODA saved under a former name ("ITODA PITODA") is shown by its current one.
function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id), phone: user.phone, firstName: user.firstName || '', lastName: user.lastName || '',
    email: user.email || '', role: user.role || 'passenger', plate: user.plate, toda: todaName(user.toda), capacity: user.capacity,
    available: Boolean(user.available), createdAt: user.createdAt, rating: ratingSummary(user), photoAt: photoVersion(user),
    // Staff are complete without an email, as they never have one.
    profileComplete: Boolean(user.firstName && user.lastName && (user.email || !usesEmail(user.role)) && (user.role !== 'driver' || (user.plate && user.toda && user.capacity))),
    ...(awaitingApproval(user) ? { pendingApproval: true } : {}),
    // Only the TODA tester may pick another TODA in the profile, and cancel a
    // trip at any stage.
    ...(user.role === 'driver' && user.todaTester ? { todaChoices: TODA_NAMES, tester: true } : {}),
  };
}
// The fare is set here from the taripa (data/fares.js), with the fares set in
// God view (`fares`: { prices, revision }, indang-trike-backend/fares.js), the
// server's own clock and the trip's road route; the app's quote is only a
// preview.
const FARES_CHANGED = 'Fares were just updated. Check the new fare, then book again.';
function fareFields(body, trip, route, now, fares) {
  // Every booking is a special trip; regular (per-passenger) trips are not offered.
  requireValue(body.fareType === undefined || body.fareType === 'special', 400, 'Only special trips can be booked. Update the app and try again.');
  // The app names the fares it quoted with; a booking quoted with fares that
  // have since changed is refused, so the passenger sees the new fare first.
  // Older apps send none and are charged the fares in force.
  requireValue(body.fareRevision === undefined || body.fareRevision === null || !fares || body.fareRevision === fares.revision, 409, FARES_CHANGED);
  // A barangay's area is set by the stop's distance from the town, and each
  // barangay the trip crosses into adds its fare (data/fares.js).
  const quote = quoteTrip({ pickup: trip.pickup.coordinate, dropoff: trip.dropoff.coordinate, route: route.coordinates, at: now, prices: fares?.prices });
  const details = fareDetails(quote, { passengers: body.passengers });
  requireValue(Number.isFinite(details.total), 400, 'This trip has no listed fare.');
  return { fare: details.total, fareDetails: details };
}

function bookingFields(body, now = Date.now(), fares = null) {
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
  return { ...createBookingPayload({ trip, route: result.details, passengers: body.passengers, note: body.note }), ...fareFields(body, trip, result.details, now, fares),
    idempotencyKey: body.idempotencyKey };
}

module.exports = { HttpError, requireValue, cleanText, profileFields, publicUser, bookingFields, normalizePhilippinePhone, awaitingApproval, AWAITING_APPROVAL, photoBytes, photoVersion, FARES_CHANGED };
