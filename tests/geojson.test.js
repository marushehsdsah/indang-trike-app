const test = require('node:test');
const assert = require('node:assert/strict');

function loadGeoJsonModule() {
  try {
    return require('../utils/geojson');
  } catch (error) {
    const moduleDoesNotExist =
      error.code === 'MODULE_NOT_FOUND' &&
      error.message.includes("'../utils/geojson'");

    if (!moduleDoesNotExist) throw error;
    return {};
  }
}

const {
  createMapPolygons,
  createOutsideMask,
  getBoundsForPolygons,
  getRegionForCoordinates,
  getRegionForPolygons,
  isCoordinateInPolygons,
  getLngLatBounds,
  toLineFeature,
  toPolygonFeature,
} = loadGeoJsonModule();

test('converts GeoJSON longitude-latitude rings into map polygons', () => {
  const geoJson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'indang',
      properties: { name: 'Indang' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[120.8, 14.1], [120.9, 14.1], [120.9, 14.2], [120.8, 14.1]],
          [[120.84, 14.14], [120.85, 14.14], [120.84, 14.14]],
        ],
      },
    }],
  };

  assert.deepEqual(createMapPolygons?.(geoJson), [{
    id: 'indang-0',
    coordinates: [
      { latitude: 14.1, longitude: 120.8 },
      { latitude: 14.1, longitude: 120.9 },
      { latitude: 14.2, longitude: 120.9 },
      { latitude: 14.1, longitude: 120.8 },
    ],
    holes: [[
      { latitude: 14.14, longitude: 120.84 },
      { latitude: 14.14, longitude: 120.85 },
      { latitude: 14.14, longitude: 120.84 },
    ]],
  }]);
});

test('keeps every part of a GeoJSON MultiPolygon', () => {
  const geoJson = {
    type: 'Feature',
    properties: { psgc: '0402110000' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[120.8, 14.1], [120.81, 14.1], [120.8, 14.1]]],
        [[[120.9, 14.2], [120.91, 14.2], [120.9, 14.2]]],
      ],
    },
  };

  assert.deepEqual(
    createMapPolygons?.(geoJson).map(({ id, coordinates }) => ({ id, coordinates })),
    [
      {
        id: '0402110000-0',
        coordinates: [
          { latitude: 14.1, longitude: 120.8 },
          { latitude: 14.1, longitude: 120.81 },
          { latitude: 14.1, longitude: 120.8 },
        ],
      },
      {
        id: '0402110000-1',
        coordinates: [
          { latitude: 14.2, longitude: 120.9 },
          { latitude: 14.2, longitude: 120.91 },
          { latitude: 14.2, longitude: 120.9 },
        ],
      },
    ],
  );
});

test('frames all polygon coordinates with padding', () => {
  const polygons = [{
    coordinates: [
      { latitude: 14.1, longitude: 120.8 },
      { latitude: 14.3, longitude: 121.2 },
    ],
    holes: [],
  }];

  assert.deepEqual(getRegionForPolygons?.(polygons, 1.2), {
    latitude: 14.2,
    longitude: 121,
    latitudeDelta: 0.24,
    longitudeDelta: 0.48,
  });
});

test('frames a trip independently from the municipality boundary', () => {
  assert.deepEqual(getRegionForCoordinates?.([
    { latitude: 14.16, longitude: 120.87 },
    { latitude: 14.2, longitude: 120.89 },
  ], 1.5), {
    latitude: 14.18,
    longitude: 120.88,
    latitudeDelta: 0.06,
    longitudeDelta: 0.03,
  });
});

test('checks the service polygon and excludes its holes', () => {
  const polygons = [{
    coordinates: [
      { latitude: 14, longitude: 120 },
      { latitude: 14, longitude: 121 },
      { latitude: 15, longitude: 121 },
      { latitude: 15, longitude: 120 },
      { latitude: 14, longitude: 120 },
    ],
    holes: [[
      { latitude: 14.4, longitude: 120.4 },
      { latitude: 14.4, longitude: 120.6 },
      { latitude: 14.6, longitude: 120.6 },
      { latitude: 14.6, longitude: 120.4 },
      { latitude: 14.4, longitude: 120.4 },
    ]],
  }];

  assert.equal(isCoordinateInPolygons?.({ latitude: 14.2, longitude: 120.2 }, polygons), true);
  assert.equal(isCoordinateInPolygons?.({ latitude: 14.5, longitude: 120.5 }, polygons), false);
  assert.equal(isCoordinateInPolygons?.({ latitude: 16, longitude: 122 }, polygons), false);
});

