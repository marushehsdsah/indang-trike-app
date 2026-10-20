// Trip chat, shared by the app and the backend. The passenger and the driver
// of a ride can message each other from the moment the driver accepts until
// the trip is completed or cancelled; after that the chat is read-only.

const { ASSIGNED_STATUSES } = require('./rideState');

const MAX_MESSAGE_LENGTH = 300;
// A ride holds at most this many messages, so a whole chat loads in one request.
const MAX_MESSAGES_PER_RIDE = 200;
// Messages are deleted this long after they were sent.
const MESSAGE_RETENTION_DAYS = 30;

// One-tap replies by the sender's role. A message stores the key, and each
// phone shows it in its own language, so a Filipino "Nandito na ako" reaches
// an English-speaking passenger as "I'm here".
const QUICK_REPLIES = {
  driver: ['onMyWay', 'imHere', 'traffic', 'whereExactly'],
  passenger: ['atPickup', 'waitAMinute', 'comingOut'],
};

// The app names each message it sends, so a retried send is saved only once.
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

function canChat(status) {
  return ASSIGNED_STATUSES.includes(status);
}

// Line breaks stay; other control characters go, and blank lines collapse.
function cleanMessageText(value) {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// Checks a message sent by someone in `senderRole` and returns its clean form:
// { clientId, text } or { clientId, preset }. Throws an Error with a message
// the sender can read.
function validateMessage(body, senderRole) {
  if (typeof body?.clientId !== 'string' || !CLIENT_ID.test(body.clientId)) throw new Error('This message could not be sent. Try again.');
  const hasText = body.text !== undefined, hasPreset = body.preset !== undefined;
  if (hasText === hasPreset) throw new Error('Send either a message or a quick reply.');
  if (hasPreset) {
    if (!(QUICK_REPLIES[senderRole] ?? []).includes(body.preset)) throw new Error('Choose a quick reply from the list.');
    return { clientId: body.clientId, preset: body.preset };
  }
  const text = typeof body.text === 'string' ? cleanMessageText(body.text) : '';
  if (!text) throw new Error('Type a message first.');
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can have at most ${MAX_MESSAGE_LENGTH} characters.`);
  return { clientId: body.clientId, text };
}

module.exports = { MAX_MESSAGE_LENGTH, MAX_MESSAGES_PER_RIDE, MESSAGE_RETENTION_DAYS, QUICK_REPLIES, canChat, validateMessage };
