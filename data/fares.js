const fareData = require('../assets/fares/indang-fares.json');
const { getMunicipalityAt } = require('./indangMap');
const { getBarangayAt } = require('./todaZones');
const { haversineDistance } = require('../utils/pathfinding');
const { createMapPolygons } = require('../utils/geojson');
const barangayBoundaries = require('../assets/geo/indang-barangays.json');

// Tricycle fares from Indang's taripa (assets/fares/indang-fares.json, from
// TODAs_coordinates (1).xlsx). Every booking is a special trip: the whole
// trike, priced per trip (the taripa's per-passenger regular fares are not
// offered in the app). Every fare is [day, night].
// The app shows the quote; the server recomputes it with its own clock.
//
// Admins can change the amounts in God view when the fares change
// (indang-trike-backend/fares.js); the server sends them to the app as
// `prices`. Only amounts change: the areas, their barangays and the rules
// stay as the taripa lists them.

// A stop the taripa does not list, or a pickup outside Indang: a flat fare
// per trip.
const FLAT_FARE = 45;
const MANILA_OFFSET_MINUTES = 8 * 60;
const { night: NIGHT, special: SPECIAL, poblacion: POBLACION, terminals: TERMINALS, cvsuOrigin: CVSU } = fareData;
const AREAS = fareData.areas;
const AREA_BY_ID = new Map(AREAS.map((area) => [area.id, area]));
const PERIODS = ['day', 'night'];

// Every amount an admin may change, by key, at its taripa amount (pesos):
//   flat                                          the flat fare (FLAT_FARE)
//   extraPassenger                                each passenger past two on a special trip
//   poblacion/<period>                            a special trip within the Poblacion
//   bunaCerca/<to>/<period>                       from the Buna Cerca junction
//   area/<id>/special/<origin>/<period>           a special trip, per trip
// where <period> is day or night. (The taripa's regular per-passenger fares
// are not offered, so they have no key.)
const TARIPA_PRICES = (() => {
  const prices = { flat: FLAT_FARE, extraPassenger: SPECIAL.extraPassenger };
  const pair = (key, fare) => PERIODS.forEach((period, index) => { prices[`${key}/${period}`] = fare[index]; });
  pair('poblacion', POBLACION.special);
  for (const [to, fare] of Object.entries(TERMINALS.bunaCerca.special)) pair(`bunaCerca/${to}`, fare);
  for (const area of AREAS) {
    for (const [origin, fare] of Object.entries(area.special)) pair(`area/${area.id}/special/${origin}`, fare);
  }
  return Object.freeze(prices);
})();

// The amount for a key: the one in `prices` (the fares set in God view) when
// it is a positive number, otherwise the taripa's.
function priceLookup(prices) {
  return (key) => {
    const value = prices && Object.hasOwn(prices, key) ? prices[key] : undefined;
    return Number.isFinite(value) && value > 0 ? value : TARIPA_PRICES[key];
  };
}
const taripaPrice = priceLookup(null);

// Every key with the amount in force.
function farePrices(prices) {
  const price = priceLookup(prices);
  return Object.fromEntries(Object.keys(TARIPA_PRICES).map((key) => [key, price(key)]));
}

// An amount to the centavo. Fares set in God view may have centavos (₱12.50),
// and adding such amounts in floating point leaves a trace (10.15 + 5.30 is
// 15.450000000000001), so every total is rounded to two decimal places.
const roundToCentavos = (amount) => Math.round(amount * 100) / 100;

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

// An area's special-trip fare [day, night] from an origin, falling back to
// the Poblacion table, which every area has.
function specialFare(price, area, origin) {
  const key = `area/${area.id}/special/${area.special[origin] ? origin : 'poblacion'}`;
  return PERIODS.map((period) => price(`${key}/${period}`));
}

const BARANGAY_SHAPES = new Map(barangayBoundaries.features.map((feature) => [
  feature.properties.name, createMapPolygons({ type: 'FeatureCollection', features: [feature] }),
]));
const plazaDistance = (coordinate) => haversineDistance(coordinate, POBLACION.center);
const plazaRanges = new Map();
// How far the barangays an area list covers reach from the town plaza: their
// nearest and farthest outline points.
function plazaRange(areas) {
  const barangays = [...new Set(areas.flatMap((area) => area.barangays))].sort();
  const key = barangays.join('|');
  if (!plazaRanges.has(key)) {
    let min = Infinity, max = 0;
    for (const name of barangays) for (const { coordinates } of BARANGAY_SHAPES.get(name) ?? []) {
      for (const point of coordinates) { const distance = plazaDistance(point); min = Math.min(min, distance); max = Math.max(max, distance); }
    }
    plazaRanges.set(key, { min, max });
  }
  return plazaRanges.get(key);
}

