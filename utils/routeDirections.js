const { normalizeSearchText } = require('./placeSearch');

const UNNAMED_ROAD = 'Unnamed road';
// Bearings are measured over this much road on each side of a junction so a
// short kink in the OSM geometry does not read as a turn.
const BEARING_SAMPLE_METERS = 15;
// Staying on the same named road, heading changes below this are road bends.
const SAME_ROAD_BEND_DEGREES = 45;
const TURN_PHRASES = Object.freeze({
  continue: 'Continue',
  'slight-left': 'Slight left',
  left: 'Turn left',
  'sharp-left': 'Sharp left',
  'slight-right': 'Slight right',
  right: 'Turn right',
  'sharp-right': 'Sharp right',
});
const COMPASS_POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

function roundTenth(value) {
  return Math.round(value * 10) / 10;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function getBearing(from, to) {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Signed change in heading, normalized into [-180, 180); negative is a left turn.
function getTurnDelta(fromBearing, toBearing) {
  return ((toBearing - fromBearing + 540) % 360) - 180;
}

function classifyTurn(delta) {
  const magnitude = Math.abs(delta);
  if (magnitude < 15) return 'continue';
  const side = delta < 0 ? 'left' : 'right';
  if (magnitude < 45) return `slight-${side}`;
  if (magnitude < 135) return side;
  return `sharp-${side}`;
}

function getCompassPoint(bearing) {
  return COMPASS_POINTS[Math.round(bearing / 45) % COMPASS_POINTS.length];
}

function getRoadName(segment) {
  return segment.roadName && segment.roadName !== UNNAMED_ROAD ? segment.roadName : null;
}

// Heading while arriving at the end of a group of segments.
function getBearingIntoEnd(segments) {
  let travelled = 0;
  let index = segments.length - 1;
  for (; index > 0; index -= 1) {
    travelled += segments[index].distanceMeters;
    if (travelled >= BEARING_SAMPLE_METERS) break;
  }
  return getBearing(segments[index].fromCoordinate, segments[segments.length - 1].toCoordinate);
}

// Heading while leaving the start of a group of segments.
function getBearingOutOfStart(segments) {
  let travelled = 0;
  let index = 0;
  for (; index < segments.length - 1; index += 1) {
    travelled += segments[index].distanceMeters;
    if (travelled >= BEARING_SAMPLE_METERS) break;
  }
  return getBearing(segments[0].fromCoordinate, segments[index].toCoordinate);
}

// Consecutive segments of the same way under the same name form one group.
function groupSegments(segments) {
  const groups = [];
  for (const segment of segments) {
    const previous = groups[groups.length - 1];
    const nameKey = normalizeSearchText(getRoadName(segment));
    if (previous && previous.wayId === segment.wayId && previous.nameKey === nameKey) {
      previous.segments.push(segment);
    } else {
      groups.push({ wayId: segment.wayId, nameKey, roadName: getRoadName(segment), segments: [segment] });
    }
  }
  return groups;
}

function describe(type, roadName, bearing) {
  const phrase = type === 'depart' ? `Head ${getCompassPoint(bearing)}` : TURN_PHRASES[type];
  return roadName ? `${phrase} on ${roadName}` : phrase;
}

function sumDistance(segments) {
  return segments.reduce((sum, segment) => sum + segment.distanceMeters, 0);
}

function buildSteps(routePath) {
  const groups = groupSegments(routePath.segments);
  const steps = [];

  groups.forEach((group, index) => {
    const lastSegment = group.segments[group.segments.length - 1];
    const distance = sumDistance(group.segments);
    if (index === 0) {
      steps.push({
        type: 'depart',
        instruction: describe('depart', group.roadName, getBearingOutOfStart(group.segments)),
        roadName: group.roadName,
        distanceMeters: distance,
        startCoordinate: group.segments[0].fromCoordinate,
        endCoordinate: lastSegment.toCoordinate,
      });
      return;
    }

    const previousGroup = groups[index - 1];
    const delta = getTurnDelta(
      getBearingIntoEnd(previousGroup.segments),
      getBearingOutOfStart(group.segments),
    );
    const type = classifyTurn(delta);
    const step = steps[steps.length - 1];
    // A named road split into several OSM ways is one road: its bends where
    // the ways meet are not maneuvers. A real turn onto the same name still is.
    if (group.roadName && group.nameKey === previousGroup.nameKey && Math.abs(delta) < SAME_ROAD_BEND_DEGREES) {
      step.distanceMeters += distance;
      step.endCoordinate = lastSegment.toCoordinate;
      return;
    }
    steps.push({
      type,
      instruction: describe(type, group.roadName),
      roadName: group.roadName,
      distanceMeters: distance,
      startCoordinate: group.segments[0].fromCoordinate,
      endCoordinate: lastSegment.toCoordinate,
    });
  });

  let startDistance = 0;
  for (const step of steps) {
    step.distanceMeters = roundTenth(step.distanceMeters);
    step.startDistanceMeters = roundTenth(startDistance);
    startDistance += step.distanceMeters;
  }

  const destination = routePath.coordinates[routePath.coordinates.length - 1];
  steps.push({
    type: 'arrive',
    instruction: 'Arrive at destination',
    roadName: null,
    distanceMeters: 0,
    startCoordinate: destination,
    endCoordinate: destination,
    startDistanceMeters: routePath.distanceMeters,
  });
  return steps;
}

function formatDistance(metres) {
  const rounded = Math.round(metres);
  return rounded < 1000 ? `${rounded} m` : `${(metres / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!(seconds > 0)) return '0 min';
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function buildRouteDirections(routePath) {
  return {
    coordinates: routePath.coordinates.map(({ latitude, longitude }) => ({ latitude, longitude })),
    distanceMeters: routePath.distanceMeters,
    durationSeconds: routePath.durationSeconds,
    distanceLabel: formatDistance(routePath.distanceMeters),
    durationLabel: formatDuration(routePath.durationSeconds),
    steps: buildSteps(routePath),
  };
}

module.exports = {
  buildRouteDirections,
  classifyTurn,
  formatDistance,
  formatDuration,
  getBearing,
};
