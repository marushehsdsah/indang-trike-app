const test = require('node:test');
const assert = require('node:assert/strict');
const { RATING_TAGS, formatRating, ratingSummary, tagsFor, validateRating } = require('../utils/rating');

test('offers praise for 4–5 stars and concerns for 1–3, by who is rated', () => {
  assert.deepEqual(tagsFor('driver', 5), RATING_TAGS.driver.praise);
  assert.deepEqual(tagsFor('driver', 4), RATING_TAGS.driver.praise);
  assert.deepEqual(tagsFor('driver', 3), RATING_TAGS.driver.concern);
  assert.deepEqual(tagsFor('passenger', 1), RATING_TAGS.passenger.concern);
  assert.deepEqual(tagsFor('passenger', 0.5), []);
  assert.deepEqual(tagsFor('admin', 5), []);
});

test('accepts a whole-star rating with matching tags and trims the comment', () => {
  assert.deepEqual(validateRating({ stars: 5, tags: ['Safe driving', 'Friendly', 'Friendly'], comment: '  Salamat po!  ' }, 'driver'),
    { stars: 5, tags: ['Safe driving', 'Friendly'], comment: 'Salamat po!', flagged: false });
  assert.deepEqual(validateRating({ stars: 3 }, 'passenger'), { stars: 3, tags: [], comment: '', flagged: false });
});

test('flags safety concerns for admins', () => {
  assert.equal(validateRating({ stars: 1, tags: ['Unsafe driving'] }, 'driver').flagged, true);
  assert.equal(validateRating({ stars: 2, tags: ['Did not pay'] }, 'passenger').flagged, true);
  assert.equal(validateRating({ stars: 2, tags: ['Rude'] }, 'passenger').flagged, false);
});

test('rejects stars outside 1–5, tags that do not fit, and long comments', () => {
  for (const stars of [0, 6, 4.5, '5', undefined]) assert.throws(() => validateRating({ stars }, 'driver'), /1 to 5 stars/);
  assert.throws(() => validateRating({ stars: 5, tags: ['Unsafe driving'] }, 'driver'), /tags from the list/, 'a concern on a 5-star rating');
  assert.throws(() => validateRating({ stars: 1, tags: ['Did not pay'] }, 'driver'), /tags from the list/, 'a passenger tag about a driver');
  assert.throws(() => validateRating({ stars: 4, tags: 'Polite' }, 'passenger'), /tags from the list/);
  assert.throws(() => validateRating({ stars: 4, comment: 'x'.repeat(201) }, 'passenger'), /200 characters/);
  assert.throws(() => validateRating({ stars: 4, comment: 7 }, 'passenger'), /200 characters/);
});

test('summarizes running totals to one decimal, and shows New before any rating', () => {
  assert.deepEqual(ratingSummary({ ratingSum: 14, ratingCount: 3 }), { average: 4.7, count: 3 });
  assert.deepEqual(ratingSummary({}), { average: null, count: 0 });
  assert.equal(formatRating({ average: 4.7, count: 3 }), '4.7 (3)');
  assert.equal(formatRating({ average: 5, count: 1 }), '5.0 (1)');
  assert.equal(formatRating({ average: null, count: 0 }), 'New');
  assert.equal(formatRating(undefined), 'New');
});
