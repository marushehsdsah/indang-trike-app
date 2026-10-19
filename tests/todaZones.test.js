const test = require('node:test');
const assert = require('node:assert/strict');
const todaData = require('../assets/geo/indang-todas.json');
const { BARANGAY_NAMES, TODA_NAMES, findToda, getBarangayAt, getTodaZoneShape, todaName, todaServes } = require('../data/todaZones');

const at = (latitude, longitude) => ({ latitude, longitude });
// Pins from TODAs_coordinates.xlsx.
const PULO = at(14.16990, 120.87269), HARASAN = at(14.16053, 120.87006), CARASUCHI = at(14.14694, 120.88147);
const POBLACION = at(14.19558, 120.87956), BANCOD = at(14.21894, 120.87430);

test('Indang has 36 barangays and every TODA lists only real ones', () => {
  assert.equal(BARANGAY_NAMES.length, 36);
  assert.equal(TODA_NAMES.length, 13);
  for (const toda of todaData.todas) {
    for (const barangay of [...toda.barangays, ...toda.review.map((item) => item.barangay)]) assert.ok(BARANGAY_NAMES.includes(barangay), `${toda.name}: ${barangay}`);
  }
  assert.deepEqual(todaData.uncovered, [], 'ITODA serves every barangay');
});

test('no two TODAs share a name or alias', () => {
  const keys = todaData.todas.flatMap((toda) => [toda.name, ...toda.aliases].map((name) => name.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  assert.equal(new Set(keys).size, keys.length);
});

test('PITODA serves only the Poblacion and ITODA all of Indang', () => {
  const pitoda = findToda('PITODA'), itoda = findToda('ITODA');
  assert.deepEqual(pitoda.barangays, ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4']);
  assert.equal(pitoda.wholeTown, false);
  assert.equal(todaServes(pitoda, POBLACION, POBLACION), true);
  assert.equal(todaServes(pitoda, POBLACION, BANCOD), false, 'a destination outside the Poblacion');
  assert.equal(todaServes(pitoda, PULO, POBLACION), false, 'a pickup outside the Poblacion');
  assert.deepEqual(getTodaZoneShape(pitoda).features.map((feature) => feature.properties.name).sort(), ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4']);
  assert.deepEqual([...itoda.barangays].sort(), [...BARANGAY_NAMES].sort());
  assert.equal(itoda.wholeTown, true);
  assert.equal(todaServes(itoda, PULO, BANCOD), true);
  assert.equal(todaServes(itoda, CARASUCHI, POBLACION), true);
  assert.equal(TODA_NAMES.filter((name) => findToda(name).wholeTown).join(), 'ITODA', 'the only whole-town TODA');
});

test('drivers saved under the former "ITODA PITODA" are ITODA', () => {
  assert.equal(findToda('ITODA PITODA').name, 'ITODA');
  assert.equal(findToda('itoda-pitoda').name, 'ITODA');
  assert.equal(todaName('ITODA PITODA'), 'ITODA');
  assert.equal(todaName('pitoda'), 'PITODA');
  assert.equal(todaName('Test TODA'), 'Test TODA', 'any other TODA keeps its saved text');
  assert.equal(todaName(undefined), undefined);
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
