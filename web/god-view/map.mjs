import { Map, Marker, NavigationControl, AttributionControl } from './vendor/maplibre-gl.mjs';
import { isLive, locationLabel } from './model.mjs';

export function createFleetMap(container, area, boundary, onSelect, onError) {
  const map = new Map({ container, style: 'https://tiles.openfreemap.org/styles/positron',
    bounds: area.bounds, fitBoundsOptions: { padding: 60 }, attributionControl: false, maxPitch: 0 });
  const markers = new globalThis.Map();
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  map.on('error', () => onError('Some map tiles could not load. The people list is still available.'));
  map.on('load', () => {
    onError('');
    map.addSource('service-area', { type: 'geojson', data: boundary });
    map.addLayer({ id: 'area-fill', type: 'fill', source: 'service-area', paint: { 'fill-color': '#16765b', 'fill-opacity': 0.045 } });
    map.addLayer({ id: 'area-border', type: 'line', source: 'service-area', paint: { 'line-color': '#168366', 'line-width': 2, 'line-opacity': 0.65, 'line-dasharray': [4, 3] } });
  });
  return {
    update(users, selected, now, connected) {
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
    focus(user) { if (user?.location) map.flyTo({ center: [user.location.longitude, user.location.latitude], zoom: Math.max(map.getZoom(), 15), essential: false, padding: { bottom: 130 } }); },
    fitArea() { map.fitBounds(area.bounds, { padding: 60, duration: 700 }); },
    fitUsers(users) {
      const locations = users.map(user => user.location).filter(Boolean);
      if (!locations.length) return;
      map.fitBounds([Math.min(...locations.map(p => p.longitude)), Math.min(...locations.map(p => p.latitude)), Math.max(...locations.map(p => p.longitude)), Math.max(...locations.map(p => p.latitude))], { padding: 90, maxZoom: 16, duration: 700 });
    },
    remove() { map.remove(); },
  };
}
