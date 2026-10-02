import { useSyncExternalStore } from 'react';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import { INDANG_BOUNDS, SERVICE_AREA_NAME } from '../data/indangMap';
import { MAP_TILE_SOURCE_URL, OFFLINE_MAP_STYLES } from '../components/mapStyles';
import { OFFLINE_MAP_TAG, getWantedPacks, hasOfflineMap, planOfflineMap, summarizeProgress } from '../utils/offlineMapPlan';

// Keeps the service area's map on the phone so maps work without internet.
// MapLibre stores the packs in its own database and serves them whenever the
// network cannot; this module only decides what to download and reports it.

// While online, check OpenFreeMap's tile version at most this often.
const RECHECK_MS = 6 * 60 * 60 * 1000;
const AREA = { styles: OFFLINE_MAP_STYLES, area: SERVICE_AREA_NAME };

// state: idle | checking | downloading | ready | missing | error
let status = { state: 'idle', percentage: 0, bytes: 0, message: null };
let checkedAt = 0, running = null, rerun = false, usable = false;
const listeners = new Set();
// Latest MapLibre status of each pack the current area needs.
const packStatuses = new Map();

function publish(patch) {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOfflineMap() {
  return useSyncExternalStore(subscribe, () => status);
}

async function describePacks() {
  const packs = await OfflineManager.getPacks();
  return Promise.all(packs.map(async (pack) => ({ id: pack.id, metadata: pack.metadata, status: await pack.status() })))
    .then((described) => described.map((pack) => ({ ...pack, state: pack.status.state })));
}

async function fetchTileVersion() {
  const response = await fetch(MAP_TILE_SOURCE_URL);
  if (!response.ok) throw new Error(`The map server answered ${response.status}.`);
  const tiles = (await response.json()).tiles?.[0];
  if (!tiles) throw new Error('The map server sent no tile address.');
  return tiles;
}

function onProgress(pack, packStatus) {
  if (pack.metadata?.tag !== OFFLINE_MAP_TAG || !packStatuses.has(pack.id)) return;
  packStatuses.set(pack.id, packStatus);
  const progress = summarizeProgress([...packStatuses.values()]);
  // A finished download re-runs the check, which deletes replaced packs.
  if (progress.complete) syncOfflineMap({ online: true, force: true });
  else publish({ state: 'downloading', percentage: progress.percentage, bytes: progress.bytes });
}

// MapLibre reports single failed tiles here and keeps downloading the rest.
function onError(pack, error) {
  if (pack.metadata?.tag === OFFLINE_MAP_TAG) publish({ message: error.message });
}

async function run(online) {
  const packs = await describePacks();
  usable = hasOfflineMap(packs, AREA);
  if (!online) {
    const kept = packs.filter(({ metadata, state }) => metadata?.tag === OFFLINE_MAP_TAG && metadata.area === SERVICE_AREA_NAME && state === 'complete');
    publish(usable ? { state: 'ready', percentage: 100, bytes: summarizeProgress(kept.map((pack) => pack.status)).bytes }
      : { state: status.state === 'downloading' ? 'downloading' : 'missing' });
    return;
  }

  if (!usable && status.state !== 'downloading') publish({ state: 'checking' });
  const tiles = await fetchTileVersion();
  const plan = planOfflineMap(packs, getWantedPacks({ ...AREA, bounds: INDANG_BOUNDS, tiles }));
  for (const id of plan.remove) await OfflineManager.deletePack(id);

  packStatuses.clear();
  for (const id of plan.keep) packStatuses.set(id, packs.find((pack) => pack.id === id).status);
  for (const id of plan.resume) {
    await OfflineManager.addListener(id, onProgress, onError);
    await (await OfflineManager.getPack(id)).resume();
  }
  for (const wanted of plan.create) {
    const created = await OfflineManager.createPack(wanted, onProgress, onError);
    packStatuses.set(created.id, await created.status());
  }
  checkedAt = Date.now();

  const progress = summarizeProgress([...packStatuses.values()]);
  if (plan.ready) publish({ state: 'ready', percentage: 100, bytes: progress.bytes, message: null });
  else {
    // Packs that share every tile with an older one can finish during the run.
    if (progress.complete) rerun = true;
    publish({ state: 'downloading', percentage: progress.percentage, bytes: progress.bytes, message: null });
  }
}

// Brings the offline map up to date. Offline it only reports what the phone
// already has. Concurrent calls share one run; force skips the recheck delay.
export function syncOfflineMap({ online, force = false }) {
  if (running) {
    rerun = rerun || force;
    return running;
  }
  if (online && !force && status.state === 'ready' && Date.now() - checkedAt < RECHECK_MS) return Promise.resolve();
  running = run(online)
    .catch((failure) => publish(usable ? { state: 'ready', message: failure.message } : { state: 'error', message: failure.message }))
    .finally(() => {
      running = null;
      if (rerun) {
        rerun = false;
        syncOfflineMap({ online: true, force: true });
      }
    });
  return running;
}
