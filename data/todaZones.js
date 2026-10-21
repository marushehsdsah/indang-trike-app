const barangayBoundaries = require('../assets/geo/indang-barangays.json');
const todaData = require('../assets/geo/indang-todas.json');
const { createMapPolygons, isCoordinateInPolygons, toPolygonFeature } = require('../utils/geojson');

// Indang's tricycle operators and drivers associations (TODAs) and the
// barangays each may serve (assets/geo/indang-todas.json, from
// TODAs_coordinates.xlsx). A driver registered with one of these TODAs is
// offered only trips that pick up inside its barangays or at one of its stops
// (a single place, such as BITODA's CvSU, served without the rest of its
// barangay); the drop-off may be anywhere in town. Drivers of other TODAs keep
// the town-wide rules, and so do those of a TODA that serves every barangay
// (ITODA).

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

// A stop's area on the map: a circle of its radius around the pin.
function circleRing({ latitude, longitude, radiusMeters }) {
  const dLat = radiusMeters / METERS_PER_DEGREE, dLon = dLat / Math.cos((latitude * Math.PI) / 180);
  const ring = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * 2 * Math.PI;
    return { latitude: latitude + dLat * Math.sin(angle), longitude: longitude + dLon * Math.cos(angle) };
  });
  return [...ring, ring[0]];
}

// A square stop: sizeMeters on each side, centred on the pin, north-up.
function squareRing({ latitude, longitude, sizeMeters }) {
  const dLat = sizeMeters / 2 / METERS_PER_DEGREE, dLon = dLat / Math.cos((latitude * Math.PI) / 180);
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    .map(([x, y]) => ({ latitude: latitude + dLat * y, longitude: longitude + dLon * x }));
  return [...ring, ring[0]];
}

// Convex hull of [x, y] points (monotone chain), counter-clockwise.
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => list.reduce((hull, point) => {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
    return [...hull, point];
  }, []).slice(0, -1);
  return [...half(sorted), ...half([...sorted].reverse())];
}

