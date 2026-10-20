// The phone's side of a trip chat (utils/chat.js holds the rules the app and
// the backend share). A message the phone has not had saved yet has no id and
// a `status`: 'sending', or 'failed' with the reason; the server's copy
// replaces it once saved.

const timeOf = (message) => Date.parse(message.sentAt) || 0;
const keyOf = (message) => `${message.senderId}:${message.clientId}`;

// A name for a message being sent, so a retried send is saved only once.
function newClientId(now = Date.now(), random = Math.random) {
  return `chat-${now.toString(36)}-${random().toString(36).slice(2, 10).padEnd(8, '0')}`;
}

// The phone's copy of a message it is about to send; content is { text } or
// { preset }.
function pendingMessage({ clientId, content, senderId, senderRole, now = Date.now() }) {
  return { id: null, clientId, senderId, senderRole, ...content, sentAt: new Date(now).toISOString(), readAt: null, status: 'sending' };
}

// Adds or updates messages; a saved copy replaces the phone's copy of the same
// message. Saved messages go in the order the server received them, and those
// still being sent follow in the order they were written.
function mergeMessages(current, incoming) {
  const byKey = new Map(current.map((message) => [keyOf(message), message]));
  for (const message of incoming) {
    const previous = byKey.get(keyOf(message));
    // A late copy never takes back a read receipt the phone already shows.
    byKey.set(keyOf(message), previous?.readAt && !message.readAt ? { ...message, readAt: previous.readAt } : message);
  }
  const all = [...byKey.values()];
  const saved = all.filter((message) => message.id).sort((a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : 1));
  return [...saved, ...all.filter((message) => !message.id)];
}

// readerId has seen every saved message sent to them, up to readAt.
function markRead(messages, readerId, readAt) {
  const until = Date.parse(readAt);
  return messages.map((message) => (message.id && !message.readAt && message.senderId !== readerId && timeOf(message) <= until
    ? { ...message, readAt } : message));
}

// What its sender sees under a message: sending, failed, sent, or seen.
function messageState(message) {
  return message.status ?? (message.readAt ? 'seen' : 'sent');
}

// "2:05 PM", in the phone's time zone.
function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

module.exports = { newClientId, pendingMessage, mergeMessages, markRead, messageState, formatMessageTime };
