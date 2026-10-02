const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STRINGS, translate } = require('../i18n/translate');
const { STATUS_LABELS } = require('../utils/rideState');
const { CATEGORY_COLORS } = require('../utils/placeCategories');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIRS = ['screens', 'components', 'hooks', 'i18n', 'navigation'];
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

function sourceFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return entry.name.endsWith('.js') && entry.name !== 'strings.js' ? [relative] : [];
  });
}

test('English and Filipino have the same keys and placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS.fil).sort(), Object.keys(STRINGS.en).sort());
  for (const [key, text] of Object.entries(STRINGS.en)) {
    assert.deepEqual(placeholders(STRINGS.fil[key]), placeholders(text), key);
    assert.ok(STRINGS.fil[key].trim(), `${key} is empty in Filipino`);
  }
});

test('every key written in the app source exists', () => {
  const missing = [];
  for (const file of SOURCE_DIRS.flatMap(sourceFiles)) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const [, key] of source.matchAll(/'([a-z][a-zA-Z]*(?:\.[a-zA-Z_-]+)+)'/g)) {
      if (!(key in STRINGS.en)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('keys built at runtime exist for every value they are built from', () => {
  const gpsStatuses = ['idle', 'locating', 'denied', 'approximate', 'disabled', 'inaccurate', 'stale', 'unavailable', 'ready'];
  const keys = [
    ...gpsStatuses.map((status) => `gps.${status}`),
    ...Object.keys(STATUS_LABELS).map((status) => `ride.status.${status}`), 'ride.status.none',
    ...['accepted', 'arrived', 'in_progress'].map((status) => `active.driverStatus.${status}`),
    ...['arrive', 'start', 'complete'].map((action) => `driver.action.${action}`),
    ...['start', 'complete', 'cancel'].flatMap((action) => [`active.confirm.${action}.title`, `active.confirm.${action}.message`]),
    ...[...Object.keys(CATEGORY_COLORS), 'road'].map((category) => `category.${category}`),
    ...['pickup', 'destination'].map((endpoint) => `route.outside.${endpoint}`),
    ...['pickup', 'destination', 'any'].map((endpoint) => `route.unsnappable.${endpoint}`),
    ...['continue', 'slight-left', 'left', 'sharp-left', 'slight-right', 'right', 'sharp-right'].map((type) => `guide.turn.${type}`),
    ...['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'].map((point) => `compass.${point}`),
    ...['outside', 'off-route', 'follow-route', 'no-route'].map((status) => `guide.status.${status}`),
    ...['arrive', 'complete'].flatMap((action) => [`active.${action}Hint`, `active.${action}NoGps`]),
  ];
  assert.deepEqual(keys.filter((key) => !(key in STRINGS.en)), []);
});

test('translate fills placeholders and falls back to English', () => {
  assert.equal(translate('fil', 'trip.book', { fare: '₱45.00' }), 'I-book ang trike · ₱45.00');
  assert.equal(translate('en', 'status.liveIn', { town: 'Indang' }), 'Indang · live GPS');
  assert.equal(translate('xx', 'common.done'), 'Done');
  assert.equal(translate('en', 'no.such.key'), 'no.such.key');
});
