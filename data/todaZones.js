const barangayBoundaries = require('../assets/geo/indang-barangays.json');
const todaData = require('../assets/geo/indang-todas.json');
const { createMapPolygons, isCoordinateInPolygons, toPolygonFeature } = require('../utils/geojson');

// Indang's tricycle operators and drivers associations (TODAs) and the
// barangays each may serve (assets/geo/indang-todas.json, from
// TODAs_coordinates.xlsx). A driver registered with one of these TODAs is
// offered only trips whose pickup and destination are both inside its
// barangays; drivers of other TODAs keep the town-wide rules.

const BARANGAYS = barangayBoundaries.features.map((feature) => ({
  name: feature.properties.name,
  polygons: createMapPolygons({ type: 'FeatureCollection', features: [feature] }),
}));
// The PSA barangays and the municipal outline differ slightly along edges; a
// point in such a gap belongs to the nearest barangay within this distance.
const BORDER_GAP_METERS = 300;
const METERS_PER_DEGREE = 111320;

// Distance from a point to a ring's nearest edge, in a local flat projection.
function distanceToRing({ latitude, longitude }, ring) {
  const scale = Math.cos((latitude * Math.PI) / 180);
  const project = (point) => [(point.longitude - longitude) * scale * METERS_PER_DEGREE, (point.latitude - latitude) * METERS_PER_DEGREE];
  let best = Infinity;
  for (let index = 1; index < ring.length; index += 1) {
    const [ax, ay] = project(ring[index - 1]), [bx, by] = project(ring[index]);
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// The Indang barangay containing a coordinate, or null.
function getBarangayAt(coordinate) {
  const inside = BARANGAYS.find(({ polygons }) => isCoordinateInPolygons(coordinate, polygons));
  if (inside) return inside.name;
  let nearest = null;
  for (const { name, polygons } of BARANGAYS) {
    const distance = Math.min(...polygons.map(({ coordinates }) => distanceToRing(coordinate, coordinates)));
    if (distance <= BORDER_GAP_METERS && (!nearest || distance < nearest.distance)) nearest = { name, distance };
  }
  return nearest?.name ?? null;
}

// "PCHTI toda", "pchti-toda" and "PCHTI" all name PCHTI-TODA.
const normalize = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TODAS = todaData.todas.map((toda) => ({
  id: toda.id,
  name: toda.name,
  barangays: toda.barangays,
  keys: new Set([toda.name, ...toda.aliases].map(normalize)),
}));

// The Indang TODA a driver's TODA field names, or null for any other TODA.
function findToda(name) {
  const key = normalize(name);
  return (key && TODAS.find((toda) => toda.keys.has(key))) || null;
}

// Whether a driver of this TODA may serve a trip touching these points.
function todaServes(toda, ...coordinates) {
  return coordinates.every((coordinate) => toda.barangays.includes(getBarangayAt(coordinate)));
}

// The TODA's barangays as GeoJSON polygons for the driver's map, each named.
function getTodaZoneShape(toda) {
  const features = BARANGAYS.filter(({ name }) => toda.barangays.includes(name))
    .flatMap(({ name, polygons }) => polygons.map((polygon) => {
      const feature = toPolygonFeature(polygon);
      return { ...feature, properties: { ...feature.properties, name } };
    }));
  return { type: 'FeatureCollection', features };
}

module.exports = {
  BARANGAY_NAMES: BARANGAYS.map(({ name }) => name),
  TODA_NAMES: TODAS.map(({ name }) => name),
  findToda,
  getBarangayAt,
  getTodaZoneShape,
  todaServes,
};
