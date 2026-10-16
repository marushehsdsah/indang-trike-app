const fareData = require('../assets/fares/indang-fares.json');
const { getMunicipalityAt } = require('./indangMap');
const { getBarangayAt } = require('./todaZones');
const { haversineDistance } = require('../utils/pathfinding');

// Tricycle fares from Indang's taripa (assets/fares/indang-fares.json, from
// TODAs_coordinates (1).xlsx). A booking is a special trip (the whole trike,
// priced per trip) or, where the taripa lists one, a regular trip (priced per
// passenger, with the student/senior/PWD discount). Every fare is [day, night].
// The app shows the quote; the server recomputes it with its own clock.

// General Trias has no taripa in the file yet: a flat fare per trip.
const FLAT_FARE = 45;
const MANILA_OFFSET_MINUTES = 8 * 60;
const { night: NIGHT, special: SPECIAL, poblacion: POBLACION, terminals: TERMINALS, cvsuOrigin: CVSU } = fareData;
const AREAS = fareData.areas;
const AREA_BY_ID = new Map(AREAS.map((area) => [area.id, area]));

// Night is 9:00 PM to 4:00 AM, Philippine time, whatever the phone or server
// clock's own time zone.
function isNightAt(time) {
  const minutes = Math.floor((time / 60000 + MANILA_OFFSET_MINUTES) % 1440);
  return minutes >= NIGHT.fromMinutes || minutes <= NIGHT.toMinutes;
}

const near = (coordinate, point, radius) => haversineDistance(coordinate, point) <= radius;

function inPoblacion(coordinate, barangay) {
  return POBLACION.barangays.includes(barangay) ||
    POBLACION.alsoWithin.some((point) => near(coordinate, point, POBLACION.alsoWithinMeters));
}

function zoneOf(coordinate) {
  const barangay = getBarangayAt(coordinate);
  return {
    coordinate,
    barangay,
    poblacion: inPoblacion(coordinate, barangay),
    areas: AREAS.filter((area) => area.barangays.includes(barangay)),
  };
}

// An area's special-trip fare from an origin, falling back to the Poblacion
// table, which every area has.
const specialFare = (area, origin) => area.special[origin] ?? area.special.poblacion;

// The area the priced stop is in: the only area there, any area when all of
// them cost the same from this origin, or else the rider's choice. `options`
// lists the areas whenever the rider has to (or did) choose.
function resolveArea(zone, origin, chosenId, period) {
  const fares = new Set(zone.areas.map((area) => specialFare(area, origin)[period]));
  if (zone.areas.length && fares.size === 1 && !zone.areas.some((area) => area.regular)) return { area: zone.areas[0], options: null };
  const options = zone.areas.map((area) => ({ id: area.id, label: area.label, fare: specialFare(area, origin)[period] }));
  return { area: zone.areas.find((area) => area.id === chosenId) ?? null, options };
}

