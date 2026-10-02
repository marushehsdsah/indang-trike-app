import { Map, Marker, NavigationControl, AttributionControl } from './vendor/maplibre-gl.mjs';
import { isLive, locationLabel, routeFeatures } from './model.mjs';

// The app's route blue, as in the driver's route guide.
const ROUTE_COLOR = '#2563eb';
const LINE = ['==', ['geometry-type'], 'LineString'];

export function createFleetMap(container, area, boundary, onSelect, onError) {
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
    map.addSource('ride-routes', { type: 'geojson', data: routeData });
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({ id: 'route-upcoming', type: 'line', source: 'ride-routes', filter: ['all', LINE, ['==', ['get', 'kind'], 'upcoming']],
      layout: { 'line-join': 'round' }, paint: { 'line-color': ROUTE_COLOR, 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'ride-routes', filter: ['all', LINE, ['==', ['get', 'kind'], 'current']],
      layout: round, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 10, 8] } });
    map.addLayer({ id: 'route-current', type: 'line', source: 'ride-routes', filter: ['all', LINE, ['==', ['get', 'kind'], 'current']],
      layout: round, paint: { 'line-color': ROUTE_COLOR, 'line-width': ['case', ['get', 'selected'], 6, 4] } });
    map.addLayer({ id: 'route-stops', type: 'circle', source: 'ride-routes', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'kind'], 'pickup', '#16765b', '#f5b700'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    loaded = true;
  });
  return {
    update(users, selected, now, connected, routes = []) {
      const selectedRide = routes.find((route) => route.driverId === selected || route.passengerId === selected)?.rideId ?? null;
      const key = JSON.stringify([routes, selectedRide]);
      if (key !== drawnRoutes) {
        routeData = routeFeatures(routes, selectedRide);
        if (loaded) { map.getSource('ride-routes').setData(routeData); drawnRoutes = key; }
      }
      const visible = new Set(users.filter(user => user.location).map(user => user.id));
      for (const [id, entry] of markers) if (!visible.has(id)) { entry.marker.remove(); markers.delete(id); }
      for (const user of users) {
        if (!user.location) continue;
        let entry = markers.get(user.id);
        if (!entry) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = user.role === 'driver' ? 'D' : 'P';
          button.addEventListener('click', () => onSelect(user.id));
          entry = { button, marker: new Marker({ element: button }).setLngLat([user.location.longitude, user.location.latitude]).addTo(map) };
          markers.set(user.id, entry);
        }
        const label = `${user.name} · ${locationLabel(user, now, connected)}`;
        entry.button.className = `person-marker ${user.role}${isLive(user, now, connected) ? '' : ' is-stale'}${selected === user.id ? ' is-selected' : ''}`;
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
