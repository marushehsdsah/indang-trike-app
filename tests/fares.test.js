const test = require('node:test');
const assert = require('node:assert/strict');
const { FARE_AREAS, FLAT_FARE, TARIPA_PRICES, fareDetails, farePrices, fareTotal, isNightAt, quoteTrip } = require('../data/fares');
const { BARANGAY_NAMES, getBarangayAt } = require('../data/todaZones');

// Fares from TODAs_coordinates (1).xlsx: sheet 2 (Municipal Ordinance No. 267
// s. 2023, Section 2) and TARIPA (Bancod TODA).
const at = (latitude, longitude) => ({ latitude, longitude });
const PLAZA = at(14.19576, 120.87849); // Barangay 1
const MARKET = at(14.20049, 120.87288); // Palengke sub-terminal, Barangay 4
const ALULOD_SCHOOL = at(14.20623, 120.88944);
const BANCOD_SCHOOL = at(14.21077, 120.87758);
const CVSU = at(14.19782, 120.88149); // Kaytapos
// Points in each distance band from the plaza (data/fares.js resolveArea).
const ALULOD_NEAR = at(14.19503, 120.88874), ALULOD_MID = at(14.19616, 120.89526), ALULOD_FAR = at(14.21201, 120.89707);
const BANCOD_PUROK_2 = at(14.2101, 120.87569), BANCOD_PUROK_3 = at(14.2186, 120.87265);
const PULO = at(14.16990, 120.87269);
// Near Indang's southern and northern tips.
const MAHABANGKAHOY_LEJOS = at(14.124982, 120.925313), CALUMPANG_LEJOS = at(14.242597, 120.861345);
const BUNA_CERCA_JUNCTION = at(14.18569, 120.88727);
const OUTSIDE_INDANG = at(14.386264, 120.880802); // General Trias City Hall
// 2026-10-02 in Philippine time (UTC+8).
const manila = (hours, minutes) => Date.UTC(2026, 9, 2, hours - 8, minutes);
const DAY = manila(10, 0), NIGHT = manila(22, 0);

test('day and night follow the ordinance, in Philippine time', () => {
  assert.equal(isNightAt(manila(20, 59)), false);
  assert.equal(isNightAt(manila(21, 0)), true);
  assert.equal(isNightAt(manila(4, 0)), true);
  assert.equal(isNightAt(manila(4, 1)), false);
});

test('within the Poblacion a special trip is ₱30, ₱35 at night', () => {
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: MARKET, at: DAY }).special.fare, 30);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: MARKET, at: NIGHT }).special.fare, 35);
});

test('a barangay with several listed areas is priced by distance from the town, never by asking', () => {
  // Alulod: Bukana near the town, School further, the Dulo end farthest.
  const near = quoteTrip({ pickup: PLAZA, dropoff: ALULOD_NEAR, at: DAY });
  assert.equal(near.special.area.label, 'Alulod · Bukana / Barangay Hall / Patilyo');
  assert.equal(near.special.fare, 35);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: ALULOD_MID, at: DAY }).special.fare, 40);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: ALULOD_MID, at: NIGHT }).special.fare, 50);
  const far = quoteTrip({ pickup: PLAZA, dropoff: ALULOD_FAR, at: DAY });
  assert.equal(far.special.area.label, 'Alulod · Iglesia ni Cristo / Patilyo Dulo');
  assert.equal(far.special.fare, 50);
  assert.equal('choose' in near || 'choice' in near, false, 'nothing for the rider to pick');
  // Every point in a multi-area barangay gets a fare.
  for (const point of [ALULOD_SCHOOL, BANCOD_SCHOOL, CVSU]) assert.ok(Number.isFinite(quoteTrip({ pickup: PLAZA, dropoff: point, at: DAY }).special.fare));
});

test('from the Palengke sub-terminal its own table applies', () => {
  const quote = quoteTrip({ pickup: MARKET, dropoff: ALULOD_MID, at: DAY });
  assert.equal(quote.special.fare, 45);
  assert.equal(quote.special.origin, 'palengke');
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: CVSU, at: DAY }).special.fare, 30);
  assert.equal(quoteTrip({ pickup: MARKET, dropoff: CVSU, at: DAY }).special.fare, 30);
  // Kaytapos's areas cost the same from the Poblacion but not from the
  // Palengke, so from there its farther Upland side is ₱35.
  const upland = at(14.19339, 120.88396);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: upland, at: DAY }).special.fare, 30);
  assert.equal(quoteTrip({ pickup: MARKET, dropoff: upland, at: DAY }).special.area.label, 'Kaytapos · Upland / Rough Road Subdivision');
  assert.equal(quoteTrip({ pickup: MARKET, dropoff: upland, at: DAY }).special.fare, 35);
});

