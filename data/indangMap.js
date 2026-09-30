const indangMunicipality = require('../assets/geo/indang-municipality.json');
const {
  createMapPolygons,
  createOutsideMask,
  getBoundsForPolygons,
  isCoordinateInPolygons,
  toPolygonFeature,
} = require('../utils/geojson');

const INDANG_POLYGONS = createMapPolygons(indangMunicipality);
const { northEast, southWest } = getBoundsForPolygons(INDANG_POLYGONS);
// Where maps open: [west, south, east, north].
const INDANG_BOUNDS = [southWest.longitude, southWest.latitude, northEast.longitude, northEast.latitude];
// Zooming out stops at about the whole municipality on a phone. MapLibre zoom
// levels are one lower than Google's for the same scale (512 px tiles). The
// camera can still pan past Indang, so a live location outside it can be shown.
const INDANG_MIN_ZOOM = 10.5;
// Map shapes as GeoJSON: everything outside the boundary, greyed out, and the
// boundary itself, outlined.
const INDANG_MASK_SHAPE = toPolygonFeature(createOutsideMask(INDANG_POLYGONS, 1));
const INDANG_BOUNDARY_SHAPE = { type: 'FeatureCollection', features: INDANG_POLYGONS.map(toPolygonFeature) };

const DEFAULT_TRIP = {
  pickup: {
    id: 'default/cvsu-main-campus',
    name: 'CvSU Main Campus',
    kind: 'university',
    coordinate: { latitude: 14.197805, longitude: 120.881639 },
  },
  dropoff: {
    id: 'default/harasan-cuevas-compound',
    name: 'Harasan Cuevas Compound',
    kind: 'residential',
    coordinate: { latitude: 14.15988, longitude: 120.86997 },
  },
};

// Always searchable, even when the offline road graph is unavailable.
const DEFAULT_PLACES = [DEFAULT_TRIP.pickup, DEFAULT_TRIP.dropoff];

function isInIndangServiceArea(coordinate) {
  return isCoordinateInPolygons(coordinate, INDANG_POLYGONS);
}

module.exports = {
  DEFAULT_PLACES,
  DEFAULT_TRIP,
  INDANG_BOUNDARY_SHAPE,
  INDANG_BOUNDS,
  INDANG_MASK_SHAPE,
  INDANG_MIN_ZOOM,
  INDANG_POLYGONS,
  isInIndangServiceArea,
};
