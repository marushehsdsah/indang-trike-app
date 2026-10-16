const test = require('node:test');
const assert = require('node:assert/strict');
const todaData = require('../assets/geo/indang-todas.json');
const { BARANGAY_NAMES, TODA_NAMES, findToda, getBarangayAt, getTodaZoneShape, todaServes } = require('../data/todaZones');

const at = (latitude, longitude) => ({ latitude, longitude });
// Pins from TODAs_coordinates.xlsx.
const PULO = at(14.16990, 120.87269), HARASAN = at(14.16053, 120.87006), CARASUCHI = at(14.14694, 120.88147);
const POBLACION = at(14.19558, 120.87956), BANCOD = at(14.21894, 120.87430);

test('Indang has 36 barangays and every TODA lists only real ones', () => {
  assert.equal(BARANGAY_NAMES.length, 36);
  assert.equal(TODA_NAMES.length, 12);
  for (const toda of todaData.todas) {
    for (const barangay of [...toda.barangays, ...toda.review.map((item) => item.barangay)]) assert.ok(BARANGAY_NAMES.includes(barangay), `${toda.name}: ${barangay}`);
  }
  assert.deepEqual(todaData.uncovered, ['Mahabangkahoy Lejos'], 'the one barangay no TODA lists');
});

test('PCHTI-TODA serves only Pulo, Carasuchi, Harasan and Tambo Ilaya', () => {
  const pchti = findToda('PCHTI-TODA');
  assert.deepEqual(pchti.barangays, ['Pulo', 'Carasuchi', 'Harasan', 'Tambo Ilaya']);
  assert.equal(todaServes(pchti, PULO, HARASAN), true);
  assert.equal(todaServes(pchti, CARASUCHI, PULO), true);
  assert.equal(todaServes(pchti, PULO, POBLACION), false, 'a destination outside its barangays');
  assert.equal(todaServes(pchti, BANCOD, PULO), false, 'a pickup outside its barangays');
  assert.deepEqual(getTodaZoneShape(pchti).features.map((feature) => feature.properties.name).sort(), ['Carasuchi', 'Harasan', 'Pulo', 'Tambo Ilaya']);
});

test('a TODA is found by its name however it is typed, other TODAs are not zoned', () => {
  assert.equal(findToda('pchti toda').name, 'PCHTI-TODA');
  assert.equal(findToda('Bancod Indang TODA').name, 'BITODA');
  assert.equal(findToda('tbktoda').name, 'GLITODA TBKTODA');
  assert.equal(findToda('General Trias TODA'), null);
  assert.equal(findToda(''), null);
  assert.equal(findToda(undefined), null);
});

test('points find their barangay, including just past a border, and none outside Indang', () => {
  assert.equal(getBarangayAt(PULO), 'Pulo');
  assert.equal(getBarangayAt(POBLACION), 'Barangay 1');
  assert.equal(getBarangayAt(BANCOD), 'Bancod');
  assert.equal(getBarangayAt(at(14.385026, 120.880477)), null, 'General Trias');
});
