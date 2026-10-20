const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mountApp, deferred, flush, renderer } = require('./helpers/reactHarness');

const RIDE = { id: 'ride-one', version: 1, status: 'accepted', unreadMessages: 0, driver: { id: 'driver-1', firstName: 'Juan' } };
const fromDriver = (id, extra = {}) => ({ id, clientId: `client-${id}`, rideId: RIDE.id, senderId: 'driver-1', senderRole: 'driver', preset: 'imHere', sentAt: '2026-10-20T10:00:00.000Z', readAt: null, ...extra });
const offline = () => Object.assign(new Error('Could not connect to IndangGO.'), { cause: new Error('Network request failed') });

// A signed-in passenger on an accepted ride; `chat` answers the chat requests.
async function riding(chat) {
  const calls = [];
  const app = await mountApp((path, options, snapshot) => {
    if (path.startsWith('/rides/ride-one/messages')) { calls.push({ path, body: options.body }); return chat?.(path, options); }
    if (path === '/state') { snapshot.ride = { ...RIDE, ...snapshot.ride }; return undefined; }
  });
  await renderer.act(async () => { await app.value.signIn('09170000000', 'password'); });
  await flush();
  return { app, calls, socket: () => app.sockets.at(-1) };
}

test('a sent message shows at once, and one that failed offline goes out again on reconnect', async () => {
  let attempts = 0;
  const first = deferred();
  const { app, calls, socket } = await riding((path, options) => {
    if (options.body?.text !== 'Nasa gate ako') return undefined;
    attempts += 1;
    return attempts === 1 ? first.promise : { message: { ...fromDriver('m1'), senderId: 'account-one', senderRole: 'passenger', preset: undefined, text: 'Nasa gate ako', clientId: options.body.clientId } };
  });
  try {
    let sending;
    await renderer.act(async () => { sending = app.value.sendChat('ride-one', { text: 'Nasa gate ako' }); });
    assert.deepEqual(app.value.chat.messages.map((message) => [message.status, message.text]), [['sending', 'Nasa gate ako']]);
    await renderer.act(async () => { first.reject(offline()); await sending; });
    const [failed] = app.value.chat.messages;
    assert.deepEqual([failed.status, failed.retry, failed.text], ['failed', true, 'Nasa gate ako']);
    await renderer.act(async () => { socket().emit('disconnect', 'transport close'); });
    await renderer.act(async () => { socket().emit('connect'); });
    await flush();
    assert.equal(attempts, 2, 'sent again once the live link is back');
    const sends = calls.filter((call) => call.body?.text);
    assert.equal(sends[0].body.clientId, sends[1].body.clientId, 'the retry reuses the message name, so it is saved once');
    assert.deepEqual(app.value.chat.messages.map((message) => [message.id, message.status]), [['m1', undefined]]);
  } finally { await app.close(); }
});

test('a rejected message stays failed with the server\'s reason until it is retried by hand', async () => {
  const { app, socket } = await riding((path, options) => (options.body?.text
    ? Promise.reject(Object.assign(new Error('You are sending messages too fast. Wait a few seconds.'), { status: 429 })) : undefined));
  try {
    await renderer.act(async () => { await app.value.sendChat('ride-one', { text: 'Hello' }); });
    await renderer.act(async () => { socket().emit('disconnect', 'transport close'); socket().emit('connect'); });
    await flush();
    const [message] = app.value.chat.messages;
    assert.deepEqual([message.status, message.retry, message.error], ['failed', false, 'You are sending messages too fast. Wait a few seconds.']);
  } finally { await app.close(); }
});

