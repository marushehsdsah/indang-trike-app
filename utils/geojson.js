function toMapCoordinate([longitude, latitude]) {
  return { latitude, longitude };
}

function getFeatures(geoJson) {
  return geoJson.type === 'FeatureCollection' ? geoJson.features : [geoJson];
}

function getFeatureId(feature, featureIndex) {
  return feature.id ?? feature.properties?.psgc ?? feature.properties?.psgc_10d ?? featureIndex;
}

function createMapPolygons(geoJson) {
  return getFeatures(geoJson).flatMap((feature, featureIndex) => {
    const polygonCoordinates = feature.geometry.type === 'MultiPolygon'
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
    const featureId = getFeatureId(feature, featureIndex);

    return polygonCoordinates.map((rings, polygonIndex) => ({
      id: `${featureId}-${polygonIndex}`,
      coordinates: rings[0].map(toMapCoordinate),
      holes: rings.slice(1).map((ring) => ring.map(toMapCoordinate)),
    }));
  });
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function getRegionForCoordinates(coordinates, paddingFactor = 1.2) {
  if (!coordinates.length) {
    throw new Error('At least one coordinate is required to calculate a map region.');
  }

  const latitudes = coordinates.map(({ latitude }) => latitude);
  const longitudes = coordinates.map(({ longitude }) => longitude);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);

  return {
    latitude: roundCoordinate((minimumLatitude + maximumLatitude) / 2),
    longitude: roundCoordinate((minimumLongitude + maximumLongitude) / 2),
    latitudeDelta: roundCoordinate(Math.max(maximumLatitude - minimumLatitude, 0.01) * paddingFactor),
    longitudeDelta: roundCoordinate(Math.max(maximumLongitude - minimumLongitude, 0.01) * paddingFactor),
  };
}

function getRegionForPolygons(polygons, paddingFactor = 1.2) {
  return getRegionForCoordinates(
    polygons.flatMap((polygon) => polygon.coordinates),
    paddingFactor,
  );
}

function getBoundsForPolygons(polygons) {
  const coordinates = polygons.flatMap((polygon) => polygon.coordinates);
  const latitudes = coordinates.map(({ latitude }) => latitude);
  const longitudes = coordinates.map(({ longitude }) => longitude);
  return {
    northEast: { latitude: Math.max(...latitudes), longitude: Math.max(...longitudes) },
    southWest: { latitude: Math.min(...latitudes), longitude: Math.min(...longitudes) },
  };
}

// A box `marginDegrees` larger than the polygons on every side, with each
// polygon cut out as a hole: filled, it greys out everything but the polygons.
function createOutsideMask(polygons, marginDegrees) {
  const { northEast, southWest } = getBoundsForPolygons(polygons);
  const north = roundCoordinate(northEast.latitude + marginDegrees);
  const south = roundCoordinate(southWest.latitude - marginDegrees);
  const east = roundCoordinate(northEast.longitude + marginDegrees);
  const west = roundCoordinate(southWest.longitude - marginDegrees);
  return {
    coordinates: [
      { latitude: north, longitude: west },
      { latitude: north, longitude: east },
      { latitude: south, longitude: east },
      { latitude: south, longitude: west },
    ],
    holes: polygons.map((polygon) => polygon.coordinates),
  };
}

// MapLibre takes GeoJSON, whose positions are [longitude, latitude].
function toLngLat({ latitude, longitude }) {
  return [longitude, latitude];
}

// [west, south, east, north] around map coordinates, as MapLibre bounds.
function getLngLatBounds(coordinates) {
  const longitudes = coordinates.map(({ longitude }) => longitude);
  const latitudes = coordinates.map(({ latitude }) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function toLineFeature(coordinates) {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordinates.map(toLngLat) } };
}

// Twice the signed area of a closed [longitude, latitude] ring; positive when
// the ring runs counter-clockwise.
function getRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area;
}

// GeoJSON (RFC 7946) rings are closed, with outer rings counter-clockwise and
// holes clockwise, so the renderer can tell which rings are holes.
function orientRing(coordinates, clockwise) {
  const ring = coordinates.map(toLngLat);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return (getRingArea(ring) < 0) === clockwise ? ring : ring.reverse();
}

function toPolygonFeature({ coordinates, holes = [] }) {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [orientRing(coordinates, false), ...holes.map((hole) => orientRing(hole, true))] },
  };
}

function isPointOnSegment(coordinate, start, end) {
  const epsilon = 1e-10;
  const crossProduct =
    (coordinate.latitude - start.latitude) * (end.longitude - start.longitude) -
    (coordinate.longitude - start.longitude) * (end.latitude - start.latitude);

  if (Math.abs(crossProduct) > epsilon) return false;

  return coordinate.latitude >= Math.min(start.latitude, end.latitude) - epsilon &&
    coordinate.latitude <= Math.max(start.latitude, end.latitude) + epsilon &&
    coordinate.longitude >= Math.min(start.longitude, end.longitude) - epsilon &&
    coordinate.longitude <= Math.max(start.longitude, end.longitude) + epsilon;
}

function isPointInRing(coordinate, ring) {
  let isInside = false;

  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];

    if (isPointOnSegment(coordinate, previousPoint, currentPoint)) return true;

    const crossesLatitude = (currentPoint.latitude > coordinate.latitude) !==
      (previousPoint.latitude > coordinate.latitude);
    const longitudeAtCrossing = (
      (previousPoint.longitude - currentPoint.longitude) *
      (coordinate.latitude - currentPoint.latitude) /
      (previousPoint.latitude - currentPoint.latitude) +
      currentPoint.longitude
    );

    if (crossesLatitude && coordinate.longitude < longitudeAtCrossing) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function isCoordinateInPolygons(coordinate, polygons) {
  return polygons.some(({ coordinates, holes = [] }) => (
    isPointInRing(coordinate, coordinates) &&
    !holes.some((hole) => isPointInRing(coordinate, hole))
  ));
}

module.exports = {
  createMapPolygons,
  createOutsideMask,
  getBoundsForPolygons,
  getLngLatBounds,
  getRegionForCoordinates,
  getRegionForPolygons,
  isCoordinateInPolygons,
  toLineFeature,
  toLngLat,
  toPolygonFeature,
};
