const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMessage } = require('../utils/chat');
const { formatMessageTime, markRead, mergeMessages, messageState, newClientId, pendingMessage } = require('../utils/chatThread');

const saved = (id, senderId, sentAt, extra = {}) => ({ id, clientId: `client-${id}`, senderId, senderRole: senderId === 'driver-1' ? 'driver' : 'passenger', text: id, sentAt, readAt: null, ...extra });

test('a new client id is one the server accepts, and differs each time', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newClientId()));
  assert.equal(ids.size, 50);
  for (const clientId of [...ids, newClientId(0, () => 0.5)]) assert.equal(validateMessage({ clientId, text: 'Hi' }, 'driver').clientId, clientId);
});

test('the saved copy replaces the phone\'s copy, and saved messages go in server order before unsent ones', () => {
  const sending = pendingMessage({ clientId: 'client-b', content: { text: 'b' }, senderId: 'passenger-1', senderRole: 'passenger', now: 5 });
  const later = pendingMessage({ clientId: 'client-z', content: { preset: 'comingOut' }, senderId: 'passenger-1', senderRole: 'passenger', now: 9 });
  assert.equal(messageState(sending), 'sending');
  let messages = mergeMessages([], [sending, later]);
  messages = mergeMessages(messages, [saved('c', 'driver-1', '2026-10-20T10:00:03Z'), saved('a', 'driver-1', '2026-10-20T10:00:01Z')]);
  messages = mergeMessages(messages, [saved('b', 'passenger-1', '2026-10-20T10:00:02Z')]);
  assert.deepEqual(messages.map((message) => message.clientId), ['client-a', 'client-b', 'client-c', 'client-z']);
  assert.equal(messages.length, 4, 'no duplicate of the sent message');
  assert.equal(messageState(messages[1]), 'sent');
  assert.equal(messageState(messages[3]), 'sending');
  // The same message echoed again changes nothing.
  assert.deepEqual(mergeMessages(messages, [saved('b', 'passenger-1', '2026-10-20T10:00:02Z')]), messages);
});

test('two people may pick the same client id without replacing each other\'s message', () => {
  const mine = saved('1', 'passenger-1', '2026-10-20T10:00:01Z', { clientId: 'same-id-123' });
  const theirs = saved('2', 'driver-1', '2026-10-20T10:00:02Z', { clientId: 'same-id-123' });
  assert.equal(mergeMessages([mine], [theirs]).length, 2);
});

test('a read receipt marks the other person\'s saved messages up to that time as seen', () => {
  const messages = [
    saved('a', 'passenger-1', '2026-10-20T10:00:01Z'), saved('b', 'driver-1', '2026-10-20T10:00:02Z'),
    saved('c', 'passenger-1', '2026-10-20T10:00:09Z'),
    pendingMessage({ clientId: 'client-d', content: { text: 'd' }, senderId: 'passenger-1', senderRole: 'passenger' }),
  ];
  const read = markRead(messages, 'driver-1', '2026-10-20T10:00:05Z');
  assert.deepEqual(read.map(messageState), ['seen', 'sent', 'sent', 'sending'], 'not the reader\'s own, a later one, or an unsaved one');
  // A late copy without the receipt keeps it.
  assert.equal(messageState(mergeMessages(read, [saved('a', 'passenger-1', '2026-10-20T10:00:01Z')])[0]), 'seen');
});

test('message times read like a clock', () => {
  assert.equal(formatMessageTime(new Date(2026, 9, 20, 14, 5)), '2:05 PM');
  assert.equal(formatMessageTime(new Date(2026, 9, 20, 0, 30)), '12:30 AM');
  assert.equal(formatMessageTime(new Date(2026, 9, 20, 12, 0)), '12:00 PM');
  assert.equal(formatMessageTime('not a time'), '');
});
