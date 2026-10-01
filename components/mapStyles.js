// Free OpenStreetMap vector maps from OpenFreeMap: no API key, account, or
// usage limit. https://openfreemap.org
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
// Muted and without points of interest, so the route stands out while guiding.
export const NAVIGATION_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
// The vector tile source both styles use. It names OpenFreeMap's current,
// versioned tile address, which services/offlineMap.js compares against the
// offline copy.
export const MAP_TILE_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
// Styles kept for offline use: the browsing map and the navigation map.
export const OFFLINE_MAP_STYLES = [
  { name: 'liberty', url: MAP_STYLE_URL },
  { name: 'positron', url: NAVIGATION_STYLE_URL },
];
// Required credit for OpenFreeMap tiles and the OpenStreetMap data behind them.
export const MAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';
export const MAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
