const { findFastestPath, haversineDistance } = require('./pathfinding');

// Grid cells for nearest-node lookup. The builder writes the index with these
// helpers and the runtime reads it with them, so both always agree on cell keys.
const SPATIAL_CELL_SIZE_DEGREES = 0.005;
const MAX_SNAP_DISTANCE_METERS = 750;
const UNNAMED_ROAD = 'Unnamed road';
const METRES_PER_DEGREE = 2 * Math.PI * 6371000 / 360;
// Haversine and planar cell widths differ slightly; stay conservative.
const CELL_DISTANCE_SAFETY = 0.99;
const CELL_KEY_PATTERN = /^-?\d+:-?\d+$/;

function getSpatialCellIndex(value, cellSize = SPATIAL_CELL_SIZE_DEGREES) {
  return Math.floor(value / cellSize);
}

function getSpatialCellKey(latitude, longitude, cellSize = SPATIAL_CELL_SIZE_DEGREES) {
  return `${getSpatialCellIndex(latitude, cellSize)}:${getSpatialCellIndex(longitude, cellSize)}`;
}

function fail(message) {
  throw new Error(`Invalid road graph: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isCoordinatePair(value) {
  return Array.isArray(value) && value.length === 2 &&
    isFiniteNumber(value[0]) && Math.abs(value[0]) <= 90 &&
    isFiniteNumber(value[1]) && Math.abs(value[1]) <= 180;
}

function toCoordinate([latitude, longitude]) {
  return { latitude, longitude };
}

function validateMetadata(metadata) {
  if (!isPlainObject(metadata)) fail('metadata must be an object');
  if (metadata.source !== 'OpenStreetMap') fail('metadata.source must be "OpenStreetMap"');
  if (typeof metadata.sourceTimestamp !== 'string' || !metadata.sourceTimestamp) {
    fail('metadata.sourceTimestamp must be a timestamp string');
  }
  if (!isPositiveNumber(metadata.maxSpeedKph)) fail('metadata.maxSpeedKph must be a positive number');
  if (!isPositiveNumber(metadata.cellSizeDegrees)) fail('metadata.cellSizeDegrees must be a positive number');
  if (!Array.isArray(metadata.bounds) || metadata.bounds.length !== 4 || !metadata.bounds.every(isFiniteNumber)) {
    fail('metadata.bounds must be [south, west, north, east]');
  }
}

function validateNodes(nodes) {
  if (!isPlainObject(nodes)) fail('nodes must be an object');
  const nodeIds = Object.keys(nodes);
  if (!nodeIds.length) fail('nodes must not be empty');
  for (const nodeId of nodeIds) {
    if (!isCoordinatePair(nodes[nodeId])) fail(`node ${nodeId} must be [latitude, longitude]`);
  }
  return nodeIds;
}

function validateEdges(edges, nodes, maxSpeedKph) {
  if (!isPlainObject(edges)) fail('edges must be an object');
  for (const fromId of Object.keys(edges)) {
    if (!hasOwn(nodes, fromId)) fail(`edges start at missing node ${fromId}`);
    const nodeEdges = edges[fromId];
    if (!Array.isArray(nodeEdges)) fail(`edges for node ${fromId} must be an array`);
    for (const edge of nodeEdges) {
      if (!Array.isArray(edge) || edge.length !== 6) fail(`edge from ${fromId} must have six fields`);
      const [toId, metres, seconds, roadName, wayId, highway] = edge;
      if (typeof toId !== 'string' || !hasOwn(nodes, toId)) {
        fail(`edge ${fromId} -> ${toId} references a missing node`);
      }
      if (!isPositiveNumber(metres) || !isPositiveNumber(seconds)) {
        fail(`edge ${fromId} -> ${toId} must have positive metres and seconds`);
      }
      // A* divides straight-line distance by maxSpeedKph; a faster edge would
      // make that heuristic overestimate and return slower routes.
      if (metres / seconds * 3.6 > maxSpeedKph + 1e-6) {
        fail(`edge ${fromId} -> ${toId} is faster than metadata.maxSpeedKph`);
      }
      if (typeof roadName !== 'string' || typeof wayId !== 'string' || typeof highway !== 'string') {
        fail(`edge ${fromId} -> ${toId} must have road name, way ID, and highway strings`);
      }
    }
  }
}

function validateSpatialIndex(spatialIndex, nodes, nodeCount, cellSize) {
  if (!isPlainObject(spatialIndex)) fail('spatialIndex must be an object');
  const indexed = new Set();
  for (const cellKey of Object.keys(spatialIndex)) {
    if (!CELL_KEY_PATTERN.test(cellKey)) fail(`spatial cell "${cellKey}" is not "<lat>:<lon>"`);
    const members = spatialIndex[cellKey];
    if (!Array.isArray(members)) fail(`spatial cell ${cellKey} must be an array`);
    for (const nodeId of members) {
      if (typeof nodeId !== 'string' || !hasOwn(nodes, nodeId)) {
        fail(`spatial cell ${cellKey} references missing node ${nodeId}`);
      }
      const [latitude, longitude] = nodes[nodeId];
      if (getSpatialCellKey(latitude, longitude, cellSize) !== cellKey) {
        fail(`node ${nodeId} is indexed in the wrong spatial cell ${cellKey}`);
      }
      if (indexed.has(nodeId)) fail(`node ${nodeId} is indexed more than once`);
      indexed.add(nodeId);
    }
  }
  if (indexed.size !== nodeCount) fail('every node must appear in the spatial index');
}

function validatePlaces(places) {
  if (!Array.isArray(places)) fail('places must be an array');
  for (const place of places) {
    const valid = isPlainObject(place) &&
      typeof place.id === 'string' &&
      typeof place.name === 'string' && place.name.trim() !== '' &&
      typeof place.kind === 'string' &&
      isCoordinatePair(place.coordinate);
    if (!valid) fail(`place ${place?.id ?? '(unknown)'} must have id, name, kind, and coordinate`);
  }
}

function validateRoadGraph(data) {
  if (!isPlainObject(data)) fail('expected a graph object');
  validateMetadata(data.metadata);
  const nodeIds = validateNodes(data.nodes);
  validateEdges(data.edges, data.nodes, data.metadata.maxSpeedKph);
  validateSpatialIndex(data.spatialIndex, data.nodes, nodeIds.length, data.metadata.cellSizeDegrees);
  validatePlaces(data.places);
  return data;
}

// Validates bundled graph data once and exposes places in app coordinates.
// Never throws: a broken graph must disable booking, not crash the screen.
function loadRoadGraph(data) {
  try {
    const graph = validateRoadGraph(data);
    return {
      status: 'ready',
      graph: {
        ...graph,
        places: graph.places.map(({ id, name, kind, coordinate }) => ({
          id,
          name,
          kind,
          coordinate: toCoordinate(coordinate),
        })),
      },
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

function isValidCoordinate(coordinate) {
  return Boolean(coordinate) &&
    isFiniteNumber(coordinate.latitude) &&
    isFiniteNumber(coordinate.longitude);
}

// Smallest ground width of one cell anywhere within `ring` cells of the query.
function getMinimumCellMetres(latitude, ring, cellSize) {
  const farthestLatitude = Math.min(89.9, Math.abs(latitude) + (ring + 1) * cellSize);
  const latitudeMetres = cellSize * METRES_PER_DEGREE;
  const longitudeMetres = latitudeMetres * Math.cos(farthestLatitude * Math.PI / 180);
  return Math.min(latitudeMetres, longitudeMetres) * CELL_DISTANCE_SAFETY;
}

function forEachRingCell(latIndex, lonIndex, ring, visit) {
  for (let latOffset = -ring; latOffset <= ring; latOffset += 1) {
    const onEdgeRow = Math.abs(latOffset) === ring;
    // Rows strictly inside the ring only contribute their two end cells.
    const step = onEdgeRow || ring === 0 ? 1 : ring * 2;
    for (let lonOffset = -ring; lonOffset <= ring; lonOffset += step) {
      visit(`${latIndex + latOffset}:${lonIndex + lonOffset}`);
    }
  }
}

// Searches square rings of grid cells outward from the query, stopping once no
// unvisited cell can hold a node closer than the best one found so far.
function findNearestRoadNode(graph, coordinate, maxDistanceMeters = MAX_SNAP_DISTANCE_METERS) {
  if (!isValidCoordinate(coordinate)) return null;
  const cellSize = graph.metadata.cellSizeDegrees ?? SPATIAL_CELL_SIZE_DEGREES;
  const latIndex = getSpatialCellIndex(coordinate.latitude, cellSize);
  const lonIndex = getSpatialCellIndex(coordinate.longitude, cellSize);
  let best = null;

  for (let ring = 0; ; ring += 1) {
    // Every cell in ring r is at least r - 1 whole cells from the query.
    const ringMinimumMetres = Math.max(0, ring - 1) * getMinimumCellMetres(coordinate.latitude, ring, cellSize);
    if (ringMinimumMetres > maxDistanceMeters || (best && best.distance < ringMinimumMetres)) break;

    forEachRingCell(latIndex, lonIndex, ring, (cellKey) => {
      for (const nodeId of graph.spatialIndex[cellKey] ?? []) {
        const distance = haversineDistance(coordinate, toCoordinate(graph.nodes[nodeId]));
        const closer = !best || distance < best.distance - 1e-9 ||
          (Math.abs(distance - best.distance) <= 1e-9 && nodeId < best.nodeId);
        if (closer) best = { nodeId, distance };
      }
    });
  }

  if (!best || best.distance > maxDistanceMeters) return null;
  return {
    nodeId: best.nodeId,
    coordinate: toCoordinate(graph.nodes[best.nodeId]),
    distanceMeters: Math.round(best.distance * 10) / 10,
  };
}

function calculateRoute(graph, start, end) {
  const startSnap = findNearestRoadNode(graph, start);
  if (!startSnap) return { status: 'unsnappable', endpoint: 'pickup' };
  const endSnap = findNearestRoadNode(graph, end);
  if (!endSnap) return { status: 'unsnappable', endpoint: 'destination' };
  const route = findFastestPath(graph, startSnap.nodeId, endSnap.nodeId);
  if (!route) return { status: 'no-route' };
  return { status: 'ok', route, startSnap, endSnap };
}

function getRoadNameAtNode(graph, nodeId) {
  if (!hasOwn(graph.edges, nodeId)) return null;
  const named = graph.edges[nodeId].find(([, , , roadName]) => roadName !== UNNAMED_ROAD);
  return named ? named[3] : null;
}

module.exports = {
  MAX_SNAP_DISTANCE_METERS,
  SPATIAL_CELL_SIZE_DEGREES,
  calculateRoute,
  findNearestRoadNode,
  getRoadNameAtNode,
  getSpatialCellIndex,
  getSpatialCellKey,
  loadRoadGraph,
  validateRoadGraph,
};
