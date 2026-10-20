const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_MESSAGE_LENGTH, QUICK_REPLIES, canChat, validateMessage } = require('../utils/chat');

const id = 'c1a2b3c4-d5e6';

test('chat is open from acceptance until the trip ends', () => {
  for (const status of ['accepted', 'arrived', 'in_progress']) assert.equal(canChat(status), true, status);
  for (const status of ['searching', 'completed', 'cancelled', 'no_driver', undefined]) assert.equal(canChat(status), false, status);
});

test('a typed message is trimmed, keeps its line breaks and loses control characters', () => {
  assert.deepEqual(validateMessage({ clientId: id, text: '  Nasa gate na po ako  ' }, 'passenger'), { clientId: id, text: 'Nasa gate na po ako' });
  assert.deepEqual(validateMessage({ clientId: id, text: 'Blue gate\r\n\r\n\r\n\r\nnear the store\u0007' }, 'passenger'), { clientId: id, text: 'Blue gate\n\nnear the store' });
  assert.equal(validateMessage({ clientId: id, text: 'x'.repeat(MAX_MESSAGE_LENGTH) }, 'driver').text.length, MAX_MESSAGE_LENGTH);
});

test('a quick reply is stored as its key, and only the sender role\'s replies are allowed', () => {
  assert.deepEqual(validateMessage({ clientId: id, preset: 'imHere' }, 'driver'), { clientId: id, preset: 'imHere' });
  for (const preset of QUICK_REPLIES.passenger) assert.equal(validateMessage({ clientId: id, preset }, 'passenger').preset, preset);
  assert.throws(() => validateMessage({ clientId: id, preset: 'imHere' }, 'passenger'), /quick reply from the list/, 'a driver reply from a passenger');
  assert.throws(() => validateMessage({ clientId: id, preset: 'toString' }, 'driver'), /quick reply from the list/);
  assert.throws(() => validateMessage({ clientId: id, preset: 'imHere' }, 'admin'), /quick reply from the list/);
});

test('rejects empty, too long, mixed and unnamed messages', () => {
  for (const text of ['', '   ', '\n\u0000', 42, null]) assert.throws(() => validateMessage({ clientId: id, text }, 'driver'), /Type a message first/, String(text));
  assert.throws(() => validateMessage({ clientId: id, text: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }, 'driver'), /at most 300 characters/);
  assert.throws(() => validateMessage({ clientId: id, text: 'Hi', preset: 'imHere' }, 'driver'), /either a message or a quick reply/);
  assert.throws(() => validateMessage({ clientId: id }, 'driver'), /either a message or a quick reply/);
  for (const clientId of [undefined, 'short', 'has spaces in it', 'x'.repeat(65), 12345678]) {
    assert.throws(() => validateMessage({ clientId, text: 'Hi' }, 'driver'), /could not be sent/, String(clientId));
  }
  assert.throws(() => validateMessage(undefined, 'driver'), /could not be sent/);
});
