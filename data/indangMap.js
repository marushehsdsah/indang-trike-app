const indangBoundary = require('../assets/geo/indang-municipality.json');
const {
  createMapPolygons,
  createOutsideMask,
  getBoundsForPolygons,
  isCoordinateInPolygons,
  toPolygonFeature,
} = require('../utils/geojson');

// IndangGO serves Indang only. The service area is kept as a list of towns
// (each its own tricycle network: a trip stays inside one town and is offered
// to that town's drivers), so another town can be added back as an entry.
const MUNICIPALITIES = [
  {
    name: 'Indang',
    polygons: createMapPolygons(indangBoundary),
    // Drivers within this straight-line distance of a pickup can be offered
    // the ride. Indang is about 13 km across.
    matchRadiusMeters: 5000,
    defaultTrip: {
      pickup: {
        id: 'default/cvsu-main-campus', name: 'CvSU Main Campus', kind: 'university', town: 'Indang',
        coordinate: { latitude: 14.197805, longitude: 120.881639 },
      },
      dropoff: {
        id: 'default/harasan-cuevas-compound', name: 'Harasan Cuevas Compound', kind: 'residential', town: 'Indang',
        coordinate: { latitude: 14.15988, longitude: 120.86997 },
      },
    },
  },
];

// "Rides across Indang"; "choose a point inside Indang".
const SERVICE_AREA_NAME = 'Indang';
const SERVICE_AREA_EITHER = 'Indang';
const INDANG_POLYGONS = MUNICIPALITIES.flatMap(({ polygons }) => polygons);
const { northEast, southWest } = getBoundsForPolygons(INDANG_POLYGONS);
// Where maps open: [west, south, east, north].
const INDANG_BOUNDS = [southWest.longitude, southWest.latitude, northEast.longitude, northEast.latitude];
// Zooming out stops at about the whole service area on a phone. MapLibre zoom
// levels are one lower than Google's for the same scale (512 px tiles). The
// camera can still pan past it, so a live location outside it can be shown.
const INDANG_MIN_ZOOM = 10;
// Map shapes as GeoJSON: everything outside Indang, greyed out, and the town
// boundary, outlined.
const INDANG_MASK_SHAPE = toPolygonFeature(createOutsideMask(INDANG_POLYGONS, 1));
const INDANG_BOUNDARY_SHAPE = { type: 'FeatureCollection', features: INDANG_POLYGONS.map(toPolygonFeature) };

// The Indang trip (CvSU Main Campus to Harasan), used by tests and as the example route.
const DEFAULT_TRIP = MUNICIPALITIES[0].defaultTrip;
// Always searchable, even when the offline road graph is unavailable.
const DEFAULT_PLACES = MUNICIPALITIES.flatMap(({ defaultTrip }) => [defaultTrip.pickup, defaultTrip.dropoff]);

// The town containing a coordinate, or null outside the service area.
function getMunicipalityAt(coordinate) {
  return MUNICIPALITIES.find(({ polygons }) => isCoordinateInPolygons(coordinate, polygons)) ?? null;
}

function isInIndangServiceArea(coordinate) {
  return getMunicipalityAt(coordinate) !== null;
}

module.exports = {
  DEFAULT_PLACES,
  DEFAULT_TRIP,
  INDANG_BOUNDARY_SHAPE,
  INDANG_BOUNDS,
  INDANG_MASK_SHAPE,
  INDANG_MIN_ZOOM,
  INDANG_POLYGONS,
  MUNICIPALITIES,
  SERVICE_AREA_EITHER,
  SERVICE_AREA_NAME,
  getMunicipalityAt,
  isInIndangServiceArea,
};
