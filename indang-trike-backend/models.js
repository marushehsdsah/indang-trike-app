const mongoose = require('mongoose');
const { MESSAGE_RETENTION_DAYS } = require('../utils/chat');

function createModels(connection) {
  const { Schema } = mongoose;
  const userSchema = new Schema({
    phone: { type: String, required: true, unique: true }, password: { type: String, required: true },
    firstName: { type: String, default: '' }, lastName: { type: String, default: '' }, email: { type: String, default: '' },
    // An admin account is added only in the database (role "admin"); sign-up
    // offers passenger or driver.
    role: { type: String, enum: ['passenger', 'driver', 'admin'], default: 'passenger' },
    plate: String, toda: String, capacity: { type: Number, default: 4 },
    // The one test driver who may switch TODAs from the profile, to check each
    // TODA's zone. Set only by scripts/create-toda-tester.js, never by the API.
    todaTester: { type: Boolean, default: false },
    available: { type: Boolean, default: false }, location: Schema.Types.Mixed,
    locationAvailable: { type: Boolean, default: false },
    // Running totals of the ratings this user has received; see utils/rating.js.
    ratingSum: { type: Number, default: 0 }, ratingCount: { type: Number, default: 0 },
    // How many times offensive words were censored from what this user sent
    // (utils/profanity.js); shown to admins.
    languageWarnings: { type: Number, default: 0 },
    // Upheld driver reports against this passenger (utils/reports.js), and the
    // penalty they brought: barred until suspendedUntil, or disabled for good.
    offenses: { type: Number, default: 0 }, suspendedUntil: Date, disabled: { type: Boolean, default: false },
    // A driver who signs up waits as "pending" until an admin approves them;
    // drivers without it (those from before approval) count as approved. A
    // driver an admin terminates is disabled, and terminatedAt says so.
    approval: { type: String, enum: ['pending', 'approved'] }, approvedAt: Date,
    terminatedAt: Date, terminationReason: String,
  }, { timestamps: true, bufferCommands: false });
  const sessionSchema = new Schema({
    tokenHash: { type: String, unique: true, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  }, { timestamps: true, bufferCommands: false });
  // The server checks expiresAt with its own clock; the database only clears
  // codes out a day after sending, so a server clock that runs behind the
  // database's cannot delete a fresh code.
  const CODE_CLEANUP_SECONDS = 24 * 60 * 60;
  // The code emailed to someone signing up; the account is created only with it.
  const emailCodeSchema = new Schema({
    email: { type: String, required: true, unique: true }, codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 }, sentAt: { type: Date, required: true, expires: CODE_CLEANUP_SECONDS },
    expiresAt: { type: Date, required: true },
  }, { timestamps: true, bufferCommands: false });
  // The code emailed for a forgotten password, tied to the account it resets.
  const resetCodeSchema = new Schema({
    email: { type: String, required: true, unique: true }, codeHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    attempts: { type: Number, default: 0 }, sentAt: { type: Date, required: true, expires: CODE_CLEANUP_SECONDS },
    expiresAt: { type: Date, required: true },
  }, { timestamps: true, bufferCommands: false });
  const rideSchema = new Schema({
    passengerId: { type: String, required: true }, driverId: String, driverSlot: String,
    idempotencyKey: { type: String, required: true },
    active: { type: Boolean, default: true },
    status: { type: String, default: 'searching', enum: ['searching', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_driver'] },
    version: { type: Number, default: 1 }, trip: Schema.Types.Mixed, route: Schema.Types.Mixed,
    passengers: Number, note: String, fare: Number, fareDetails: Schema.Types.Mixed,
    offerId: String, offerExpiresAt: Date, searchExpiresAt: Date, attemptedDrivers: { type: [String], default: [] },
    acceptedAt: Date, arrivedAt: Date, startedAt: Date, completedAt: Date, cancelledAt: Date,
    cancelledBy: String, cancellationReason: String,
  }, { timestamps: true, bufferCommands: false });
  rideSchema.index({ passengerId: 1, idempotencyKey: 1 }, { unique: true });
  rideSchema.index({ passengerId: 1 }, { unique: true, partialFilterExpression: { active: true } });
  rideSchema.index({ driverSlot: 1 }, { unique: true, partialFilterExpression: { active: true, driverSlot: { $type: 'string' } } });
  rideSchema.index({ driverId: 1, createdAt: -1 });
  // One rating per participant per completed ride, of the other participant.
  // flagged marks a safety report for admins.
  const ratingSchema = new Schema({
    rideId: { type: String, required: true }, raterId: { type: String, required: true }, rateeId: { type: String, required: true, index: true },
    raterRole: { type: String, enum: ['passenger', 'driver'], required: true },
    stars: { type: Number, required: true, min: 1, max: 5 }, tags: { type: [String], default: [] }, comment: { type: String, default: '' },
    flagged: { type: Boolean, default: false },
  }, { timestamps: true, bufferCommands: false });
  ratingSchema.index({ rideId: 1, raterId: 1 }, { unique: true });
  ratingSchema.index({ flagged: 1, createdAt: -1 });
  // A trip chat message between a ride's passenger and driver (utils/chat.js):
  // typed text or a quick-reply key. The sender's clientId makes a retried
  // send idempotent. sentAt is the server's clock; the database deletes a
  // message MESSAGE_RETENTION_DAYS after it.
  const messageSchema = new Schema({
    rideId: { type: String, required: true }, senderId: { type: String, required: true }, recipientId: { type: String, required: true },
    senderRole: { type: String, enum: ['passenger', 'driver'], required: true },
    clientId: { type: String, required: true }, text: String, preset: String,
    sentAt: { type: Date, required: true, expires: MESSAGE_RETENTION_DAYS * 24 * 60 * 60 }, readAt: Date,
  }, { bufferCommands: false });
  messageSchema.index({ senderId: 1, clientId: 1 }, { unique: true });
  messageSchema.index({ rideId: 1, sentAt: 1 });
  messageSchema.index({ senderId: 1, sentAt: -1 });
  // A driver's report about the passenger of one of their trips, once per
  // trip. An admin upholds it (action: the penalty given) or dismisses it.
  const reportSchema = new Schema({
    rideId: { type: String, required: true }, reporterId: { type: String, required: true }, passengerId: { type: String, required: true, index: true },
    reason: { type: String, required: true }, details: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'upheld', 'dismissed'], default: 'pending' },
    reviewedBy: String, reviewedAt: Date, penalty: Schema.Types.Mixed,
  }, { timestamps: true, bufferCommands: false });
  reportSchema.index({ rideId: 1, reporterId: 1 }, { unique: true });
  reportSchema.index({ status: 1, createdAt: -1 });
  // A mobile number and email that may not sign up again, from an account
  // disabled on its third offense. phone is stored normalized (+63…).
  const blockedSchema = new Schema({
    phone: { type: String, required: true, unique: true }, email: { type: String, index: true },
    userId: { type: String, required: true }, reason: String,
  }, { timestamps: true, bufferCommands: false });
  const User = connection.model('User', userSchema);
  const Report = connection.model('Report', reportSchema);
  const Blocked = connection.model('Blocked', blockedSchema);
  const Session = connection.model('Session', sessionSchema);
  const Ride = connection.model('Ride', rideSchema);
  const EmailCode = connection.model('EmailCode', emailCodeSchema);
  const ResetCode = connection.model('ResetCode', resetCodeSchema);
  const Rating = connection.model('Rating', ratingSchema);
  const Message = connection.model('Message', messageSchema);
  return { User, Session, Ride, Rating, Message, EmailCode, ResetCode, Report, Blocked };
}

module.exports = { createModels };
