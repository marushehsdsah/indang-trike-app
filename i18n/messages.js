// Turns the codes the offline engine and the trip state return into text in
// the chosen language. The engine itself keeps its English messages, which
// the tests and the backend rely on.

// The route card's message for a route result (utils/bookingRoute.js).
export function routeMessage(t, routeResult) {
  const endpoint = routeResult?.endpoint;
  switch (routeResult?.status) {
    case 'missing-endpoints': return t('route.missing');
    case 'calculating': return t('route.calculating');
    case 'outside-service-area': return endpoint ? t(`route.outside.${endpoint}`) : t('route.outsideAny');
    case 'different-towns': return t('route.differentTowns');
    case 'unsnappable': return t(`route.unsnappable.${endpoint ?? 'any'}`);
    case 'no-route': return t('route.noRoute');
    case 'ok':
      if (!routeResult.details) return t('route.calculating');
      return routeResult.details.distanceMeters > 0 ? null : t('route.samePlace');
    default: return t('route.noData');
  }
}

// A stop's name for display: the GPS pickup reads "Current location" in either
// language; every other name is the place's own.
export function placeName(t, place) {
  if (!place) return null;
  return place.kind === 'current-location' ? t('place.currentLocation') : place.name;
}

// A route step's instruction (utils/routeDirections.js), from its type, road,
// and, when departing, compass direction.
export function stepInstruction(t, step, destinationName) {
  if (!step) return '';
  if (step.type === 'arrive') return destinationName ?? t('guide.arrive');
  const phrase = step.type === 'depart'
    ? t('guide.depart', { direction: t(`compass.${step.compass ?? 'north'}`) })
    : t(`guide.turn.${step.type}`);
  return step.roadName ? t('guide.onRoad', { phrase, road: step.roadName }) : phrase;
}