// The part of a polygon inside a convex counter-clockwise one (Sutherland-Hodgman).
function clipToConvex(subject, clip) {
  return clip.reduce((output, start, index) => {
    const end = clip[(index + 1) % clip.length];
    const inside = (p) => (end[0] - start[0]) * (p[1] - start[1]) - (end[1] - start[1]) * (p[0] - start[0]) >= 0;
    const cut = (p, q) => {
      const [x1, y1] = start, [x2, y2] = end, [x3, y3] = p, [x4, y4] = q;
      const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    return output.flatMap((point, i) => {
      const previous = output[(i + output.length - 1) % output.length];
      if (inside(point)) return inside(previous) ? [point] : [cut(previous, point), point];
      return inside(previous) ? [cut(previous, point)] : [];
    });
  }, subject);
}

// A border strip: the part of the stop's barangay within depthMeters of its
// border with the `along` barangay, from one end of that border to the other
// and rounded past both ends.
function borderStripRing({ barangay, along, depthMeters }) {
  const ring = BARANGAYS.find(({ name }) => name === barangay).polygons[0].coordinates;
  const neighbour = BARANGAYS.find(({ name }) => name === along).polygons;
  const onBorder = ring.map((point) => neighbour.some(({ coordinates }) => distanceToRing(point, coordinates) <= 1));
  // The border's points in ring order, starting after a point off the border.
  const offset = onBorder.findIndex((on) => !on);
  const border = ring.map((_, i) => (i + offset) % ring.length).filter((i) => onBorder[i]).map((i) => ring[i]);
  const origin = border[0], scale = Math.cos((origin.latitude * Math.PI) / 180) * METERS_PER_DEGREE;
  const toXY = (p) => [(p.longitude - origin.longitude) * scale, (p.latitude - origin.latitude) * METERS_PER_DEGREE];
  const fromXY = ([x, y]) => ({ latitude: origin.latitude + y / METERS_PER_DEGREE, longitude: origin.longitude + x / scale });
  // The border widened by depthMeters every way (a circle around each of its
  // points); only the barangay's own side of it is kept.
  const circle = Array.from({ length: 32 }, (_, index) => [Math.cos((index / 32) * 2 * Math.PI), Math.sin((index / 32) * 2 * Math.PI)]);
  const clip = convexHull(border.map(toXY).flatMap(([x, y]) => circle.map(([cx, cy]) => [x + cx * depthMeters, y + cy * depthMeters])));
  const strip = clipToConvex(ring.slice(0, -1).map(toXY), clip)
    .filter((point, i, all) => Math.hypot(point[0] - all[(i + all.length - 1) % all.length][0], point[1] - all[(i + all.length - 1) % all.length][1]) > 0.01)
    .map(fromXY);
  return [...strip, strip[0]];
}

// The part of a stop the driver's map shows. A stop counts only inside its own
// barangay (todaCovers), so a circle or square is drawn clipped to it; a
// border strip already lies inside it.
function stopMapRing(stop, ring) {
  if (stop.along) return ring;
  // Clipping keeps straight lines straight, so plain longitude/latitude will do.
  const toXY = (p) => [p.longitude, p.latitude];
  const barangay = BARANGAYS.find(({ name }) => name === stop.barangay).polygons[0].coordinates;
  const part = clipToConvex(barangay.slice(0, -1).map(toXY), ring.slice(0, -1).map(toXY))
    .map(([longitude, latitude]) => ({ latitude, longitude }));
  return [...part, part[0]];
}

// "PCHTI toda", "pchti-toda" and "PCHTI" all name PCHTI-TODA.
const normalize = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TODAS = todaData.todas.map((toda) => ({
  id: toda.id,
  name: toda.name,
  barangays: toda.barangays,
  stops: (toda.stops ?? []).map((stop) => {
    const coordinates = stop.along ? borderStripRing(stop) : stop.sizeMeters ? squareRing(stop) : circleRing(stop);
    return { ...stop, polygon: { coordinates, holes: [] }, mapPolygon: { coordinates: stopMapRing(stop, coordinates), holes: [] } };
  }),
  areas: [...toda.barangays, ...(toda.stops ?? []).map((stop) => stop.name)],
  wholeTown: BARANGAYS.every(({ name }) => toda.barangays.includes(name)),
  keys: new Set([toda.name, ...toda.aliases].map(normalize)),
}));

// The Indang TODA a driver's TODA field names, or null for any other TODA.
function findToda(name) {
  const key = normalize(name);
  return (key && TODAS.find((toda) => toda.keys.has(key))) || null;
}

// The name a driver's saved TODA goes by now ("ITODA PITODA" is ITODA), or
// the saved text for any other TODA.
function todaName(name) {
  return findToda(name)?.name ?? name;
}

// Whether a point is in the TODA's area, where its drivers may pick up: one
// of its barangays, or inside one of its stops and that stop's barangay. Trips
// already stay inside Indang, so a whole-town TODA covers every pickup.
function todaCovers(toda, coordinate) {
  if (toda.wholeTown) return true;
  const barangay = getBarangayAt(coordinate);
  return toda.barangays.includes(barangay) ||
    toda.stops.some((stop) => stop.barangay === barangay && isCoordinateInPolygons(coordinate, [stop.polygon]));
}

// The TODA's barangays and stops as GeoJSON polygons for the driver's map,
// each named.
function getTodaZoneShape(toda) {
  const named = (polygon, name) => {
    const feature = toPolygonFeature(polygon);
    return { ...feature, properties: { ...feature.properties, name } };
  };
  const features = [
    ...BARANGAYS.filter(({ name }) => toda.barangays.includes(name))
      .flatMap(({ name, polygons }) => polygons.map((polygon) => named(polygon, name))),
    ...toda.stops.map((stop) => named(stop.mapPolygon, stop.name)),
  ];
  return { type: 'FeatureCollection', features };
}

module.exports = {
  BARANGAY_NAMES: BARANGAYS.map(({ name }) => name),
  TODA_NAMES: TODAS.map(({ name }) => name),
  findToda,
  getBarangayAt,
  getTodaZoneShape,
  todaCovers,
  todaName,
};