// The area the priced stop is in, by distance: the taripa names a barangay's
// areas but not where they are, and its parts farther from the town (Dulo)
// cost more than those near it (Bukana). So the barangay's reach from the
// plaza is split into equal bands, cheapest area nearest, and the stop takes
// the area of its band. One area, or areas that all cost the same from this
// trip's origin (day and night), need no band. Prices are compared from the
// origin itself: Kaytapos's areas cost the same from the Poblacion but not
// from the Palengke.
// The bands follow the taripa's own amounts, so a fare changed in God view
// changes what an area costs, never where it is.
function resolveArea(zone, origin, price = taripaPrice) {
  const { areas } = zone;
  if (areas.length <= 1) return areas[0] ?? null;
  const listed = (area) => specialFare(taripaPrice, area, origin);
  const outward = [...areas].sort((a, b) => listed(a)[0] - listed(b)[0] || listed(a)[1] - listed(b)[1]);
  const fareKey = (area) => specialFare(price, area, origin).join('/');
  if (new Set(areas.map(fareKey)).size === 1) return outward[0];
  const { min, max } = plazaRange(areas);
  const share = max > min ? Math.min(Math.max((plazaDistance(zone.coordinate) - min) / (max - min), 0), 1) : 0;
  return outward[Math.min(outward.length - 1, Math.floor(share * outward.length))];
}

// Where a trip comes nearest the town plaza: on its road route when given
// (both the app and the server have it), else on the straight line between
// the stops.
function junctionOf(pickup, dropoff, route) {
  const points = route?.length >= 2 ? route
    : Array.from({ length: 21 }, (_, i) => ({ latitude: pickup.latitude + (dropoff.latitude - pickup.latitude) * i / 20,
      longitude: pickup.longitude + (dropoff.longitude - pickup.longitude) * i / 20 }));
  return points.reduce((best, point) => (plazaDistance(point) < plazaDistance(best) ? point : best));
}

// A stop's fare from an origin in a period (day or night): its area
// (resolveArea) and that area's fare in force.
function legFare(zone, origin, period, price) {
  const area = resolveArea(zone, origin, price);
  return { fare: specialFare(price, area, origin)[PERIODS.indexOf(period)], area: { id: area.id, label: area.label } };
}

