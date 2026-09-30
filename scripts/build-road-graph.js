#!/usr/bin/env node
// Converts an Overpass JSON snapshot of Indang into the compact road graph the
// app routes on. See assets/routing/README.md for the query and rebuild steps.
//
// Usage: node scripts/build-road-graph.js --input <overpass.json> --output <graph.json>
//        [--municipality <boundary.geojson>]
const fs = require('node:fs');
const path = require('node:path');
const { createMapPolygons, isCoordinateInPolygons } = require('../utils/geojson');
const { haversineDistance } = require('../utils/pathfinding');
const { SPATIAL_CELL_SIZE_DEGREES, getSpatialCellKey, validateRoadGraph } = require('../utils/roadGraph');
const { getRoadSpeedKph, getWayDirection, isRoutableWay } = require('../utils/roadRules');

const DEFAULT_MUNICIPALITY_PATH = path.join(__dirname, '../assets/geo/indang-municipality.json');
const USAGE = 'Usage: node scripts/build-road-graph.js --input <overpass.json> --output <graph.json> ' +
  '[--municipality <boundary.geojson>]';
const COORDINATE_DECIMALS = 6;
const UNNAMED_ROAD = 'Unnamed road';
// The first tag present names the place's kind, e.g. amenity=school -> "school".
const PLACE_KIND_TAGS = ['amenity', 'shop', 'tourism', 'public_transport', 'place'];
const ELEMENT_TYPE_ORDER = { node: 0, way: 1, relation: 2 };

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Rounds up to 0.1 s so a stored edge is never faster than its road speed,
// which keeps the A* heuristic admissible. toFixed strips float noise first.
function ceilTenth(value) {
  return Math.max(0.1, Math.ceil(Number((value * 10).toFixed(6))) / 10);
}

// Numeric order for OSM ID strings, which can exceed Number.MAX_SAFE_INTEGER.
function compareIds(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

function compareElementIds(a, b) {
  const [typeA, idA] = a.split('/');
  const [typeB, idB] = b.split('/');
  return ELEMENT_TYPE_ORDER[typeA] - ELEMENT_TYPE_ORDER[typeB] || compareIds(idA, idB);
}

function toCoordinate(node) {
  return { latitude: node.lat, longitude: node.lon };
}

function storedCoordinate([latitude, longitude]) {
  return { latitude, longitude };
}

function roundPair(latitude, longitude) {
  return [round(latitude, COORDINATE_DECIMALS), round(longitude, COORDINATE_DECIMALS)];
}

function validateOsm(osm) {
  if (!osm || typeof osm !== 'object' || !Array.isArray(osm.elements)) {
    throw new Error('Invalid OSM document: expected an Overpass JSON object with an elements array');
  }
  if (typeof osm.osm3s?.timestamp_osm_base !== 'string') {
    throw new Error('Invalid OSM document: missing osm3s.timestamp_osm_base');
  }
}

function groupElements(elements) {
  const nodes = new Map();
  const ways = new Map();
  const relations = [];
  for (const element of elements) {
    if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      nodes.set(element.id, element);
    } else if (element.type === 'way' && Array.isArray(element.nodes)) {
      ways.set(element.id, element);
    } else if (element.type === 'relation' && Array.isArray(element.members)) {
      relations.push(element);
    }
  }
  const byId = (a, b) => a.id - b.id;
  return { nodes, ways: [...ways.values()].sort(byId), relations: relations.sort(byId) };
}

// OSM sometimes has distinct nodes stacked on one coordinate. Merging them into
// the lowest ID keeps roads connected instead of leaving zero-length gaps.
function createCanonicalNodeLookup(routableWays, sourceNodes) {
  const byCoordinate = new Map();
  for (const way of routableWays) {
    for (const nodeId of way.nodes) {
      const node = sourceNodes.get(nodeId);
      if (!node) continue;
      const key = `${node.lat},${node.lon}`;
      const current = byCoordinate.get(key);
      if (!current || node.id < current.id) byCoordinate.set(key, node);
    }
  }
  return (nodeId) => {
    const node = sourceNodes.get(nodeId);
    return node && byCoordinate.get(`${node.lat},${node.lon}`);
  };
}

