const test = require('node:test');
const assert = require('node:assert/strict');
const { FARE_AREAS, FLAT_FARE, fareDetails, fareTotal, isNightAt, quoteTrip } = require('../data/fares');
const { BARANGAY_NAMES, getBarangayAt } = require('../data/todaZones');

// Fares from TODAs_coordinates (1).xlsx: sheet 2 (Municipal Ordinance No. 267
// s. 2023, Section 2) and TARIPA (Bancod TODA).
const at = (latitude, longitude) => ({ latitude, longitude });
const PLAZA = at(14.19576, 120.87849); // Barangay 1
const MARKET = at(14.20049, 120.87288); // Palengke sub-terminal, Barangay 4
const ALULOD_SCHOOL = at(14.20623, 120.88944);
const BANCOD_SCHOOL = at(14.21077, 120.87758);
const CVSU = at(14.19782, 120.88149); // Kaytapos
const PULO = at(14.16990, 120.87269);
const BUNA_CERCA_JUNCTION = at(14.18569, 120.88727);
const GENTRI_CITY_HALL = at(14.386264, 120.880802);
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

test('a barangay with several listed areas asks the rider which one', () => {
  const ask = quoteTrip({ pickup: PLAZA, dropoff: ALULOD_SCHOOL, at: DAY });
  assert.equal(ask.special, null);
  assert.equal(ask.choose.endpoint, 'dropoff');
  assert.equal(ask.choose.barangay, 'Alulod');
  assert.deepEqual(ask.choose.options.map(({ fare }) => fare), [35, 40, 50]);
  const school = quoteTrip({ pickup: PLAZA, dropoff: ALULOD_SCHOOL, at: DAY, areas: { dropoff: 'alulod-school' } });
  assert.equal(school.special.fare, 40);
  assert.equal(school.choose, null);
  assert.equal(school.choice.selected, 'alulod-school', 'the options stay available to change');
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: ALULOD_SCHOOL, at: NIGHT, areas: { dropoff: 'alulod-school' } }).special.fare, 50);
});

test('from the Palengke sub-terminal its own table applies', () => {
  const quote = quoteTrip({ pickup: MARKET, dropoff: ALULOD_SCHOOL, at: DAY, areas: { dropoff: 'alulod-school' } });
  assert.equal(quote.special.fare, 45);
  assert.equal(quote.special.origin, 'palengke');
  // Kaytapos areas cost the same from the Poblacion, so no choice is needed there.
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: CVSU, at: DAY }).special.fare, 30);
  assert.ok(quoteTrip({ pickup: MARKET, dropoff: CVSU, at: DAY }).choose);
});

test('Bancod has special and regular fares per purok (TARIPA)', () => {
  const day = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_SCHOOL, at: DAY, areas: { dropoff: 'bancod-purok-3' } });
  assert.equal(day.special.fare, 34);
  assert.deepEqual([day.regular.price, day.regular.student], [17, 14]);
  const night = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_SCHOOL, at: NIGHT, areas: { dropoff: 'bancod-purok-3' } });
  assert.equal(night.special.fare, 39);
  assert.deepEqual([night.regular.price, night.regular.student], [19, 16]);
  const fromCvsu = quoteTrip({ pickup: CVSU, dropoff: BANCOD_SCHOOL, at: DAY, areas: { dropoff: 'bancod-purok-2' } });
  assert.equal(fromCvsu.special.fare, 30);
  assert.deepEqual([fromCvsu.regular.price, fromCvsu.regular.student], [15, 12]);
  // Only the Bancod routes have regular fares.
  assert.equal(quoteTrip({ pickup: PLAZA, dropoff: ALULOD_SCHOOL, at: DAY, areas: { dropoff: 'alulod-school' } }).regular, null);
});

test('a special trip covers two passengers, then ₱15 each; regular is per passenger with the ID discount', () => {
  const quote = quoteTrip({ pickup: PLAZA, dropoff: BANCOD_SCHOOL, at: DAY, areas: { dropoff: 'bancod-purok-3' } });
  assert.equal(fareTotal(quote, { type: 'special', passengers: 2 }), 34);
  assert.equal(fareTotal(quote, { type: 'special', passengers: 4 }), 34 + 30);
  assert.equal(fareTotal(quote, { type: 'regular', passengers: 3, discounted: 1 }), 2 * 17 + 14);
  assert.deepEqual(fareDetails(quote, { type: 'regular', passengers: 3, discounted: 1 }),
    { type: 'regular', night: false, total: 48, area: 'Bancod · Purok III', price: 17, student: 14, passengers: 3, discounted: 1 });
});

test('a trip between two barangays uses the farther stop\'s fare', () => {
  const quote = quoteTrip({ pickup: ALULOD_SCHOOL, dropoff: PULO, at: DAY });
  assert.equal(quote.special.fare, 75);
  assert.equal(quote.special.area.id, 'pulo');
});

test('from the Buna Cerca junction to the Plaza is ₱25', () => {
  assert.equal(quoteTrip({ pickup: BUNA_CERCA_JUNCTION, dropoff: PLAZA, at: DAY }).special.fare, 25);
});

test('General Trias keeps its flat fare', () => {
  const quote = quoteTrip({ pickup: GENTRI_CITY_HALL, dropoff: at(14.3852, 120.8806), at: DAY });
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
