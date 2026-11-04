const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMapLog, isDownloadFailure } = require('../utils/mapLogs');

test('a base-map tile that timed out or lost its connection is logged quietly', () => {
  const quiet = [];
  const timeout = { level: 'error', tag: 'Mbgl', message: '{RenderThread 10}[Style]: x' };
  const tile = { level: 'error', tag: 'Mbgl', message: '{RenderThread 10}[Style]: Failed to load tile 9/428/235=>9 for source openmaptiles: timeout' }; // as seen on a phone
  assert.equal(handleMapLog(tile, (line) => quiet.push(line)), true);
  assert.equal(quiet.length, 1);
  assert.equal(isDownloadFailure({ message: 'Failed to load tile 14/1/2=>14 for source openmaptiles: Unable to resolve host "tiles.openfreemap.org"' }), true);
  assert.equal(isDownloadFailure(timeout), false);
});

test('a map font that timed out or lost its connection is logged quietly', () => {
  const quiet = [];
  const font = { level: 'error', tag: 'Mbgl', message: '{RenderThread 13}[Style]: Failed to load glyph range 0-255 for font stack Noto Sans Italic:( timeout)' }; // as seen on the emulator
  assert.equal(handleMapLog(font, (line) => quiet.push(line)), true);
  assert.equal(quiet.length, 1);
  assert.equal(isDownloadFailure({ message: 'Failed to load glyph range 256-511 for font stack Noto Sans Bold: Unable to resolve host "tiles.openfreemap.org"' }), true);
});

test('other map errors keep the default logging', () => {
  assert.equal(handleMapLog({ level: 'error', tag: 'Mbgl', message: 'Failed to load tile 9/1/2=>9 for source openmaptiles: HTTP status code 404' }, () => assert.fail()), false);
  assert.equal(handleMapLog({ level: 'error', tag: 'Mbgl', message: 'Failed to load glyph range 0-255 for font stack Noto Sans Italic: HTTP status code 404' }, () => assert.fail()), false);
  assert.equal(handleMapLog({ level: 'error', tag: 'Mbgl', message: 'Failed to parse style: unexpected token' }, () => assert.fail()), false);
  assert.equal(handleMapLog(undefined, () => assert.fail()), false);
});
