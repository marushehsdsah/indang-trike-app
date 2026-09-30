const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { HttpError, requireValue, normalizePhilippinePhone, profileFields, publicUser } = require('./policy');

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function createAuth(models, clock) {
  const { User, Session } = models;
  async function register(body) {
    const phone = normalizePhilippinePhone(body.phone);
    requireValue(phone, 400, 'Enter a valid Philippine mobile number.');
    requireValue(typeof body.password === 'string' && body.password.length >= 8 && Buffer.byteLength(body.password) <= 72, 400, 'Password must have at least 8 characters and at most 72 bytes.');
    const role = body.role ?? 'passenger';
    requireValue(['passenger', 'driver'].includes(role), 400, 'Choose passenger or driver.');
    // Also check the legacy national format so normalization cannot duplicate an account.
    requireValue(!await User.exists({ phone: { $in: [phone, `0${phone.slice(3)}`, phone.slice(1), phone.slice(3)] } }), 409, 'Phone number already registered.');
    try {
      return publicUser(await User.create({ phone, password: await bcrypt.hash(body.password, 10), role, ...profileFields(body, role) }));
    } catch (error) {
      if (error.code === 11000) throw new HttpError(409, 'Phone number already registered.');
      throw error;
    }
  }
  async function login(body) {
    const phone = normalizePhilippinePhone(body.phone);
    requireValue(phone && typeof body.password === 'string' && Buffer.byteLength(body.password) <= 72, 401, 'Invalid phone number or password.');
    const user = await User.findOne({ phone: { $in: [phone, `0${phone.slice(3)}`, phone.slice(1), phone.slice(3)] } });
    requireValue(user && await bcrypt.compare(body.password, user.password), 401, 'Invalid phone number or password.');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(clock() + 7 * 24 * 60 * 60 * 1000);
    await Session.create({ userId: user._id, tokenHash: hashToken(token), expiresAt });
    return { token, expiresAt, user: publicUser(user) };
  }
  async function authenticate(token) {
    requireValue(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 401, 'Please log in again.');
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date(clock()) } });
    requireValue(session, 401, 'Your session has expired. Please log in again.');
    const user = await User.findById(session.userId);
    requireValue(user, 401, 'Please log in again.');
    return { user, session };
  }
  async function middleware(req, res, next) {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const identity = await authenticate(token);
      Object.assign(req, identity);
      next();
    } catch (error) { next(error); }
  }
  return { register, login, authenticate, middleware };
}

module.exports = { createAuth };