test('Bancod has special fares per purok (TARIPA), by distance; regular trips are not offered', () => {
  const day = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: DAY });
  assert.equal(day.special.area.label, 'Bancod · Purok III');
  assert.equal(day.special.fare, 34);
  assert.equal(day.regular, undefined);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: NIGHT }).special.fare, 39);
  assert.equal(quoteTrip({ pickup: CVSU, dropoff: BANCOD_PUROK_2, at: DAY }).special.fare, 30);
});

test('a special trip covers two passengers, then ₱15 each', () => {
  const quote = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: DAY });
  assert.equal(fareTotal(quote, { passengers: 2 }), 34);
  assert.equal(fareTotal(quote, { passengers: 4 }), 34 + 30);
  assert.deepEqual(fareDetails(quote, { passengers: 3 }),
    { type: 'special', night: false, total: 49, area: 'Bancod · Purok III', origin: 'poblacion', base: 34, extraPassengers: 1, extraFare: 15 });
});

test('a trip through the town pays both barangays\' listed fares, added together', () => {
  const quote = quoteTrip({ pickup: ALULOD_SCHOOL, dropoff: PULO, at: DAY });
  assert.equal(quote.special.fare, 35 + 75);
  assert.equal(quote.special.area.label, 'Alulod · Bukana / Barangay Hall / Patilyo + Pulo');
  // End to end of Indang: Mahabang Kahoy Balagbag (₱110) and Calumpang Lejos Dulo (₱50).
  const across = quoteTrip({ pickup: MAHABANGKAHOY_LEJOS, dropoff: CALUMPANG_LEJOS, at: DAY });
  assert.equal(across.special.fare, 110 + 50);
  assert.equal(fareTotal(across, { passengers: 1 }), 160);
});

test('a trip within one barangay pays its farther stop\'s fare, unless its route goes through the town', () => {
  assert.equal(quoteTrip({ pickup: ALULOD_FAR, dropoff: ALULOD_NEAR, at: DAY }).special.fare, 50);
  // The road route decides: here it passes the plaza, so both legs pay.
  const viaTown = quoteTrip({ pickup: ALULOD_FAR, dropoff: ALULOD_NEAR, route: [ALULOD_FAR, PLAZA, ALULOD_NEAR], at: DAY });
  assert.equal(viaTown.special.fare, 50 + 35);
});

test('from the Buna Cerca junction to the Plaza is ₱25', () => {
  assert.equal(quoteTrip({ pickup: BUNA_CERCA_JUNCTION, dropoff: PLAZA, at: DAY }).special.fare, 25);
});

test('a pickup outside Indang gets the flat fare, not a taripa fare', () => {
  const quote = quoteTrip({ pickup: OUTSIDE_INDANG, dropoff: at(14.3852, 120.8806), at: DAY });
  assert.equal(quote.flat, FLAT_FARE);
  assert.equal(fareTotal(quote, { passengers: 4 }), FLAT_FARE);
});

test('every Indang barangay outside the Poblacion has a listed fare', () => {
  const priced = new Set(FARE_AREAS.flatMap((area) => area.barangays));
  const poblacion = ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4'];
  assert.deepEqual(BARANGAY_NAMES.filter((name) => !priced.has(name) && !poblacion.includes(name)), []);
  assert.deepEqual([...priced].filter((name) => !BARANGAY_NAMES.includes(name)), []);
  assert.equal(getBarangayAt(PULO), 'Pulo');
});

// Fares an admin changed in God view (indang-trike-backend/fares.js), by key.
test('every taripa amount has a key, and the prices in force fill in the taripa for any not changed', () => {
  assert.equal(TARIPA_PRICES.flat, FLAT_FARE);
  assert.equal(TARIPA_PRICES.extraPassenger, 15);
  assert.deepEqual([TARIPA_PRICES['poblacion/day'], TARIPA_PRICES['poblacion/night']], [30, 35]);
  assert.deepEqual([TARIPA_PRICES['bunaCerca/poblacion/day'], TARIPA_PRICES['bunaCerca/mahabangkahoy-cerca/night']], [25, 40]);
  assert.equal(TARIPA_PRICES['area/alulod-school/special/palengke/day'], 45);
  assert.equal(Object.keys(TARIPA_PRICES).some((key) => key.includes('/regular/')), false, 'regular trips are not offered, so they have no fares to change');
  assert.ok(Object.isFrozen(TARIPA_PRICES));
  const prices = farePrices({ 'poblacion/day': 32, flat: 0, extraPassenger: 'x', unknown: 9 });
  assert.equal(prices['poblacion/day'], 32);
  assert.equal(prices.flat, FLAT_FARE, 'a zero, a word or an unknown key leaves the taripa in force');
  assert.equal(prices.extraPassenger, 15);
  assert.equal('unknown' in prices, false);
  assert.deepEqual(Object.keys(prices), Object.keys(TARIPA_PRICES));
});

