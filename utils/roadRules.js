// Motor-vehicle routing rules shared by the graph builder and the runtime.
// Speeds are estimated tricycle travel speeds per OSM highway class, in km/h.
const ROAD_SPEED_KPH = Object.freeze({
  primary: 35,
  primary_link: 25,
  secondary: 30,
  secondary_link: 22,
  tertiary: 25,
  tertiary_link: 20,
  residential: 20,
  unclassified: 18,
  living_street: 10,
  service: 12,
});

const MIN_SPEED_KPH = 5;
const MAX_SPEED_KPH = 60;
const KPH_PER_MPH = 1.609344;
const BLOCKED_ACCESS = new Set(['no', 'private']);
// Most specific first: a tricycle is a motor vehicle, which is a vehicle.
const ACCESS_TAGS = ['motor_vehicle', 'vehicle', 'access'];
const ONE_WAY_JUNCTIONS = new Set(['roundabout', 'circular']);

function getMotorAccess(tags) {
  const tag = ACCESS_TAGS.find((key) => tags[key] !== undefined);
  return tag ? tags[tag] : undefined;
}

function isRoutableWay(tags = {}) {
  return Boolean(ROAD_SPEED_KPH[tags.highway]) &&
    !BLOCKED_ACCESS.has(getMotorAccess(tags)) &&
    // Reversible lanes change direction by time of day, so no fixed direction is safe.
    tags.oneway !== 'reversible';
}

function getWayDirection(tags = {}) {
  if (tags.oneway === '-1') return 'reverse';
  if (['yes', '1', 'true'].includes(tags.oneway) || ONE_WAY_JUNCTIONS.has(tags.junction)) return 'forward';
  return 'both';
}

function getRoadSpeedKph(tags = {}) {
  const maxspeed = String(tags.maxspeed ?? '');
  const parsed = Number.parseFloat(maxspeed.match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(parsed)) return ROAD_SPEED_KPH[tags.highway];
  const kph = /mph/i.test(maxspeed) ? parsed * KPH_PER_MPH : parsed;
  return Math.min(MAX_SPEED_KPH, Math.max(MIN_SPEED_KPH, kph));
}

module.exports = {
  ROAD_SPEED_KPH,
  getRoadSpeedKph,
  getWayDirection,
  isRoutableWay,
};