test('includes outer boundary edges and excludes hole boundary edges', () => {
  const polygons = [{
    coordinates: [
      { latitude: 14, longitude: 120 },
      { latitude: 14, longitude: 121 },
      { latitude: 15, longitude: 121 },
      { latitude: 15, longitude: 120 },
      { latitude: 14, longitude: 120 },
    ],
    holes: [[
      { latitude: 14.4, longitude: 120.4 },
      { latitude: 14.4, longitude: 120.6 },
      { latitude: 14.6, longitude: 120.6 },
      { latitude: 14.6, longitude: 120.4 },
      { latitude: 14.4, longitude: 120.4 },
    ]],
  }];

  assert.equal(isCoordinateInPolygons?.({ latitude: 15, longitude: 120.5 }, polygons), true);
  assert.equal(isCoordinateInPolygons?.({ latitude: 14.5, longitude: 120.6 }, polygons), false);
});

test('keeps both default trip stops inside the Indang service area', () => {
  const { DEFAULT_TRIP, isInIndangServiceArea } = require('../data/indangMap');

  assert.equal(isInIndangServiceArea(DEFAULT_TRIP.pickup.coordinate), true);
  assert.equal(isInIndangServiceArea(DEFAULT_TRIP.dropoff.coordinate), true);
});

test('bounds every polygon coordinate', () => {
  const polygons = [
    { coordinates: [{ latitude: 14.1, longitude: 120.8 }, { latitude: 14.2, longitude: 120.9 }, { latitude: 14.15, longitude: 120.85 }] },
    { coordinates: [{ latitude: 14.25, longitude: 120.82 }, { latitude: 14.22, longitude: 120.95 }, { latitude: 14.23, longitude: 120.9 }] },
  ];
  assert.deepEqual(getBoundsForPolygons(polygons), {
    northEast: { latitude: 14.25, longitude: 120.95 },
    southWest: { latitude: 14.1, longitude: 120.8 },
  });
});

test('masks everything around the polygons and cuts each polygon out', () => {
  const ring = [{ latitude: 14.1, longitude: 120.8 }, { latitude: 14.2, longitude: 120.8 }, { latitude: 14.2, longitude: 120.9 }];
  const mask = createOutsideMask([{ coordinates: ring, holes: [] }], 1);
  assert.deepEqual(mask.coordinates, [
    { latitude: 15.2, longitude: 119.8 },
    { latitude: 15.2, longitude: 121.9 },
    { latitude: 13.1, longitude: 121.9 },
    { latitude: 13.1, longitude: 119.8 },
  ]);
  assert.deepEqual(mask.holes, [ring]);
  // Filled, the mask covers a point just outside the polygon but not one inside it.
  assert.equal(isCoordinateInPolygons({ latitude: 14.25, longitude: 120.85 }, [mask]), true);
  assert.equal(isCoordinateInPolygons({ latitude: 14.17, longitude: 120.82 }, [mask]), false);
});

// Twice the signed area: positive for a counter-clockwise [longitude, latitude] ring.
function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  return area;
}

test('MapLibre polygons have closed rings, counter-clockwise outside and clockwise holes', () => {
  const clockwiseSquare = [
    { latitude: 1, longitude: 0 }, { latitude: 1, longitude: 1 }, { latitude: 0, longitude: 1 }, { latitude: 0, longitude: 0 },
  ];
  const counterClockwiseHole = [
    { latitude: 0.2, longitude: 0.2 }, { latitude: 0.2, longitude: 0.8 }, { latitude: 0.8, longitude: 0.8 }, { latitude: 0.2, longitude: 0.2 },
  ];
  const [outer, hole] = toPolygonFeature({ coordinates: clockwiseSquare, holes: [counterClockwiseHole] }).geometry.coordinates;
  assert.deepEqual(outer[0], outer.at(-1), 'an open ring is closed');
  assert.equal(outer.length, 5);
  assert.ok(signedArea(outer) > 0, 'outer ring runs counter-clockwise');
  assert.ok(signedArea(hole) < 0, 'hole runs clockwise');
  assert.equal(hole.length, 4, 'an already closed ring is not closed twice');
});

test('the Indang mask keeps the municipality as a hole in the greyed-out area', () => {
  const { INDANG_MASK_SHAPE, INDANG_BOUNDS, DEFAULT_TRIP } = require('../data/indangMap');
  const [outer, ...holes] = INDANG_MASK_SHAPE.geometry.coordinates;
  assert.ok(signedArea(outer) > 0);
  assert.ok(holes.length > 0 && holes.every((ring) => signedArea(ring) < 0));
  const [west, south, east, north] = INDANG_BOUNDS;
  const { latitude, longitude } = DEFAULT_TRIP.pickup.coordinate;
  assert.ok(west < longitude && longitude < east && south < latitude && latitude < north);
});

test('routes and bounds use MapLibre longitude-latitude order', () => {
  const coordinates = [{ latitude: 14.2, longitude: 120.88 }, { latitude: 14.1, longitude: 120.9 }];
  assert.deepEqual(toLineFeature(coordinates).geometry, { type: 'LineString', coordinates: [[120.88, 14.2], [120.9, 14.1]] });
  assert.deepEqual(getLngLatBounds(coordinates), [120.88, 14.1, 120.9, 14.2]);
});