function buildRoadGraph(osm, municipality) {
  validateOsm(osm);
  const polygons = createMapPolygons(municipality);
  const { nodes: sourceNodes, ways, relations } = groupElements(osm.elements);
  const insideCache = new Map();
  // Caches OSM nodes by ID; computed points such as centroids have no ID.
  const isInside = (point) => {
    if (point.id === undefined) return isCoordinateInPolygons(toCoordinate(point), polygons);
    if (!insideCache.has(point.id)) {
      insideCache.set(point.id, isCoordinateInPolygons(toCoordinate(point), polygons));
    }
    return insideCache.get(point.id);
  };

  const routableWays = ways.filter((way) => isRoutableWay(way.tags));
  const getCanonicalNode = createCanonicalNodeLookup(routableWays, sourceNodes);
  const nodes = new Map();
  const edges = new Map();
  const namedRoads = new Map();
  let nominalMaxSpeedKph = 0;

  const addEdge = (from, to, metres, seconds, way) => {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push([
      to,
      Math.max(0.1, round(metres, 1)),
      ceilTenth(seconds),
      way.tags.name || way.tags.ref || UNNAMED_ROAD,
      `way/${way.id}`,
      way.tags.highway,
    ]);
  };

  for (const way of routableWays) {
    const direction = getWayDirection(way.tags);
    const speedKph = getRoadSpeedKph(way.tags);
    const metresPerSecond = speedKph * 1000 / 3600;
    let contributed = false;

    for (let index = 1; index < way.nodes.length; index += 1) {
      const from = getCanonicalNode(way.nodes[index - 1]);
      const to = getCanonicalNode(way.nodes[index]);
      if (!from || !to || from.id === to.id || !isInside(from) || !isInside(to)) continue;
      const metres = haversineDistance(toCoordinate(from), toCoordinate(to));
      if (!(metres > 0)) continue;

      const fromId = String(from.id);
      const toId = String(to.id);
      nodes.set(fromId, roundPair(from.lat, from.lon));
      nodes.set(toId, roundPair(to.lat, to.lon));
      const seconds = metres / metresPerSecond;
      if (direction !== 'reverse') addEdge(fromId, toId, metres, seconds, way);
      if (direction !== 'forward') addEdge(toId, fromId, metres, seconds, way);
      contributed = true;

      if (way.tags.name) {
        if (!namedRoads.has(way.tags.name)) namedRoads.set(way.tags.name, { wayIds: [], nodeIds: new Set() });
        namedRoads.get(way.tags.name).nodeIds.add(fromId).add(toId);
      }
    }

    if (contributed) {
      nominalMaxSpeedKph = Math.max(nominalMaxSpeedKph, speedKph);
      if (way.tags.name) namedRoads.get(way.tags.name).wayIds.push(way.id);
    }
  }

  if (!nodes.size) {
    throw new Error('Invalid OSM document: no routable roads inside the municipality');
  }

  const places = extractPlaces({ sourceNodes, ways, relations, isInside, namedRoads, nodes });
  // The app loads this exact contract, so never emit a graph it would reject.
  return validateRoadGraph(finalizeGraph({ osm, nodes, edges, places, nominalMaxSpeedKph }));
}

function centroid(points) {
  const unique = [...new Map(points.map((node) => [node.id, node])).values()];
  if (!unique.length) return null;
  return {
    lat: unique.reduce((sum, node) => sum + node.lat, 0) / unique.length,
    lon: unique.reduce((sum, node) => sum + node.lon, 0) / unique.length,
  };
}

function getPlaceKind(tags) {
  const kindTag = PLACE_KIND_TAGS.find((tag) => tags[tag]);
  return kindTag && tags[kindTag];
}

function extractPlaces({ sourceNodes, ways, relations, isInside, namedRoads, nodes }) {
  const places = new Map();
  const wayById = new Map(ways.map((way) => [way.id, way]));
  const wayNodes = (way) => way.nodes.map((nodeId) => sourceNodes.get(nodeId)).filter(Boolean);
  const addPlace = (type, element, point) => {
    const kind = getPlaceKind(element.tags ?? {});
    const name = element.tags?.name?.trim();
    if (!kind || !name || !point || !isInside(point)) return;
    places.set(`${type}/${element.id}`, {
      id: `${type}/${element.id}`,
      name,
      kind,
      coordinate: roundPair(point.lat, point.lon),
    });
  };

  for (const node of sourceNodes.values()) addPlace('node', node, node);
  for (const way of ways) {
    if (way.tags?.name && getPlaceKind(way.tags)) addPlace('way', way, centroid(wayNodes(way)));
  }
  for (const relation of relations) {
    if (!relation.tags?.name || !getPlaceKind(relation.tags)) continue;
    const members = relation.members.flatMap((member) => {
      if (member.type === 'node') return sourceNodes.has(member.ref) ? [sourceNodes.get(member.ref)] : [];
      if (member.type === 'way' && wayById.has(member.ref)) return wayNodes(wayById.get(member.ref));
      return [];
    });
    addPlace('relation', relation, centroid(members));
  }

  // One searchable point per named road: the road's own node nearest the
  // centroid of its nodes, so the place always sits on the road itself.
  for (const [name, road] of namedRoads) {
    const id = `way/${Math.min(...road.wayIds)}`;
    if (places.has(id)) continue;
    const nodeIds = [...road.nodeIds].sort(compareIds);
    const points = nodeIds.map((nodeId) => nodes.get(nodeId));
    const centre = {
      latitude: points.reduce((sum, [latitude]) => sum + latitude, 0) / points.length,
      longitude: points.reduce((sum, [, longitude]) => sum + longitude, 0) / points.length,
    };
    let best = null;
    for (const point of points) {
      const distance = haversineDistance(centre, storedCoordinate(point));
      // Equal distances (within float noise) keep the earlier, lower node ID.
      if (!best || distance < best.distance - 1e-6) best = { distance, point };
    }
    places.set(id, { id, name, kind: 'road', coordinate: best.point });
  }

  return [...places.values()].sort((a, b) => compareElementIds(a.id, b.id));
}

