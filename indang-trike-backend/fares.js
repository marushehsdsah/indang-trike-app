const { createHash } = require('node:crypto');
const fareData = require('../assets/fares/indang-fares.json');
const todaData = require('../assets/geo/indang-todas.json');
const { TARIPA_PRICES, farePrices, roundToCentavos } = require('../data/fares');
const { BARANGAY_NAMES } = require('../data/todaZones');
const { HttpError, requireValue } = require('./policy');

// The fares in force: the taripa (assets/fares/indang-fares.json, priced by
// data/fares.js) with the amounts an admin changed in God view's Fares tab.
// Only amounts change, in pesos and centavos (at most two decimal places,
// like ₱12.50); the areas, their barangays and the rules stay as the taripa
// lists them. The changed amounts are one document
// in the database, so every booking after a save is charged the new fare;
// trips already booked keep theirs. The app quotes with the fares /api/config
// sends, and /api/state names their revision so a phone knows to fetch them
// again.

const MIN_FARE = 1, MAX_FARE = 1000;
const SHEET_ID = 'current';
const PERIODS = ['day', 'night'];
// A number from ₱1 to ₱1000 with at most two decimal places. The check allows
// for floating point (0.29 * 100 is 28.999999999999996).
const validFare = (value) => typeof value === 'number' && Number.isFinite(value) && value >= MIN_FARE && value <= MAX_FARE
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const FARE_RULE = `Fares are ₱${MIN_FARE} to ₱${MAX_FARE}, with at most 2 decimal places, like ₱12.50`;

// Where a listed trip starts.
const FROM = { poblacion: 'From the Poblacion', palengke: 'From the Palengke sub-terminal', cvsu: 'From the CvSU gate', bunaCerca: 'From the Buna Cerca junction' };

// The Fares tab's groups of fares. A group is a place, with the barangays
// that decide which TODAs list it. special: a special trip's day and night
// fares (key/day, key/night). Every booking is a special trip, so the
// taripa's regular per-passenger fares are not listed.
const GROUPS = (() => {
  const { poblacion, terminals } = fareData;
  const junction = terminals.bunaCerca;
  const groups = [
    { id: 'poblacion', label: 'Within the Poblacion', note: 'Both stops in Barangays 1–4, or near the town', barangays: poblacion.barangays,
      special: [{ from: 'Anywhere in the Poblacion', key: 'poblacion' }] },
    { id: 'buna-cerca-junction', label: 'Buna Cerca junction (pilahan)', note: 'Pickups at the junction', barangays: ['Buna Cerca'],
      special: [{ from: 'To the Poblacion', key: 'bunaCerca/poblacion' }] },
  ];
  for (const area of fareData.areas) {
    const special = Object.keys(area.special).map((origin) => ({ from: FROM[origin] ?? origin, key: `area/${area.id}/special/${origin}` }));
    if (Object.hasOwn(junction.special, area.id)) special.push({ from: FROM.bunaCerca, key: `bunaCerca/${area.id}` });
    groups.push({ id: area.id, label: area.label, note: '', barangays: area.barangays, special });
  }
  return groups;
})();

// The amounts every TODA charges the same way.
const TOWN = [
  { key: 'extraPassenger', label: 'Each passenger past two', note: 'Added to a special trip’s fare' },
  { key: 'flat', label: 'Flat fare', note: 'A stop no listed area covers, or a pickup outside Indang' },
];

// Indang's TODAs, each with the groups in the barangays it serves. A fare
// belongs to a place, not a TODA: a barangay two TODAs serve has one set of
// fares, listed under both.
const TODAS = todaData.todas.map((toda) => ({
  id: toda.id, name: toda.name, barangays: toda.barangays, wholeTown: BARANGAY_NAMES.every((name) => toda.barangays.includes(name)),
  stops: (toda.stops ?? []).map(({ name, barangay }) => ({ name, barangay })),
  groups: GROUPS.filter((group) => group.barangays.some((barangay) => toda.barangays.includes(barangay))).map((group) => group.id),
}));

