const { DEFAULT_PLACES } = require('./indangMap');
const { compileGraph } = require('../utils/pathfinding');
const { mergePlaces } = require('../utils/placeSearch');
const { loadRoadGraph } = require('../utils/roadGraph');

let roadGraph = null;
let searchablePlaces = null;

// Parsed, validated, and compiled for A* once per app session, on first use
// rather than at app start, so the rest of the app never pays for it. Screens
// warm it with preloadRoadGraph while idle so the first route is not slowed.
function getRoadGraph() {
  if (!roadGraph) {
    roadGraph = loadRoadGraph(require('../assets/routing/service-area-road-graph.json'));
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

module.exports = {
  getRoadGraph,
  getSearchablePlaces,
  preloadRoadGraph,
};
