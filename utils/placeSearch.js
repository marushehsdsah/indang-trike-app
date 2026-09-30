const DEFAULT_RESULT_LIMIT = 6;
// Places with the same name within about 100 m are one place.
const DUPLICATE_COORDINATE_DECIMALS = 3;

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Lower is better: exact name, name prefix, word prefix, then any substring.
function scorePlace(name, query) {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(' ').some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return Infinity;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function searchPlaces(places, query, limit = DEFAULT_RESULT_LIMIT) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return places
    .map((place) => {
      const name = normalizeSearchText(place.name);
      return { place, name, score: scorePlace(name, normalizedQuery) };
    })
    .filter(({ score }) => score !== Infinity)
    .sort((a, b) => (
      a.score - b.score ||
      compareText(a.name, b.name) ||
      compareText(String(a.place.id ?? ''), String(b.place.id ?? ''))
    ))
    .slice(0, limit)
    .map(({ place }) => place);
}

// Concatenates place lists, keeping the first of any places that share a
// normalized name and rounded coordinate.
function mergePlaces(...placeLists) {
  const seen = new Set();
  const merged = [];
  for (const place of placeLists.flat()) {
    const { latitude, longitude } = place.coordinate;
    const key = [
      normalizeSearchText(place.name),
      latitude.toFixed(DUPLICATE_COORDINATE_DECIMALS),
      longitude.toFixed(DUPLICATE_COORDINATE_DECIMALS),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }
  return merged;
}

module.exports = {
  mergePlaces,
  normalizeSearchText,
  searchPlaces,
};
