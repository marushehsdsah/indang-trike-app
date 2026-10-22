const { MAX_MESSAGES_PER_RIDE, canChat, validateMessage } = require('../utils/chat');
const { HttpError, requireValue } = require('./policy');
const { censorText } = require('../utils/profanity');

// Each person may send at most SEND_LIMIT messages in SEND_WINDOW_MS.
const SEND_LIMIT = 10, SEND_WINDOW_MS = 30 * 1000;

const messageView = (message) => ({
  id: String(message._id), clientId: message.clientId, rideId: message.rideId,
  senderId: message.senderId, senderRole: message.senderRole,
  ...(message.preset ? { preset: message.preset } : { text: message.text }),
  sentAt: message.sentAt, readAt: message.readAt ?? null,
});

// Trip chat between a ride's passenger and driver (utils/chat.js). Messages
// are sent over HTTP like every other write; Socket.IO only delivers them, as
// "chat:message" and "chat:read", to the two participants' phones.
function createChat({ models, io, clock }) {
  const { Ride, Rating, Message, Report } = models;
  // Both participants get every event, so all of their phones stay in step.
  function emit(ride, event, payload) {
    for (const id of new Set([ride.passengerId, ride.driverId].filter(Boolean))) io.to(`user:${id}`).emit(event, payload);
  }
  // A ride's chat belongs to its passenger and the driver who accepted it,
  // never to a driver who is only being offered the trip.
  async function participantRide(user, id) {
    requireValue(/^[a-f0-9]{24}$/.test(id), 404, 'Ride not found.');
    const ride = await Ride.findById(id), userId = String(user._id);
    requireValue(ride, 404, 'Ride not found.');
    requireValue(ride.passengerId === userId || ride.driverId === userId, 403, 'You are not a participant in this ride.');
    return { ride, rideId: String(ride._id), userId, role: ride.driverId === userId ? 'driver' : 'passenger' };
  }
  async function messagesOf(rideId) {
    return (await Message.find({ rideId }).sort({ sentAt: 1, _id: 1 }).limit(MAX_MESSAGES_PER_RIDE)).map(messageView);
  }
  // The whole chat, also after the trip ended (read-only then).
  async function list(user, id) {
    const { ride, rideId } = await participantRide(user, id);
    return { messages: await messagesOf(rideId), open: canChat(ride.status) };
  }
  async function send(user, id, body = {}) {
    const { ride, rideId, userId, role } = await participantRide(user, id);
    let fields;
    try { fields = validateMessage(body, role); } catch (error) { throw new HttpError(400, error.message); }
    // Offensive words are hidden before the other person sees the message.
    const censored = fields.text !== undefined && censorText(fields.text);
    if (censored?.censored) fields.text = censored.text;
    const same = async () => {
      const saved = await Message.findOne({ senderId: userId, clientId: fields.clientId });
      requireValue(!saved || saved.rideId === rideId, 409, 'This message could not be sent. Try again.');
      return saved;
    };
    // A retried send returns the message already saved, even one saved just
    // before the trip ended.
    const saved = await same();
    if (saved) return { message: messageView(saved) };
    requireValue(canChat(ride.status), 409, ride.status === 'searching' ? 'You can chat once a driver accepts the trip.' : 'This trip has ended, so its chat is closed.');
    const now = clock();
    const [recent, total] = await Promise.all([
      Message.countDocuments({ senderId: userId, sentAt: { $gt: new Date(now - SEND_WINDOW_MS) } }),
      Message.countDocuments({ rideId }),
    ]);
    requireValue(recent < SEND_LIMIT, 429, 'You are sending messages too fast. Wait a few seconds.');
    requireValue(total < MAX_MESSAGES_PER_RIDE, 409, 'This chat is full. Call or text instead.');
    let message;
    try {
      message = await Message.create({ ...fields, rideId, senderId: userId, recipientId: role === 'driver' ? ride.passengerId : ride.driverId, senderRole: role, sentAt: new Date(now) });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // The same message sent twice at once: the other request saved and delivered it.
      return { message: messageView(await same()) };
    }
    const view = messageView(message);
    emit(ride, 'chat:message', { rideId, message: view });
    if (!censored?.censored) return { message: view };
    await models.User.updateOne({ _id: userId }, { $inc: { languageWarnings: 1 } });
    return { message: view, censored: true };
  }
  // The viewer has now seen every message sent to them in this chat.
  async function markRead(user, id) {
    const { ride, rideId, userId } = await participantRide(user, id);
    const readAt = new Date(clock());
    const { modifiedCount } = await Message.updateMany({ rideId, recipientId: userId, readAt: null }, { $set: { readAt } });
    if (modifiedCount) emit(ride, 'chat:read', { rideId, readerId: userId, readAt });
    return { ok: true };
  }
  // Adds the viewer's unread count to the snapshot's current and last ride.
  async function addUnread(state, userId) {
    const rides = [state.ride, state.lastRide].filter(Boolean);
    if (!rides.length) return state;
    const counts = await Message.aggregate([
      { $match: { rideId: { $in: rides.map((ride) => ride.id) }, recipientId: String(userId), readAt: null } },
      { $group: { _id: '$rideId', count: { $sum: 1 } } },
    ]);
    const byRide = new Map(counts.map(({ _id, count }) => [_id, count]));
    for (const ride of rides) ride.unreadMessages = byRide.get(ride.id) ?? 0;
    return state;
  }
  // Pilot admins may read a trip's chat only once someone filed a safety
  // report on that trip: a flagged rating, or a driver's report of the passenger.
  async function transcript(id) {
    requireValue(/^[a-f0-9]{24}$/.test(id), 404, 'Ride not found.');
    const reported = await Rating.exists({ rideId: id, flagged: true }) || await Report.exists({ rideId: id });
    requireValue(reported, 403, "A trip's chat is shown only after a safety report on it.");
    return { rideId: id, messages: await messagesOf(id) };
  }
  return { list, send, markRead, addUnread, transcript };
}

module.exports = { createChat, SEND_LIMIT, SEND_WINDOW_MS };
