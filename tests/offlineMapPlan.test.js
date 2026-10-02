const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFLINE_MAP_TAG, formatBytes, getWantedPacks, hasOfflineMap, padBounds, planOfflineMap, summarizeProgress,
} = require('../utils/offlineMapPlan');
const { INDANG_BOUNDS, SERVICE_AREA_NAME } = require('../data/indangMap');

const STYLES = [{ name: 'liberty', url: 'https://example/liberty' }, { name: 'positron', url: 'https://example/positron' }];
const TILES = 'https://tiles.example/planet/v2/{z}/{x}/{y}.pbf';
const wanted = getWantedPacks({ styles: STYLES, bounds: INDANG_BOUNDS, area: SERVICE_AREA_NAME, tiles: TILES });
const pack = (id, metadata, state = 'complete') => ({ id, metadata, state });

test('wants one pack per style over the padded service area, zoom 10 to 14', () => {
  assert.equal(wanted.length, 2);
  const [west, south, east, north] = INDANG_BOUNDS;
  assert.deepEqual(wanted[0].bounds, padBounds(INDANG_BOUNDS));
  assert.ok(wanted[0].bounds[0] < west && wanted[0].bounds[1] < south && wanted[0].bounds[2] > east && wanted[0].bounds[3] > north);
  assert.deepEqual([wanted[0].minZoom, wanted[0].maxZoom], [10, 14]);
  assert.deepEqual(wanted.map(({ mapStyle, metadata }) => [mapStyle, metadata.style, metadata.tiles]),
    [['https://example/liberty', 'liberty', TILES], ['https://example/positron', 'positron', TILES]]);
});

test('downloads missing packs and resumes unfinished ones', () => {
  const plan = planOfflineMap([pack('a', wanted[0].metadata, 'inactive')], wanted);
  assert.deepEqual(plan.create, [wanted[1]]);
  assert.deepEqual(plan.resume, ['a']);
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.remove, []);
});

test('keeps an old tile version until its replacement is complete, then deletes it', () => {
  const old = (style) => ({ ...wanted.find(({ metadata }) => metadata.style === style).metadata, tiles: 'https://tiles.example/planet/v1/{z}/{x}/{y}.pbf' });
  const stale = [pack('old-liberty', old('liberty')), pack('old-positron', old('positron'))];
  const downloading = planOfflineMap([...stale, pack('new-liberty', wanted[0].metadata, 'active')], wanted);
  assert.deepEqual(downloading.remove, [], 'the old map stays usable while the new one downloads');
  assert.deepEqual(downloading.create, [wanted[1]]);

  const done = planOfflineMap([...stale, pack('new-liberty', wanted[0].metadata), pack('new-positron', wanted[1].metadata)], wanted);
  assert.equal(done.ready, true);
  assert.deepEqual(done.remove, ['old-liberty', 'old-positron']);
  assert.deepEqual(done.keep, ['new-liberty', 'new-positron']);
});

test('replaces packs for another service area and leaves packs it does not own alone', () => {
  const indang = pack('indang', { ...wanted[0].metadata, area: 'Indang' });
  const foreign = pack('foreign', { tag: 'someone-else' });
  const plan = planOfflineMap([indang, foreign, pack('l', wanted[0].metadata), pack('p', wanted[1].metadata)], wanted);
  assert.deepEqual(plan.remove, ['indang']);
  assert.equal(plan.ready, true);
});

test('offline, any complete pack of every style for the area is usable', () => {
  const area = { styles: STYLES, area: SERVICE_AREA_NAME };
  const olderTiles = (metadata) => ({ ...metadata, tiles: 'older' });
  assert.equal(hasOfflineMap([pack('l', olderTiles(wanted[0].metadata)), pack('p', olderTiles(wanted[1].metadata))], area), true);
  assert.equal(hasOfflineMap([pack('l', wanted[0].metadata)], area), false, 'the navigation map is missing');
  assert.equal(hasOfflineMap([pack('l', wanted[0].metadata), pack('p', wanted[1].metadata, 'active')], area), false);
  assert.equal(hasOfflineMap([pack('l', { ...wanted[0].metadata, area: 'Indang' }), pack('p', wanted[1].metadata)], area), false);
  assert.equal(wanted[0].metadata.tag, OFFLINE_MAP_TAG);
});

test('summarizes progress across packs, counting shared tiles once', () => {
  const statuses = [
    { state: 'complete', requiredResourceCount: 100, completedResourceCount: 100, completedResourceSize: 3 * 1024 * 1024 },
    { state: 'active', requiredResourceCount: 100, completedResourceCount: 50, completedResourceSize: 1024 * 1024 },
  ];
  assert.deepEqual(summarizeProgress(statuses), { complete: false, percentage: 75, bytes: 3 * 1024 * 1024 });
  assert.equal(summarizeProgress([statuses[0]]).complete, true);
  assert.equal(summarizeProgress([]).complete, false);
  assert.equal(formatBytes(4 * 1024 * 1024), '4.0 MB');
  assert.equal(formatBytes(300 * 1024), '300 KB');
});
