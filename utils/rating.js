// Trip ratings, shared by the app and the backend. After a completed ride the
// passenger rates the driver and the driver rates the passenger: 1–5 stars,
// optional quick tags, and an optional comment. Each side sees the other's
// average before they meet (on the offer, or once a driver accepts).

const STAR_LABELS = { 1: 'Terrible', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Great' };
const MAX_COMMENT_LENGTH = 200;

// Tags about the person being rated, by their role. Four or five stars offer
// praise; three or fewer offer concerns.
const RATING_TAGS = {
  driver: {
    praise: ['Safe driving', 'Friendly', 'Clean tricycle', 'On time', 'Knew the route'],
    concern: ['Unsafe driving', 'Rude', 'Late pickup', 'Longer route', 'Asked for more than the fare', 'Plate did not match'],
  },
  passenger: {
    praise: ['Polite', 'Ready at pickup', 'Exact fare', 'Clear directions'],
    concern: ['Not at pickup', 'Rude', 'Did not pay', 'Unsafe behaviour', 'Wrong pickup point'],
  },
};

// Concerns about someone's safety or honesty. A rating with any of them is
// flagged as a safety report for admins to review.
const SAFETY_TAGS = new Set(['Unsafe driving', 'Asked for more than the fare', 'Plate did not match', 'Did not pay', 'Unsafe behaviour']);

function tagsFor(rateeRole, stars) {
  const set = RATING_TAGS[rateeRole];
  if (!set || !Number.isInteger(stars)) return [];
  return stars >= 4 ? set.praise : set.concern;
}

// Checks a submitted rating of someone in `rateeRole` and returns its clean
// form. Throws an Error with a message the rater can read.
function validateRating(body, rateeRole) {
  const stars = body?.stars;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error('Choose 1 to 5 stars.');
  const allowed = tagsFor(rateeRole, stars);
  const tags = body.tags === undefined ? [] : body.tags;
  if (!Array.isArray(tags) || tags.some((tag) => !allowed.includes(tag))) throw new Error('Choose tags from the list.');
  const comment = body.comment === undefined ? '' : body.comment;
  if (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comments can have at most ${MAX_COMMENT_LENGTH} characters.`);
  }
  const uniqueTags = [...new Set(tags)];
  return { stars, tags: uniqueTags, comment: comment.trim(), flagged: uniqueTags.some((tag) => SAFETY_TAGS.has(tag)) };
}

// { average, count } from a user's running totals; average is null before
// the first rating.
function ratingSummary(user) {
  const count = Number(user?.ratingCount) || 0, sum = Number(user?.ratingSum) || 0;
  return { average: count > 0 ? Math.round((sum / count) * 10) / 10 : null, count };
}

// "4.8 (12)", or "New" before the first rating.
function formatRating(summary) {
  if (!summary || summary.average === null || summary.average === undefined) return 'New';
  return `${summary.average.toFixed(1)} (${summary.count})`;
}

module.exports = {
  MAX_COMMENT_LENGTH,
  RATING_TAGS,
  SAFETY_TAGS,
  STAR_LABELS,
  formatRating,
  ratingSummary,
  tagsFor,
  validateRating,
};
