// Sorts each searchable place into the category the maps colour and the
// search list shows, and marks the landmarks people navigate by.
// key: the OpenStreetMap tag the place's kind came from (amenity, shop, ...);
// kind: that tag's value (see scripts/build-road-graph.js).

const KINDS = {
  food: ['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten', 'bakery', 'confectionery',
    'deli', 'beverages', 'coffee', 'tea', 'pastry'],
  education: ['school', 'university', 'college', 'kindergarten', 'library', 'training', 'language_school', 'driving_school',
    'music_school', 'prep_school', 'research_institute', 'education'],
  health: ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'chemist', 'veterinary', 'medical_supply', 'optician',
    'laboratory', 'health_post', 'nursing_home', 'birthing_centre'],
  worship: ['place_of_worship', 'church', 'chapel', 'mosque', 'temple', 'cathedral', 'shrine', 'monastery', 'religious'],
  government: ['townhall', 'police', 'fire_station', 'post_office', 'courthouse', 'community_centre', 'social_facility',
    'government', 'public', 'civic', 'ranger_station'],
  transport: ['bus_station', 'taxi', 'ferry_terminal', 'parking', 'bicycle_parking', 'stop_position', 'platform', 'station',
    'stop_area', 'transportation'],
  leisure: ['park', 'playground', 'sports_centre', 'stadium', 'pitch', 'swimming_pool', 'fitness_centre', 'garden',
    'resort', 'water_park', 'golf_course', 'theatre', 'cinema', 'arts_centre', 'events_venue', 'theme_park', 'zoo', 'picnic_site'],
  lodging: ['hotel', 'motel', 'guest_house', 'hostel', 'apartment', 'chalet'],
  landmark: ['attraction', 'museum', 'monument', 'memorial', 'viewpoint', 'artwork', 'gallery', 'cemetery', 'grave_yard',
    'bridge', 'tower', 'water_tower', 'lighthouse'],
};
const CATEGORY_OF_KIND = new Map(Object.entries(KINDS).flatMap(([category, kinds]) => kinds.map((kind) => [kind, category])));
// The tag alone decides these, whatever the value.
const CATEGORY_OF_KEY = { shop: 'shopping', healthcare: 'health', leisure: 'leisure', historic: 'landmark', man_made: 'services',
  office: 'services', craft: 'services', public_transport: 'transport', tourism: 'leisure' };
// Shops that are food or health places rather than shopping.
const SHOP_EXCEPTIONS = new Set(['bakery', 'confectionery', 'deli', 'beverages', 'coffee', 'tea', 'pastry', 'chemist',
  'medical_supply', 'optician']);
// Named areas: subdivisions and business parks are labelled, not dotted.
const AREA_KINDS = new Set(['residential_area', 'industrial_area', 'commercial_area', 'subdivision']);
// Landmarks people give directions by: drawn from zoom 14 instead of 16.
const LANDMARK_KINDS = new Set(['school', 'university', 'college', 'hospital', 'townhall', 'police', 'fire_station',
  'courthouse', 'place_of_worship', 'church', 'cathedral', 'marketplace', 'mall', 'department_store', 'supermarket',
  'bus_station', 'stadium', 'park', 'cemetery', 'museum', 'attraction', 'monument', 'retail_area', 'resort', 'water_park']);

// Map colours, shared by the app and God view through the places layer file.
const CATEGORY_COLORS = {
  food: '#e8710a', shopping: '#c2185b', education: '#1a73e8', health: '#d93025', worship: '#6d4c41',
  government: '#3949ab', transport: '#00838f', leisure: '#2e7d32', lodging: '#8e24aa', landmark: '#b8860b',
  services: '#546e7a', area: '#5f6368',
};

function categorizePlace(key, kind) {
  if (kind === 'road') return 'road';
  if (key === 'place' || AREA_KINDS.has(kind)) return 'area';
  if (kind === 'retail_area') return 'shopping';
  if (key === 'shop' && !SHOP_EXCEPTIONS.has(kind)) return 'shopping';
  if (CATEGORY_OF_KIND.has(kind)) return CATEGORY_OF_KIND.get(kind);
  if (kind === 'marketplace') return 'shopping';
  if (key === 'tourism' && ['hotel', 'motel', 'guest_house', 'hostel'].includes(kind)) return 'lodging';
  return CATEGORY_OF_KEY[key] ?? 'services';
}

// 1: a landmark, shown from zoom 14; 2: any other establishment, from zoom 16;
// 0: a named area, shown as a label only.
function placeRank(category, kind) {
  if (category === 'area') return 0;
  return LANDMARK_KINDS.has(kind) || category === 'landmark' || category === 'worship' ? 1 : 2;
}

module.exports = { CATEGORY_COLORS, categorizePlace, placeRank };