// What a trip between two coordinates costs at `at` (ms). `areas` holds the
// rider's choice of area for each stop, when the stop's barangay has several.
// Returns { town, night, flat } for a flat-fare town, or { town, night,
// special, regular, choice, choose }: `special` and `regular` are null when
// not available (regular exists only on the routes the taripa lists).
// `choice` lists the areas of the stop whose fare applies when its barangay
// has several, with the one chosen; `choose` is that same choice while the
// rider still has to make it, and then there is no fare yet.
function quoteTrip({ pickup, dropoff, at = Date.now(), areas = {} }) {
  const town = getMunicipalityAt(pickup)?.name ?? null;
  const night = isNightAt(at);
  if (town !== 'Indang') return { town, night, flat: FLAT_FARE, special: null, regular: null, choice: null, choose: null };
  const period = night ? 1 : 0;
  const stops = { pickup: zoneOf(pickup), dropoff: zoneOf(dropoff) };
  const base = { town, night, flat: null, special: null, regular: null, choice: null, choose: null };

  if (stops.pickup.poblacion && stops.dropoff.poblacion) {
    return { ...base, special: { fare: POBLACION.special[period], origin: 'poblacion', area: null } };
  }

  // From the Buna Cerca junction (pilahan) the taripa lists its own fares.
  const fromBunaCerca = near(pickup, TERMINALS.bunaCerca, TERMINALS.bunaCerca.radiusMeters);
  if (fromBunaCerca && stops.dropoff.poblacion) {
    return { ...base, special: { fare: TERMINALS.bunaCerca.special.poblacion[period], origin: 'bunaCerca', area: null } };
  }

  // Which stop's listed fare applies, and from where.
  let priced, origin;
  const cvsuStop = ['pickup', 'dropoff'].find((endpoint) => stops[endpoint].barangay === 'Kaytapos');
  const bancodStop = ['pickup', 'dropoff'].find((endpoint) => stops[endpoint].barangay === 'Bancod');
  if (stops.pickup.poblacion) {
    priced = 'dropoff';
    origin = near(pickup, TERMINALS.palengke, TERMINALS.palengke.radiusMeters) ? 'palengke' : 'poblacion';
  } else if (stops.dropoff.poblacion) {
    priced = 'pickup'; origin = 'poblacion';
  } else if (cvsuStop && bancodStop) {
    priced = bancodStop; origin = 'cvsu';
  } else {
    // Neither stop is in the Poblacion: the fare of the stop farther from
    // the town plaza, as if the trip started there.
    priced = haversineDistance(pickup, POBLACION.center) >= haversineDistance(dropoff, POBLACION.center) ? 'pickup' : 'dropoff';
    origin = 'poblacion';
  }

  const zone = stops[priced];
  if (!zone.areas.length) return { ...base, flat: FLAT_FARE };
  const resolved = resolveArea(zone, origin, areas[priced], period);
  const choice = resolved.options
    ? { endpoint: priced, barangay: zone.barangay, options: resolved.options, selected: resolved.area?.id ?? null } : null;
  if (!resolved.area) return { ...base, choice, choose: choice };
  const { area } = resolved;
  const bunaCercaArea = fromBunaCerca && priced === 'dropoff' ? TERMINALS.bunaCerca.special[area.id] : null;
  const special = bunaCercaArea
    ? { fare: bunaCercaArea[period], origin: 'bunaCerca', area: { id: area.id, label: area.label } }
    : { fare: specialFare(area, origin)[period], origin, area: { id: area.id, label: area.label } };

  // Regular per-passenger fares exist only between the Bancod puroks and the
  // Poblacion or the CvSU gate (TARIPA).
  const regularOrigin = origin === 'palengke' ? 'poblacion' : origin;
  const regularFares = area.regular?.[regularOrigin]?.[night ? 'night' : 'day'];
  const regular = regularFares ? { price: regularFares[0], student: regularFares[1], origin: regularOrigin, area: special.area } : null;
  return { ...base, choice, special, regular };
}

// The total for a quote: a flat fare; a special trip's fare covering two
// passengers, plus the per-passenger charge for each one after that; or the
// regular fare per passenger, with the discounted fare for those with an ID.
function fareTotal(quote, { type = 'special', passengers = 1, discounted = 0 } = {}) {
  if (quote.flat !== null && quote.flat !== undefined) return quote.flat;
  if (type === 'regular' && quote.regular) {
    const withId = Math.min(Math.max(0, discounted), passengers);
    return (passengers - withId) * quote.regular.price + withId * quote.regular.student;
  }
  if (!quote.special) return null;
  return quote.special.fare + Math.max(0, passengers - SPECIAL.basePassengers) * SPECIAL.extraPassenger;
}

// What the ride stores and both apps show beside the fare.
function fareDetails(quote, { type = 'special', passengers = 1, discounted = 0 } = {}) {
  const total = fareTotal(quote, { type, passengers, discounted });
  if (quote.flat !== null && quote.flat !== undefined) return { type: 'flat', night: quote.night, total };
  if (type === 'regular' && quote.regular) {
    const withId = Math.min(Math.max(0, discounted), passengers);
    return { type: 'regular', night: quote.night, total, area: quote.regular.area?.label ?? null,
      price: quote.regular.price, student: quote.regular.student, passengers, discounted: withId };
  }
  return { type: 'special', night: quote.night, total, area: quote.special?.area?.label ?? null, origin: quote.special?.origin ?? null,
    base: quote.special?.fare ?? null, extraPassengers: Math.max(0, passengers - SPECIAL.basePassengers), extraFare: SPECIAL.extraPassenger };
}

module.exports = {
  CVSU_ORIGIN: CVSU,
  FARE_AREAS: AREAS,
  FLAT_FARE,
  SPECIAL_RULES: SPECIAL,
  fareDetails,
  fareTotal,
  getFareArea: (id) => AREA_BY_ID.get(id) ?? null,
  isNightAt,
  quoteTrip,
};
