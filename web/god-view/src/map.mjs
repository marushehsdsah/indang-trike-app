import { Map, Marker, NavigationControl, AttributionControl } from './vendor/maplibre-gl.mjs';
import { isLive, locationLabel, routeFeatures } from './model.mjs';

// Solid lines by stage: the passenger's requested trip (passenger purple),
// the driver on the way to the passenger (driver green), and the trip to the
// destination (the app's route blue).
const ROUTE_COLOR = ['match', ['get', 'kind'], 'requested', '#8461d4', 'approach', '#1b9776', '#2563eb'];
const LINE = ['==', ['geometry-type'], 'LineString'];
const MARKER_TEXT = { driver: 'D', passenger: 'P', trip: 'DP' };
// Establishments, landmarks and named areas, drawn as in the app
// (components/PlacesLayer.js): landmarks from zoom 14, everything else from 16.
const rank = (value) => ['==', ['get', 'rank'], value];
const DOT_PAINT = { 'circle-color': ['get', 'color'], 'circle-radius': ['case', rank(1), 5, 4], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 };
const LABEL_LAYOUT = { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['case', rank(1), 12, 11],
  'text-anchor': 'top', 'text-offset': [0, 0.6], 'text-max-width': 9, 'symbol-sort-key': ['get', 'rank'] };
const LABEL_PAINT = { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 };
const PLACE_LAYERS = [
  { id: 'places-area-label', type: 'symbol', minzoom: 13, filter: rank(0),
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-max-width': 8 },
    paint: { ...LABEL_PAINT, 'text-opacity': 0.85 } },
  { id: 'places-landmark-dot', type: 'circle', minzoom: 14, filter: rank(1), paint: DOT_PAINT },
  { id: 'places-dot', type: 'circle', minzoom: 16, filter: rank(2), paint: DOT_PAINT },
  { id: 'places-landmark-label', type: 'symbol', minzoom: 14.5, filter: rank(1), layout: LABEL_LAYOUT, paint: LABEL_PAINT },
  { id: 'places-label', type: 'symbol', minzoom: 16.5, filter: rank(2), layout: LABEL_LAYOUT, paint: LABEL_PAINT },
];

export function createFleetMap(container, area, boundary, places, onSelect, onError) {
  const map = new Map({ container, style: 'https://tiles.openfreemap.org/styles/positron',
    bounds: area.bounds, fitBoundsOptions: { padding: 60 }, attributionControl: false, maxPitch: 0 });
  const markers = new globalThis.Map();
  let loaded = false, routeData = routeFeatures([], null), drawnRoutes = '';
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  // MapLibre sizes its canvas once and then follows only window resizes; the
  // panel settles after the map starts, which left most of it blank.
  const resizer = new ResizeObserver(() => map.resize());
  resizer.observe(container);
  map.on('error', () => onError('Some map tiles could not load. The people list is still available.'));
  map.on('load', () => {
    onError('');
    map.addSource('service-area', { type: 'geojson', data: boundary });
    map.addLayer({ id: 'area-fill', type: 'fill', source: 'service-area', paint: { 'fill-color': '#16765b', 'fill-opacity': 0.045 } });
    map.addLayer({ id: 'area-border', type: 'line', source: 'service-area', paint: { 'line-color': '#168366', 'line-width': 2, 'line-opacity': 0.65, 'line-dasharray': [4, 3] } });
    if (places) {
      map.addSource('service-area-places', { type: 'geojson', data: places });
      for (const layer of PLACE_LAYERS) map.addLayer({ ...layer, source: 'service-area-places' });
    }
    map.addSource('ride-routes', { type: 'geojson', data: routeData });
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({ id: 'route-casing', type: 'line', source: 'ride-routes', filter: LINE,
      layout: round, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 10, 8] } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'ride-routes', filter: LINE,
      layout: round, paint: { 'line-color': ROUTE_COLOR, 'line-width': ['case', ['get', 'selected'], 6, 4] } });
    map.addLayer({ id: 'route-stops', type: 'circle', source: 'ride-routes', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'kind'], 'pickup', '#16765b', '#f5b700'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    loaded = true;
  });
  return {
    // people: users and merged trips (see mapPeople in model.mjs).
    update(people, selected, now, connected, routes = []) {
      const selectedRide = routes.find((route) => route.driverId === selected || route.passengerId === selected)?.rideId ?? null;
      const key = JSON.stringify([routes, selectedRide]);
      if (key !== drawnRoutes) {
        routeData = routeFeatures(routes, selectedRide);
        if (loaded) { map.getSource('ride-routes').setData(routeData); drawnRoutes = key; }
      }
      const visible = new Set(people.filter(user => user.location).map(user => user.id));
      for (const [id, entry] of markers) if (!visible.has(id)) { entry.marker.remove(); markers.delete(id); }
      for (const user of people) {
        if (!user.location) continue;
        let entry = markers.get(user.id);
        if (!entry) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = MARKER_TEXT[user.role];
          button.addEventListener('click', () => onSelect(user.selectId ?? user.id));
          entry = { button, marker: new Marker({ element: button }).setLngLat([user.location.longitude, user.location.latitude]).addTo(map) };
          markers.set(user.id, entry);
        }
        const label = `${user.name}${user.role === 'trip' ? ' · on a trip' : ''} · ${locationLabel(user, now, connected)}`;
        const isSelected = selected === user.id || user.members?.includes(selected);
        entry.button.className = `person-marker ${user.role}${isLive(user, now, connected) ? '' : ' is-stale'}${isSelected ? ' is-selected' : ''}`;
        entry.button.setAttribute('aria-label', label);
        entry.button.title = label;
        entry.marker.setLngLat([user.location.longitude, user.location.latitude]);
      }
    },
    focus(user, route) {
      // A matched rider or driver: frame their whole route guide path.
      const path = route ? [route.approach, route.trip].filter(Boolean).flatMap((line) => line.coordinates) : [];
      if (user?.location) path.push([user.location.longitude, user.location.latitude]);
      if (route && path.length > 1) {
        map.fitBounds([Math.min(...path.map(([x]) => x)), Math.min(...path.map(([, y]) => y)), Math.max(...path.map(([x]) => x)), Math.max(...path.map(([, y]) => y))],
          { padding: { top: 90, right: 90, bottom: 220, left: 90 }, maxZoom: 16, duration: 700 });
      } else if (user?.location) map.flyTo({ center: [user.location.longitude, user.location.latitude], zoom: Math.max(map.getZoom(), 15), essential: false, padding: { bottom: 130 } });
    },
    fitArea() { map.fitBounds(area.bounds, { padding: 60, duration: 700 }); },
    fitUsers(users) {
      const locations = users.map(user => user.location).filter(Boolean);
      if (!locations.length) return;
      map.fitBounds([Math.min(...locations.map(p => p.longitude)), Math.min(...locations.map(p => p.latitude)), Math.max(...locations.map(p => p.longitude)), Math.max(...locations.map(p => p.latitude))], { padding: 90, maxZoom: 16, duration: 700 });
    },
    remove() { resizer.disconnect(); map.remove(); },
  };
}
