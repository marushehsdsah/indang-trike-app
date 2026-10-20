const test = require('node:test');
const assert = require('node:assert/strict');
const { settleSheet } = require('../utils/sheetGesture');

test('dragging the chat up goes full screen, and down steps back to half, then closed', () => {
  assert.equal(settleSheet('half', -120, 0), 'full');
  assert.equal(settleSheet('full', -120, 0), 'full', 'already full');
  assert.equal(settleSheet('full', 120, 0), 'half');
  assert.equal(settleSheet('half', 120, 0), 'closed');
});

test('a short drag springs back, and a fling counts even when short', () => {
  assert.equal(settleSheet('half', -30, 0.1), 'half');
  assert.equal(settleSheet('full', 30, 0), 'full');
  assert.equal(settleSheet('half', -20, -1.2), 'full');
  assert.equal(settleSheet('full', 15, 0.9), 'half');
});

test('the fling\'s direction wins over the drag\'s', () => {
  // Dragged up a long way, then flicked back down.
  assert.equal(settleSheet('half', -150, 0.8), 'closed');
  assert.equal(settleSheet('full', 150, -0.8), 'full');
});
