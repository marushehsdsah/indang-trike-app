const mongoose = require('mongoose');

function createModels(connection) {
  const { Schema } = mongoose;
  const userSchema = new Schema({
    phone: { type: String, required: true, unique: true }, password: { type: String, required: true },
    firstName: { type: String, default: '' }, lastName: { type: String, default: '' }, email: { type: String, default: '' },
    role: { type: String, enum: ['passenger', 'driver'], default: 'passenger' },
    plate: String, toda: String, capacity: { type: Number, default: 4 },
    available: { type: Boolean, default: false }, location: Schema.Types.Mixed,
    locationAvailable: { type: Boolean, default: false },
    // Running totals of the ratings this user has received; see utils/rating.js.
    ratingSum: { type: Number, default: 0 }, ratingCount: { type: Number, default: 0 },
  }, { timestamps: true, bufferCommands: false });
  const sessionSchema = new Schema({
    tokenHash: { type: String, unique: true, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  }, { timestamps: true, bufferCommands: false });
  const rideSchema = new Schema({
    passengerId: { type: String, required: true }, driverId: String, driverSlot: String,
    idempotencyKey: { type: String, required: true },
    active: { type: Boolean, default: true },
    status: { type: String, default: 'searching', enum: ['searching', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_driver'] },
    version: { type: Number, default: 1 }, trip: Schema.Types.Mixed, route: Schema.Types.Mixed,
    passengers: Number, note: String, fare: Number,
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
  const User = connection.model('User', userSchema);
  const Session = connection.model('Session', sessionSchema);
  const Ride = connection.model('Ride', rideSchema);
  const Rating = connection.model('Rating', ratingSchema);
  return { User, Session, Ride, Rating };
}

module.exports = { createModels };
