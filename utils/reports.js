// Driver reports about passengers, shared by the app, the backend and God
// view. Drivers do not rate passengers: after a trip they were assigned to
// (completed or cancelled) they can report the passenger, and an admin reviews
// the report in God view. Each report an admin upholds is one offense, and the
// penalty grows with each (penaltyFor).

const REPORT_REASONS = ['fake_booking', 'no_show', 'did_not_pay', 'unsafe', 'other'];
const REPORT_REASON_LABELS = {
  fake_booking: 'Fake booking',
  no_show: 'No-show at pickup',
  did_not_pay: 'Did not pay',
  unsafe: 'Rude or unsafe behaviour',
  other: 'Something else',
};
const MAX_REPORT_DETAILS = 300;
// A driver can report the passenger of a trip that ended with them assigned.
const REPORTABLE_STATUSES = ['completed', 'cancelled'];

const DAY_MS = 24 * 60 * 60 * 1000;
// First offense: 24 hours. Second: 3 days. Third and after: the account is
// disabled for good and its mobile number and email cannot sign up again.
function penaltyFor(offense) {
  if (offense <= 1) return { offense: 1, durationMs: DAY_MS, label: '24-hour suspension' };
  if (offense === 2) return { offense: 2, durationMs: 3 * DAY_MS, label: '3-day suspension' };
  return { offense, permanent: true, label: 'Permanently disabled' };
}

// Checks a submitted report and returns its clean form. Throws an Error with
// a message the driver can read.
function validateReport(body) {
  const reason = body?.reason;
  if (!REPORT_REASONS.includes(reason)) throw new Error('Choose what happened.');
  const details = body.details === undefined ? '' : body.details;
  if (typeof details !== 'string' || details.length > MAX_REPORT_DETAILS) throw new Error(`Details can have at most ${MAX_REPORT_DETAILS} characters.`);
  if (reason === 'other' && !details.trim()) throw new Error('Describe what happened.');
  return { reason, details: details.trim() };
}

// Whether an account is barred from the app right now, and why. A driver an
// admin terminated (indang-trike-backend/admin.js) is disabled too.
function suspensionOf(user, now = Date.now()) {
  if (user?.disabled) return { permanent: true, until: null, terminated: Boolean(user.terminatedAt) };
  const until = user?.suspendedUntil ? +new Date(user.suspendedUntil) : 0;
  return until > now ? { permanent: false, until } : null;
}

function suspensionMessage(suspension) {
  if (!suspension) return '';
  if (suspension.terminated) return 'This driver account was terminated by an IndangGO admin.';
  if (suspension.permanent) return 'This account has been permanently disabled after repeated reports of fake bookings.';
  const until = new Date(suspension.until).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `This account is suspended until ${until} after a driver's report was upheld.`;
}

module.exports = { REPORT_REASONS, REPORT_REASON_LABELS, MAX_REPORT_DETAILS, REPORTABLE_STATUSES, penaltyFor, validateReport, suspensionOf, suspensionMessage };
