// MaterialCommunityIcons glyph for each route step type from routeDirections.
export const MANEUVER_ICONS = {
  depart: 'navigation-variant',
  continue: 'arrow-up',
  'slight-left': 'arrow-top-left',
  left: 'arrow-left-top',
  'sharp-left': 'arrow-bottom-left',
  'slight-right': 'arrow-top-right',
  right: 'arrow-right-top',
  'sharp-right': 'arrow-bottom-right',
  arrive: 'flag-checkered',
};

export function getManeuverIcon(type) {
  return MANEUVER_ICONS[type] ?? 'arrow-up';
}
