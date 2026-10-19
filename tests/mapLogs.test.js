const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMapLog, isTileDownloadFailure } = require('../utils/mapLogs');

test('a base-map tile that timed out or lost its connection is logged quietly', () => {
  const quiet = [];
  const timeout = { level: 'error', tag: 'Mbgl', message: '{RenderThread 10}[Style]: x' };
  const tile = { level: 'error', tag: 'Mbgl', message: '{RenderThread 10}[Style]: Failed to load tile 9/428/235=>9 for source openmaptiles: timeout' }; // as seen on a phone
  assert.equal(handleMapLog(tile, (line) => quiet.push(line)), true);
  assert.equal(quiet.length, 1);
  assert.equal(isTileDownloadFailure({ message: 'Failed to load tile 14/1/2=>14 for source openmaptiles: Unable to resolve host "tiles.openfreemap.org"' }), true);
  assert.equal(isTileDownloadFailure(timeout), false);
});

test('other map errors keep the default logging', () => {
  assert.equal(handleMapLog({ level: 'error', tag: 'Mbgl', message: 'Failed to load tile 9/1/2=>9 for source openmaptiles: HTTP status code 404' }, () => assert.fail()), false);
  assert.equal(handleMapLog({ level: 'error', tag: 'Mbgl', message: 'Failed to parse style: unexpected token' }, () => assert.fail()), false);
  assert.equal(handleMapLog(undefined, () => assert.fail()), false);
});