test('a message from the other side counts as unread with a notice until the chat is opened', async () => {
  const { app, calls, socket } = await riding((path) => (path === '/rides/ride-one/messages' ? { messages: [fromDriver('m1')] } : { ok: true }));
  try {
    assert.equal(app.value.ride.unreadMessages, 0);
    await renderer.act(async () => { socket().emit('chat:message', { rideId: 'ride-one', message: fromDriver('m1') }); });
    assert.equal(app.value.ride.unreadMessages, 1);
    assert.equal(app.value.chatNotice.message.id, 'm1');
    await renderer.act(async () => { await app.value.viewChat('ride-one'); });
    assert.equal(app.value.ride.unreadMessages, 0);
    assert.equal(app.value.chatNotice, null);
    assert.deepEqual(app.value.chat.messages.map((message) => message.id), ['m1']);
    // While the chat is open, a new message is read at once and gives no notice.
    const reads = () => calls.filter((call) => call.path.endsWith('/read')).length;
    const before = reads();
    await renderer.act(async () => { socket().emit('chat:message', { rideId: 'ride-one', message: fromDriver('m2', { sentAt: '2026-10-20T10:00:05.000Z' }) }); });
    await flush();
    assert.equal(reads(), before + 1);
    assert.equal(app.value.ride.unreadMessages, 0);
    assert.equal(app.value.chatNotice, null);
    assert.deepEqual(app.value.chat.messages.map((message) => message.id), ['m1', 'm2']);
    await renderer.act(async () => { await app.value.viewChat(null); });
    await renderer.act(async () => { socket().emit('chat:message', { rideId: 'ride-one', message: fromDriver('m3', { sentAt: '2026-10-20T10:00:09.000Z' }) }); });
    assert.equal(app.value.ride.unreadMessages, 1, 'closed again, messages count as unread');
  } finally { await app.close(); }
});

test('a refresh asked for before the chat was read cannot bring the unread badge back', async () => {
  let held = null, serverUnread = 0;
  const app = await mountApp((path, options, snapshot) => {
    if (path === '/rides/ride-one/messages') return { messages: [fromDriver('m1')] };
    if (path === '/rides/ride-one/messages/read') { serverUnread = 0; return { ok: true }; }
    if (path !== '/state') return undefined;
    // Each snapshot is the server's state at the moment it was asked for.
    const state = { ...snapshot, ride: { ...RIDE, unreadMessages: serverUnread }, serverTime: Date.now() };
    if (held) { const pending = held; held = null; return pending.promise.then(() => state); }
    return state;
  });
  try {
    await renderer.act(async () => { await app.value.signIn('09170000000', 'password'); });
    await flush();
    serverUnread = 1;
    await renderer.act(async () => { app.sockets.at(-1).emit('chat:message', { rideId: 'ride-one', message: fromDriver('m1') }); });
    assert.equal(app.value.ride.unreadMessages, 1);
    // A background refresh is on its way when the chat opens and is read.
    const gate = deferred();
    held = gate;
    let refreshing;
    await renderer.act(async () => { refreshing = app.value.refresh(); });
    await renderer.act(async () => { await app.value.viewChat('ride-one'); });
    await renderer.act(async () => { await app.value.viewChat(null); });
    assert.equal(app.value.ride.unreadMessages, 0);
    await renderer.act(async () => { gate.resolve(); await refreshing; });
    assert.equal(app.value.ride.unreadMessages, 0, 'the snapshot from before the read does not count the message again');
    // A snapshot asked for later counts messages that arrived after the read.
    await new Promise((resolve) => setTimeout(resolve, 5));
    serverUnread = 1;
    await renderer.act(async () => { await app.value.refresh(); });
    assert.equal(app.value.ride.unreadMessages, 1);
  } finally { await app.close(); }
});

test('the other side reading the chat marks the phone\'s messages seen; logging out forgets the chat', async () => {
  const mine = { ...fromDriver('m1'), senderId: 'account-one', senderRole: 'passenger' };
  const { app, socket } = await riding((path) => (path === '/rides/ride-one/messages' ? { messages: [mine] } : { ok: true }));
  try {
    await renderer.act(async () => { await app.value.viewChat('ride-one'); });
    await renderer.act(async () => { socket().emit('chat:read', { rideId: 'ride-one', readerId: 'driver-1', readAt: '2026-10-20T10:00:03.000Z' }); });
    assert.equal(app.value.chat.messages[0].readAt, '2026-10-20T10:00:03.000Z');
    await renderer.act(async () => { await app.value.signOut(); });
    assert.deepEqual(app.value.chat, { rideId: null, messages: [], loaded: false });
    assert.equal(app.value.chatNotice, null);
  } finally { await app.close(); }
});
