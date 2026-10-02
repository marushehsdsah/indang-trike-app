const generalTriasBoundary = require('../assets/geo/general-trias-municipality.json');
const indangBoundary = require('../assets/geo/indang-municipality.json');
const {
  createMapPolygons,
  createOutsideMask,
  getBoundsForPolygons,
  isCoordinateInPolygons,
  toPolygonFeature,
} = require('../utils/geojson');

// IndangGO serves two towns. Their boundaries do not touch (about 425 m apart
// at the closest), so each is its own tricycle network: a trip stays inside
// one town and is offered to that town's drivers. The INDANG_* names predate
// General Trias and cover the whole service area, both towns.
const MUNICIPALITIES = [
  {
    name: 'General Trias',
    polygons: createMapPolygons(generalTriasBoundary),
    // Drivers within this straight-line distance of a pickup can be offered
    // the ride. General Trias runs about 22 km north to south, so 8 km lets
    // town-centre drivers reach southern pickups such as Vista Mall (7.6 km).
    matchRadiusMeters: 8000,
    defaultTrip: {
      pickup: {
        id: 'default/cvsu-general-trias-campus', name: 'CvSU General Trias Campus', kind: 'university', town: 'General Trias',
        coordinate: { latitude: 14.385026, longitude: 120.880477 },
      },
      dropoff: {
        id: 'default/vista-mall-general-trias-terminal', name: 'Vista Mall General Trias Terminal', kind: 'bus_station', town: 'General Trias',
        coordinate: { latitude: 14.324209, longitude: 120.912052 },
      },
    },
  },
  {
    name: 'Indang',
    polygons: createMapPolygons(indangBoundary),
    // Indang is about 13 km across.
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

// "Rides across Indang and General Trias"; "choose a point inside Indang or General Trias".
const SERVICE_AREA_NAME = 'Indang and General Trias';
const SERVICE_AREA_EITHER = 'Indang or General Trias';
const INDANG_POLYGONS = MUNICIPALITIES.flatMap(({ polygons }) => polygons);
const { northEast, southWest } = getBoundsForPolygons(INDANG_POLYGONS);
// Where maps open: [west, south, east, north], both towns.
const INDANG_BOUNDS = [southWest.longitude, southWest.latitude, northEast.longitude, northEast.latitude];
// Zooming out stops at about the whole service area on a phone. MapLibre zoom
// levels are one lower than Google's for the same scale (512 px tiles). The
// camera can still pan past it, so a live location outside it can be shown.
const INDANG_MIN_ZOOM = 10;
// Map shapes as GeoJSON: everything outside both towns, greyed out, and each
// town's boundary, outlined.
const INDANG_MASK_SHAPE = toPolygonFeature(createOutsideMask(INDANG_POLYGONS, 1));
const INDANG_BOUNDARY_SHAPE = { type: 'FeatureCollection', features: INDANG_POLYGONS.map(toPolygonFeature) };

// The General Trias trip, used by tests and as the example route.
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