function finalizeGraph({ osm, nodes, edges, places, nominalMaxSpeedKph }) {
  const nodeIds = [...nodes.keys()].sort(compareIds);
  const sortedNodes = {};
  const sortedEdges = {};
  const cells = new Map();
  let maxSpeedKph = nominalMaxSpeedKph;
  let minLatitude = Infinity;
  let minLongitude = Infinity;
  let maxLatitude = -Infinity;
  let maxLongitude = -Infinity;

  for (const nodeId of nodeIds) {
    const [latitude, longitude] = nodes.get(nodeId);
    sortedNodes[nodeId] = [latitude, longitude];
    minLatitude = Math.min(minLatitude, latitude);
    minLongitude = Math.min(minLongitude, longitude);
    maxLatitude = Math.max(maxLatitude, latitude);
    maxLongitude = Math.max(maxLongitude, longitude);

    const cellKey = getSpatialCellKey(latitude, longitude);
    if (!cells.has(cellKey)) cells.set(cellKey, []);
    cells.get(cellKey).push(nodeId);
  }

  for (const nodeId of nodeIds) {
    const nodeEdges = edges.get(nodeId);
    if (!nodeEdges) continue;
    nodeEdges.sort((a, b) => compareIds(a[0], b[0]) || compareElementIds(a[4], b[4]) || a[1] - b[1]);
    sortedEdges[nodeId] = nodeEdges;

    // Rounding can make a stored edge marginally faster than its nominal speed;
    // the heuristic divides by this maximum, so it must cover every edge.
    for (const [toId, metres, seconds] of nodeEdges) {
      const straightMetres = haversineDistance(
        storedCoordinate(sortedNodes[nodeId]),
        storedCoordinate(sortedNodes[toId]),
      );
      maxSpeedKph = Math.max(maxSpeedKph, Math.max(metres, straightMetres) / seconds * 3.6);
    }
  }

  const cellKeys = [...cells.keys()].sort((a, b) => {
    const [latA, lonA] = a.split(':').map(Number);
    const [latB, lonB] = b.split(':').map(Number);
    return latA - latB || lonA - lonB;
  });

  return {
    metadata: {
      source: 'OpenStreetMap',
      sourceTimestamp: osm.osm3s.timestamp_osm_base,
      licence: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      maxSpeedKph: Math.ceil(maxSpeedKph * 10) / 10,
      bounds: [minLatitude, minLongitude, maxLatitude, maxLongitude],
      cellSizeDegrees: SPATIAL_CELL_SIZE_DEGREES,
    },
    nodes: sortedNodes,
    edges: sortedEdges,
    spatialIndex: Object.fromEntries(cellKeys.map((key) => [key, cells.get(key)])),
    places,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--input', '--output', '--municipality'].includes(flag) || !argv[index + 1]) {
      throw new Error(USAGE);
    }
    args[flag.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (!args.input || !args.output) throw new Error(USAGE);
  return args;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label} ${filePath}: ${error.message}`);
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const osm = readJson(args.input, 'OSM snapshot');
  const municipality = readJson(args.municipality ?? DEFAULT_MUNICIPALITY_PATH, 'municipality boundary');
  const graph = buildRoadGraph(osm, municipality);
  const json = `${JSON.stringify(graph)}\n`;
  fs.writeFileSync(args.output, json);

  const edgeCount = Object.values(graph.edges).reduce((sum, list) => sum + list.length, 0);
  console.log([
    `nodes=${Object.keys(graph.nodes).length}`,
    `edges=${edgeCount}`,
    `places=${graph.places.length}`,
    `bytes=${Buffer.byteLength(json)}`,
    `sourceTimestamp=${graph.metadata.sourceTimestamp}`,
  ].join(' '));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`build-road-graph: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildRoadGraph,
};