test('a quote charges the fares changed in God view: special, Buna Cerca, flat and extra passengers', () => {
  const prices = {
    'poblacion/day': 32, 'area/bancod-purok-3/special/poblacion/night': 45, 'bunaCerca/poblacion/day': 28, flat: 50, extraPassenger: 20,
  };
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: MARKET, at: DAY, prices }).special.fare, 32);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: MARKET, at: NIGHT, prices }).special.fare, 35, 'the night fare was not changed');
  const night = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: NIGHT, prices });
  assert.equal(night.special.fare, 45);
  assert.equal(fareTotal(night, { passengers: 4 }), 45 + 2 * 20);
  assert.deepEqual(fareDetails(night, { passengers: 3 }).extraFare, 20);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: DAY, prices }).special.fare, 34, 'the day fare was not changed');
  assert.equal(quoteTrip({ pickup: BUNA_CERCA_JUNCTION, dropoff: PLAZA, at: DAY, prices }).special.fare, 28);
  const outside = quoteTrip({ pickup: OUTSIDE_INDANG, dropoff: at(14.3852, 120.8806), at: DAY, prices });
  assert.equal(fareTotal(outside, { passengers: 4 }), 50);
  // Without prices, or with the taripa's, the quote is the taripa's.
  assert.deepEqual(quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: NIGHT, prices: farePrices() }), quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: NIGHT }));
  // A quote saved before extraPassenger existed still totals with the taripa's.
  const { extraPassenger, ...older } = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_PUROK_3, at: DAY });
  assert.equal(extraPassenger, 15);
  assert.equal(fareTotal(older, { passengers: 3 }), 34 + 15);
});

test('a trip through the town pays both barangays\' fares as changed in God view', () => {
  const taripa = quoteTrip({ pickup: ALULOD_SCHOOL, dropoff: PULO, at: DAY });
  assert.equal(taripa.special.legs.length, 2);
  const prices = Object.fromEntries(taripa.special.legs.map((leg, index) => [`area/${leg.area.id}/special/${leg.origin}/day`, leg.fare + 5 * (index + 1)]));
  const changed = quoteTrip({ pickup: ALULOD_SCHOOL, dropoff: PULO, at: DAY, prices });
  assert.equal(changed.special.fare, 35 + 5 + 75 + 10);
  assert.deepEqual(changed.special.legs.map((leg) => leg.area.id), taripa.special.legs.map((leg) => leg.area.id), 'a changed fare never moves a stop to another area');
});

test('changing a fare never moves a stop into another area of its barangay', () => {
  // Alulod's bands follow the taripa (Bukana nearest the town): making
  // Bukana the dearest does not price the far end as Bukana.
  const prices = { 'area/alulod-bukana/special/poblacion/day': 90, 'area/alulod-bukana/special/poblacion/night': 95 };
  const near = quoteTrip({ pickup: PLAZA, dropoff: ALULOD_NEAR, at: DAY, prices });
  assert.equal(near.special.area.id, 'alulod-bukana');
  assert.equal(near.special.fare, 90);
  const far = quoteTrip({ pickup: PLAZA, dropoff: ALULOD_FAR, at: DAY, prices });
  assert.equal(far.special.area.id, 'alulod-dulo');
  assert.equal(far.special.fare, 50);
  // Kaytapos's two areas cost the same from the Poblacion, so either stop is
  // the CvSU area; once they differ, its far Upland side gets its own fare.
  const upland = at(14.19339, 120.88396);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: upland, at: DAY }).special.area.id, 'kaytapos-cvsu');
  const apart = quoteTrip({ pickup: PLAZA, dropoff: upland, at: DAY, prices: { 'area/kaytapos-upland/special/poblacion/day': 33 } });
  assert.equal(apart.special.area.id, 'kaytapos-upland');
  assert.equal(apart.special.fare, 33);
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: CVSU, at: DAY, prices: { 'area/kaytapos-upland/special/poblacion/day': 33 } }).special.fare, 30);
});
