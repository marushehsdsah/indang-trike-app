const { DEFAULT_PLACES } = require('./indangMap');
const { compileGraph } = require('../utils/pathfinding');
const { mergePlaces } = require('../utils/placeSearch');
const { loadRoadGraph } = require('../utils/roadGraph');

let roadGraph = null;
let searchablePlaces = null;
// A release build bundles the graph its tests validated, so it only checks the
// graph's shape at load; development builds and the server check every record.
const TRUSTED_BUNDLE = typeof __DEV__ !== 'undefined' && !__DEV__;

// Parsed, validated, and compiled for A* once per app session, on first use
// rather than at app start, so the rest of the app never pays for it. Screens
// warm it with preloadRoadGraph while idle so the first route is not slowed.
function getRoadGraph() {
  if (!roadGraph) {
    roadGraph = loadRoadGraph(require('../assets/routing/service-area-road-graph.json'), { trusted: TRUSTED_BUNDLE });
    if (roadGraph.status === 'ready') compileGraph(roadGraph.graph);
  }
  return roadGraph;
}

function getSearchablePlaces() {
  if (!searchablePlaces) {
    const graph = getRoadGraph();
    searchablePlaces = mergePlaces(graph.status === 'ready' ? graph.graph.places : [], DEFAULT_PLACES);
  }
  return searchablePlaces;
}

function preloadRoadGraph() {
  getSearchablePlaces();
}

// Whether the graph is already loaded, so a screen can avoid being the one
// that pays for the load in the middle of a render.
function isRoadGraphLoaded() {
  return roadGraph !== null;
}

module.exports = {
  getRoadGraph,
  isRoadGraphLoaded,
  getSearchablePlaces,
  preloadRoadGraph,
};