// What a trip between two coordinates costs at `at` (ms). `route` is the
// trip's road route (a list of coordinates), when known. Returns { town,
// night, flat } for a flat fare, or { town, night, special }. The taripa lists
// each barangay's fare from the town, so a trip is priced by the barangays it
// crosses: a leg from a stop into another barangay or the Poblacion pays that
// stop's listed fare, and a trip with two such legs (through the town, or from
// one barangay into another) pays both, added together. A barangay with
// several areas is priced by the stop's distance from the town plaza
// (resolveArea), never by asking the rider.
// `prices` holds the fares set in God view, by key (TARIPA_PRICES); any it
// lacks are the taripa's. extraPassenger is what each passenger past two adds
// to a special trip.
function quoteTrip({ pickup, dropoff, route = null, at = Date.now(), prices = null }) {
  const price = priceLookup(prices);
  const town = getMunicipalityAt(pickup)?.name ?? null;
  const night = isNightAt(at);
  const extraPassenger = price('extraPassenger');
  if (town !== 'Indang') return { town, night, flat: price('flat'), special: null, extraPassenger };
  const period = night ? 'night' : 'day';
  const stops = { pickup: zoneOf(pickup), dropoff: zoneOf(dropoff) };
  const base = { town, night, flat: null, special: null, extraPassenger };

  if (stops.pickup.poblacion && stops.dropoff.poblacion) {
    return { ...base, special: { fare: price(`poblacion/${period}`), origin: 'poblacion', area: null, legs: [] } };
  }

  // From the Buna Cerca junction (pilahan) the taripa lists its own fares.
  const fromBunaCerca = near(pickup, TERMINALS.bunaCerca, TERMINALS.bunaCerca.radiusMeters);
  if (fromBunaCerca && stops.dropoff.poblacion) {
    return { ...base, special: { fare: price(`bunaCerca/poblacion/${period}`), origin: 'bunaCerca', area: null, legs: [] } };
  }

  // Which stops' listed fares apply, and from where.
  let priced, origin;
  const cvsuStop = ['pickup', 'dropoff'].find((endpoint) => stops[endpoint].barangay === 'Kaytapos');
  const bancodStop = ['pickup', 'dropoff'].find((endpoint) => stops[endpoint].barangay === 'Bancod');
  if (stops.pickup.poblacion) {
    priced = ['dropoff'];
    origin = near(pickup, TERMINALS.palengke, TERMINALS.palengke.radiusMeters) ? 'palengke' : 'poblacion';
  } else if (stops.dropoff.poblacion) {
    priced = ['pickup']; origin = 'poblacion';
  } else if (cvsuStop && bancodStop) {
    priced = [bancodStop]; origin = 'cvsu';
  } else {
    // Neither stop is in the Poblacion. Each stop whose leg leaves its own
    // barangay before the trip turns back from the town pays its fare; a trip
    // within one barangay, or out along one road, pays the farther stop's.
    origin = 'poblacion';
    const junction = zoneOf(junctionOf(pickup, dropoff, route));
    priced = junction.barangay ? ['pickup', 'dropoff'].filter((endpoint) => junction.poblacion || stops[endpoint].barangay !== junction.barangay) : [];
    if (!priced.length) priced = [plazaDistance(pickup) >= plazaDistance(dropoff) ? 'pickup' : 'dropoff'];
  }

  if (priced.some((endpoint) => !stops[endpoint].areas.length)) return { ...base, flat: price('flat') };
  const legs = priced.map((endpoint) => {
    const leg = legFare(stops[endpoint], origin, period, price);
    const fromJunction = fromBunaCerca && endpoint === 'dropoff' && priced.length === 1 && Object.hasOwn(TERMINALS.bunaCerca.special, leg.area.id);
    return fromJunction ? { ...leg, fare: price(`bunaCerca/${leg.area.id}/${period}`), origin: 'bunaCerca' } : { ...leg, origin };
  });
  const fare = roundToCentavos(legs.reduce((sum, leg) => sum + leg.fare, 0));
  const area = legs.length === 1 ? legs[0].area : { id: legs.map((leg) => leg.area.id).join('+'), label: legs.map((leg) => leg.area.label).join(' + ') };
  return { ...base, special: { fare, origin: legs[0].origin, area, legs } };
}

// What each passenger past two adds to a special trip: the quote's, or the
// taripa's for a quote saved without it.
const extraPassengerFare = (quote) => (Number.isFinite(quote.extraPassenger) ? quote.extraPassenger : SPECIAL.extraPassenger);

// The total for a quote: a flat fare, or a special trip's fare covering two
// passengers, plus the per-passenger charge for each one after that.
function fareTotal(quote, { passengers = 1 } = {}) {
  if (quote.flat !== null && quote.flat !== undefined) return quote.flat;
  if (!quote.special) return null;
  return roundToCentavos(quote.special.fare + Math.max(0, passengers - SPECIAL.basePassengers) * extraPassengerFare(quote));
}

// What the ride stores and both apps show beside the fare.
function fareDetails(quote, { passengers = 1 } = {}) {
  const total = fareTotal(quote, { passengers });
  if (quote.flat !== null && quote.flat !== undefined) return { type: 'flat', night: quote.night, total };
  return { type: 'special', night: quote.night, total, area: quote.special?.area?.label ?? null, origin: quote.special?.origin ?? null,
    base: quote.special?.fare ?? null, extraPassengers: Math.max(0, passengers - SPECIAL.basePassengers), extraFare: extraPassengerFare(quote) };
}

module.exports = {
  CVSU_ORIGIN: CVSU,
  FARE_AREAS: AREAS,
  FLAT_FARE,
  SPECIAL_RULES: SPECIAL,
  TARIPA_PRICES,
  fareDetails,
  farePrices,
  fareTotal,
  roundToCentavos,
  getFareArea: (id) => AREA_BY_ID.get(id) ?? null,
  isNightAt,
  quoteTrip,
};
