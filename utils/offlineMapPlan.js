// Decides which offline map packs to download, resume, or delete. A pack is a
// MapLibre offline region: one map style's tiles, fonts, and icons for an area.

const OFFLINE_MAP_TAG = 'indanggo-offline-map';
// OpenFreeMap's vector tiles stop at zoom 14 and MapLibre enlarges them for
// closer zooms, so deeper tiles are never needed. The maps stop zooming out at
// 10.5, so zoom 10 is the widest view.
const OFFLINE_MAP_MIN_ZOOM = 10;
const OFFLINE_MAP_MAX_ZOOM = 14;
// About 1 km around the boundary, so its outline and the map edge render fully.
const BOUNDS_PADDING_DEGREES = 0.01;

function padBounds([west, south, east, north], padding = BOUNDS_PADDING_DEGREES) {
  const round = (value) => Number(value.toFixed(6));
  return [round(west - padding), round(south - padding), round(east + padding), round(north + padding)];
}

// tiles is the versioned tile address OpenFreeMap currently serves. It changes
// when OpenFreeMap updates its map, and a pack downloaded for an older version
// no longer matches what the styles ask for, so it must be replaced.
function getWantedPacks({ styles, bounds, area, tiles }) {
  const paddedBounds = padBounds(bounds);
  return styles.map(({ name, url }) => ({
    mapStyle: url,
    bounds: paddedBounds,
    minZoom: OFFLINE_MAP_MIN_ZOOM,
    maxZoom: OFFLINE_MAP_MAX_ZOOM,
    metadata: { tag: OFFLINE_MAP_TAG, style: name, area, bounds: paddedBounds, tiles },
  }));
}

function matches(metadata, wanted) {
  return metadata?.tag === OFFLINE_MAP_TAG && metadata.style === wanted.style && metadata.area === wanted.area &&
    metadata.tiles === wanted.tiles && JSON.stringify(metadata.bounds) === JSON.stringify(wanted.bounds);
}

// packs: [{ id, metadata, state }] where state is MapLibre's download state.
// Old packs (another area or tile version) are deleted only once every wanted
// pack is complete, so the phone is never left without an offline map.
function planOfflineMap(packs, wanted) {
  const matched = wanted.map((pack) => ({ wanted: pack, existing: packs.find(({ metadata }) => matches(metadata, pack.metadata)) }));
  const create = matched.filter(({ existing }) => !existing).map(({ wanted: pack }) => pack);
  const resume = matched.filter(({ existing }) => existing && existing.state !== 'complete').map(({ existing }) => existing.id);
  const keep = matched.filter(({ existing }) => existing).map(({ existing }) => existing.id);
  const ready = create.length === 0 && resume.length === 0;
  const remove = ready ? packs.filter(({ id, metadata }) => metadata?.tag === OFFLINE_MAP_TAG && !keep.includes(id)).map(({ id }) => id) : [];
  return { create, resume, keep, remove, ready };
}

// Without internet the tile version cannot be checked, so any complete pack of
// every style for this area counts: it is the best map the phone can show.
function hasOfflineMap(packs, { styles, area }) {
  return styles.every(({ name }) => packs.some(({ metadata, state }) =>
    metadata?.tag === OFFLINE_MAP_TAG && metadata.style === name && metadata.area === area && state === 'complete'));
}

// Combined progress of several packs' MapLibre statuses. The styles share the
// same tiles and fonts, which MapLibre stores once, so the largest pack is
// close to the space used; adding them up would count the tiles twice.
function summarizeProgress(statuses) {
  const required = statuses.reduce((sum, status) => sum + (status.requiredResourceCount || 0), 0);
  const completed = statuses.reduce((sum, status) => sum + (status.completedResourceCount || 0), 0);
  return {
    complete: statuses.length > 0 && statuses.every((status) => status.state === 'complete'),
    percentage: required > 0 ? Math.min(100, Math.floor((completed / required) * 100)) : 0,
    bytes: Math.max(0, ...statuses.map((status) => status.completedResourceSize || 0)),
  };
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

module.exports = {
  OFFLINE_MAP_MAX_ZOOM,
  OFFLINE_MAP_MIN_ZOOM,
  OFFLINE_MAP_TAG,
  formatBytes,
  getWantedPacks,
  hasOfflineMap,
  padBounds,
  planOfflineMap,
  summarizeProgress,
};
