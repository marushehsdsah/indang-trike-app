const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORY_COLORS, categorizePlace, placeRank } = require('../utils/placeCategories');

test('places are grouped by what they are, not only by their tag', () => {
  assert.deepEqual([
    ['amenity', 'restaurant'], ['shop', 'bakery'], ['shop', 'convenience'], ['shop', 'chemist'], ['amenity', 'school'],
    ['healthcare', 'laboratory'], ['amenity', 'place_of_worship'], ['amenity', 'townhall'], ['public_transport', 'stop_position'],
    ['leisure', 'park'], ['tourism', 'hotel'], ['historic', 'ruins'], ['man_made', 'bridge'], ['man_made', 'pumping_station'],
    ['office', 'company'], ['landuse', 'retail_area'], ['landuse', 'residential_area'], ['place', 'village'], ['road', 'road'],
  ].map(([key, kind]) => categorizePlace(key, kind)), [
    'food', 'food', 'shopping', 'health', 'education', 'health', 'worship', 'government', 'transport', 'leisure', 'lodging',
    'landmark', 'landmark', 'services', 'services', 'shopping', 'area', 'area', 'road',
  ]);
});

test('landmarks people give directions by show before other establishments', () => {
  assert.equal(placeRank('education', 'school'), 1);
  assert.equal(placeRank('shopping', 'mall'), 1);
  assert.equal(placeRank('worship', 'place_of_worship'), 1);
  assert.equal(placeRank('landmark', 'bridge'), 1);
  assert.equal(placeRank('food', 'fast_food'), 2);
  assert.equal(placeRank('shopping', 'convenience'), 2);
  assert.equal(placeRank('area', 'residential_area'), 0);
});

test('every map category has a colour', () => {
  for (const category of ['food', 'shopping', 'education', 'health', 'worship', 'government', 'transport', 'leisure', 'lodging', 'landmark', 'services', 'area']) {
    assert.match(CATEGORY_COLORS[category], /^#[0-9a-f]{6}$/, category);
  }
});
