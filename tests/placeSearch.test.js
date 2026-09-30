const test = require('node:test');
const assert = require('node:assert/strict');
const { mergePlaces, normalizeSearchText, searchPlaces } = require('../utils/placeSearch');

const place = (id, name, latitude = 14.2, longitude = 120.88) => ({
  id,
  name,
  kind: 'test',
  coordinate: { latitude, longitude },
});

const PLACES = [
  place('node/1', 'Cavite State University'),
  place('way/2', 'Indang Public Market'),
  place('node/3', 'Índang Plaza'),
  place('way/4', 'Kayquit Road'),
  place('node/5', 'Indang'),
  place('node/6', 'Bayan ng Indang'),
  place('node/7', 'Kaindangan Store'),
];

const names = (results) => results.map(({ name }) => name);

test('normalizes case, diacritics, punctuation, and whitespace', () => {
  assert.equal(normalizeSearchText('  Índang–Trece   Martires Rd. '), 'indang trece martires rd');
  assert.equal(normalizeSearchText('CAVITE-state'), 'cavite state');
  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText('!!!'), '');
});

test('returns nothing for empty, whitespace, or punctuation-only queries', () => {
  assert.deepEqual(searchPlaces(PLACES, ''), []);
  assert.deepEqual(searchPlaces(PLACES, '   '), []);
  assert.deepEqual(searchPlaces(PLACES, '!!!'), []);
  assert.deepEqual(searchPlaces(PLACES, ' -- '), []);
  assert.deepEqual(searchPlaces(PLACES, undefined), []);
});

test('ranks a name prefix first', () => {
  assert.equal(searchPlaces(PLACES, 'cavite')[0].name, 'Cavite State University');
  assert.equal(searchPlaces(PLACES, 'CAVITE-state')[0].name, 'Cavite State University');
});

test('ranks exact, prefix, word-prefix, then substring matches', () => {
  assert.deepEqual(names(searchPlaces(PLACES, 'indang')), [
    'Indang',
    'Índang Plaza',
    'Indang Public Market',
    'Bayan ng Indang',
    'Kaindangan Store',
  ]);
});

test('matches accented names from unaccented queries and vice versa', () => {
  assert.deepEqual(names(searchPlaces(PLACES, 'indang plaza')), ['Índang Plaza']);
  assert.deepEqual(names(searchPlaces(PLACES, 'ÍNDANG PLAZA')), ['Índang Plaza']);
});

test('breaks ties by normalized name, then ID', () => {
  const tied = [place('node/9', 'Indang Plaza'), place('node/3', 'Índang Plaza'), place('node/4', 'Indang Park')];
  assert.deepEqual(searchPlaces(tied, 'indang p').map(({ id }) => id), ['node/4', 'node/3', 'node/9']);
});

test('truncates to the limit deterministically and returns the original objects', () => {
  const results = searchPlaces(PLACES, 'indang', 2);
  assert.deepEqual(names(results), ['Indang', 'Índang Plaza']);
  assert.equal(results[0], PLACES[4]);
  assert.equal(searchPlaces(PLACES, 'indang').length, 5);
  assert.equal(searchPlaces(PLACES, 'a').length, 6, 'default limit is six');
});

test('merges place lists by normalized name and rounded coordinate', () => {
  const graphPlaces = [
    place('node/1', 'Cavite State University', 14.19781, 120.88164),
    place('node/2', 'Harasan', 14.159878, 120.869973),
  ];
  const defaults = [
    place('default/cvsu', 'CvSU Main Campus', 14.197805, 120.881639),
    place('default/cavite', 'Cavite State University', 14.197805, 120.881639),
    place('default/harasan', 'Harasan', 14.2, 120.9),
  ];

  assert.deepEqual(mergePlaces(graphPlaces, defaults).map(({ id }) => id), [
    'node/1',
    'node/2',
    'default/cvsu',
    'default/harasan',
  ]);
});
