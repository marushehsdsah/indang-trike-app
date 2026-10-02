// Free OpenStreetMap vector maps from OpenFreeMap: no API key, account, or
// usage limit. https://openfreemap.org
// One clean base map everywhere (streets, street names, buildings, water,
// parks); establishments and landmarks come from our own places layer
// (components/PlacesLayer.js), so the route and markers stay readable and the
// passenger, driver and God view maps show the same places.
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const NAVIGATION_STYLE_URL = MAP_STYLE_URL;
// The vector tile source both styles use. It names OpenFreeMap's current,
// versioned tile address, which services/offlineMap.js compares against the
// offline copy.
export const MAP_TILE_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
// The style kept for offline use (the places layer ships with the app).
export const OFFLINE_MAP_STYLES = [{ name: 'positron', url: MAP_STYLE_URL }];
// Required credit for OpenFreeMap tiles and the OpenStreetMap data behind them.
export const MAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';
export const MAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
