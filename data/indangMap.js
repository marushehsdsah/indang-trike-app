// The pilot runs in General Trias for now, so the INDANG_* names below hold
// General Trias. To switch back, require indang-municipality.json here, set the
// name to 'Indang', set the match radius back to 5 km, restore the CvSU Main
// Campus -> Harasan default trip and the PassengerScreen shortcuts, and point
// data/roadNetwork.js and the tests at the Indang graph.
const municipality = require('../assets/geo/general-trias-municipality.json');
const {
  createMapPolygons,
  createOutsideMask,
  getBoundsForPolygons,
  isCoordinateInPolygons,
  toPolygonFeature,
} = require('../utils/geojson');

// Shown wherever the app names its service area, e.g. "You are outside ...".
const SERVICE_AREA_NAME = 'General Trias';
// Drivers within this straight-line distance of a pickup can be offered the
// ride. General Trias runs about 22 km north to south, so 8 km lets drivers in
// the town centre reach southern pickups such as Vista Mall (7.6 km); Indang,
// about 13 km across, used 5 km.
const MATCH_RADIUS_METERS = 8000;
const INDANG_POLYGONS = createMapPolygons(municipality);
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
    id: 'default/cvsu-general-trias-campus',
    name: 'CvSU General Trias Campus',
    kind: 'university',
    coordinate: { latitude: 14.385026, longitude: 120.880477 },
  },
  dropoff: {
    id: 'default/vista-mall-general-trias-terminal',
    name: 'Vista Mall General Trias Terminal',
    kind: 'bus_station',
    coordinate: { latitude: 14.324209, longitude: 120.912052 },
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
  MATCH_RADIUS_METERS,
  SERVICE_AREA_NAME,
  isInIndangServiceArea,
};