// What God view calls a fare, for messages: "Alulod · Bukana, from the
// Poblacion, at night".
const LABELS = (() => {
  const labels = new Map(TOWN.map(({ key, label }) => [key, label]));
  for (const group of GROUPS) {
    for (const { from, key } of group.special) PERIODS.forEach((period) => labels.set(`${key}/${period}`, `${group.label}, ${from.toLowerCase()}, ${period === 'day' ? 'by day' : 'at night'}`));
  }
  return labels;
})();
const labelOf = (key) => LABELS.get(key) ?? key;
const listLabels = (keys) => (keys.length <= 2 ? keys.map(labelOf).join(' and ') : `${labelOf(keys[0])} and ${keys.length - 1} other fares`);

const revisionOf = (prices) => createHash('sha256').update(JSON.stringify(prices)).digest('base64url').slice(0, 16);

function createFares({ models }) {
  // The saved document: the amounts that differ from the taripa, by key.
  let saved = { prices: {}, version: 0, updatedAt: null, updatedBy: null }, inForce, revision;
  function use(document) {
    const prices = {};
    for (const [key, value] of Object.entries(document?.prices ?? {})) if (Object.hasOwn(TARIPA_PRICES, key) && validFare(value)) prices[key] = roundToCentavos(value);
    saved = { prices, version: document?.version ?? 0, updatedAt: document?.updatedAt ?? null, updatedBy: document?.updatedByName ?? null };
    inForce = farePrices(prices); revision = revisionOf(inForce);
  }
  use(null);
  // Loads and saves go one at a time, so a load that started before a save
  // can never put the older fares back after it.
  let queue = Promise.resolve();
  function serial(work) { const result = queue.then(work); queue = result.catch(() => {}); return result; }
  async function read() { use(await models.FareSheet.findById(SHEET_ID).lean()); }
  const load = () => serial(read);
  // What bookings are priced with now (data/fares.js quoteTrip's prices).
  const current = () => ({ prices: inForce, revision });
  function view() {
    return {
      revision, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy, limits: { min: MIN_FARE, max: MAX_FARE },
      prices: inForce, taripa: TARIPA_PRICES, town: TOWN, groups: GROUPS, todas: TODAS,
    };
  }
  // God view's Fares tab, from the database.
  const sheet = () => serial(async () => { await read(); return view(); });
  // body.changes: [{ key, from, to }], each fare the admin changed, where
  // `from` is the amount their page showed: a fare someone else changed since
  // is not overwritten unseen.
  function update(body, admin) {
    const changes = body?.changes;
    requireValue(Array.isArray(changes) && changes.length > 0, 400, 'Change at least one fare.');
    requireValue(changes.length <= Object.keys(TARIPA_PRICES).length, 400, 'Too many fares in one save.');
    const keys = new Set();
    for (const change of changes) {
      requireValue(typeof change?.key === 'string' && Object.hasOwn(TARIPA_PRICES, change.key), 400, 'One of these fares is not on the taripa. Refresh the fares and try again.');
      requireValue(!keys.has(change.key), 400, `${labelOf(change.key)} is listed twice.`);
      keys.add(change.key);
      requireValue(Number.isFinite(change.from), 400, 'Refresh the fares and try again.');
      requireValue(validFare(change.to), 400, `${FARE_RULE} (${labelOf(change.key)}).`);
    }
    return serial(async () => {
      await read();
      const stale = changes.filter((change) => change.from !== inForce[change.key]).map((change) => change.key);
      if (stale.length) throw new HttpError(409, `${listLabels(stale)} changed since you opened the fares. Check the fares shown now, then save again.`);
      const prices = { ...saved.prices };
      // A fare set back to the taripa's amount follows the taripa again.
      for (const { key, to: typed } of changes) { const to = roundToCentavos(typed); if (to === TARIPA_PRICES[key]) delete prices[key]; else prices[key] = to; }
      const name = [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || 'An admin';
      let document;
      try {
        // The version guards against a save made elsewhere since the load above.
        document = await models.FareSheet.findOneAndUpdate({ _id: SHEET_ID, version: saved.version },
          { $set: { prices, updatedBy: String(admin?._id ?? ''), updatedByName: name }, $inc: { version: 1 } },
          { upsert: true, returnDocument: 'after' }).lean();
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'Another admin saved fares at the same time. Check the fares shown now, then save again.');
        throw error;
      }
      use(document);
      return view();
    });
  }
  return { load, current, sheet, update };
}

module.exports = { createFares, MIN_FARE, MAX_FARE, FARE_GROUPS: GROUPS, FARE_TODAS: TODAS };
