const { randomBytes, randomInt, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { HttpError, requireValue, normalizePhilippinePhone, profileFields, publicUser } = require('./policy');
const { suspensionOf, suspensionMessage } = require('../utils/reports');
const { maskEmail } = require('../utils/maskEmail');

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const hashCode = (email, code) => createHash('sha256').update(`${email}:${code}`).digest('hex');
// An emailed code (sign-up or password reset) lasts 10 minutes, can be resent
// after a minute, and allows five wrong tries before a new one is needed.
const CODE_TTL_MS = 10 * 60 * 1000, CODE_RESEND_MS = 60 * 1000, CODE_ATTEMPTS = 5;
const validPassword = (password) => typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password) <= 72;
const PASSWORD_RULE = 'Password must have at least 8 characters and at most 72 bytes.';

function createAuth(models, clock, { sendEmail } = {}) {
  const { User, Session, EmailCode, ResetCode, Blocked } = models;
  // Stores a new code in `Codes` (EmailCode or ResetCode) and emails it.
  async function issueCode(Codes, email, purpose, extra = {}) {
    requireValue(sendEmail, 503, 'Email verification is not set up on this server.');
    const previous = await Codes.findOne({ email });
    requireValue(!previous || clock() - previous.sentAt >= CODE_RESEND_MS, 429, 'A code was just sent. Wait a minute before asking for another.');
    const code = String(randomInt(1000000)).padStart(6, '0');
    await Codes.deleteMany({ email });
    await Codes.create({ email, codeHash: hashCode(email, code), sentAt: new Date(clock()), expiresAt: new Date(clock() + CODE_TTL_MS), ...extra });
    try { await sendEmail({ to: email, code, purpose }); }
    catch (error) {
      await Codes.deleteMany({ email });
      console.error(`${purpose} code email failed:`, error.message);
      throw new HttpError(503, 'Could not send the code. Check the email address and try again.');
    }
  }
  // Returns the stored code entry when `code` matches. Every check takes one of
  // the code's tries in the same database step that reads it, so guesses sent
  // in parallel cannot all slip under the limit.
  async function checkCode(Codes, email, code) {
    const live = { email, expiresAt: { $gt: new Date(clock()) } };
    const entry = await Codes.findOneAndUpdate({ ...live, attempts: { $lt: CODE_ATTEMPTS } }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (!entry) {
      requireValue(!await Codes.exists(live), 429, 'Too many wrong codes. Ask for a new one.');
      throw new HttpError(400, 'The code expired. Ask for a new one.');
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || hashCode(email, code) !== entry.codeHash) {
      throw new HttpError(400, 'Incorrect code. Check your email and try again.');
    }
    return entry;
  }
  // Uses up a checked code. Only one request can delete it, so two requests
  // racing with the same code cannot both go ahead.
  async function useCode(Codes, entry) {
    const { deletedCount } = await Codes.deleteOne({ _id: entry._id });
    requireValue(deletedCount === 1, 400, 'The code expired. Ask for a new one.');
  }
  // Everything about a signup except the email code, checked before a code is
  // sent so a mistake shows up before the person waits for an email.
  async function checkSignup(body) {
    const phone = normalizePhilippinePhone(body.phone);
    requireValue(phone, 400, 'Enter a valid Philippine mobile number.');
    requireValue(validPassword(body.password), 400, PASSWORD_RULE);
    const role = body.role ?? 'passenger';
    requireValue(['passenger', 'driver'].includes(role), 400, 'Choose passenger or driver.');
    const fields = profileFields(body, role);
    // Also check the legacy national format so normalization cannot duplicate an account.
    // A number or email from an account disabled for fake bookings cannot sign up again.
    requireValue(!await Blocked.exists({ $or: [{ phone }, { email: fields.email }] }), 403, 'This mobile number or email cannot be used to create an account.');
    requireValue(!await User.exists({ phone: { $in: [phone, `0${phone.slice(3)}`, phone.slice(1), phone.slice(3)] } }), 409, 'Phone number already registered.');
    // One account per email, so one inbox cannot verify a pile of accounts.
    requireValue(!await User.exists({ email: fields.email }), 409, 'This email already has an account.');
    return { phone, role, fields };
  }
  async function sendSignupCode(body) {
    requireValue(sendEmail, 503, 'Email verification is not set up on this server.');
    const { fields: { email } } = await checkSignup(body);
    await issueCode(EmailCode, email, 'signup');
    return { email, message: 'We sent a 6-digit code to your email.' };
  }
  async function register(body) {
    const { phone, role, fields } = await checkSignup(body);
    await useCode(EmailCode, await checkCode(EmailCode, fields.email, body.code));
    try {
      // A new driver waits for an admin to check them against their TODA's list.
      return publicUser(await User.create({ phone, password: await bcrypt.hash(body.password, 10), role, ...fields, ...(role === 'driver' ? { approval: 'pending' } : {}) }));
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
    // Only after the password, so the message tells nothing to someone guessing.
    const suspension = suspensionOf(user, clock());
    requireValue(!suspension, 403, suspensionMessage(suspension));
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(clock() + 7 * 24 * 60 * 60 * 1000);
    await Session.create({ userId: user._id, tokenHash: hashToken(token), expiresAt });
    return { token, expiresAt, user: publicUser(user) };
  }
  // Forgot password goes by the mobile number the account logs in with: a code
  // goes to the email that account signed up with, the app checks it, then the
  // code and a new password change it. The app shows the email only masked.
  async function resetAccount(body) {
    const phone = normalizePhilippinePhone(body.phone);
    requireValue(phone, 400, 'Enter a valid Philippine mobile number.');
    const user = await User.findOne({ phone: { $in: [phone, `0${phone.slice(3)}`, phone.slice(1), phone.slice(3)] } });
    requireValue(user?.email, 404, 'No account uses this mobile number.');
    return { user, email: user.email.toLowerCase() };
  }
  async function sendResetCode(body) {
    requireValue(sendEmail, 503, 'Email verification is not set up on this server.');
    const { user, email } = await resetAccount(body);
    await issueCode(ResetCode, email, 'reset', { userId: user._id });
    return { email: maskEmail(email), message: `We sent a 6-digit code to ${maskEmail(email)}.` };
  }
  async function checkResetCode(body) {
    await checkCode(ResetCode, (await resetAccount(body)).email, body.code);
    return { ok: true };
  }
  async function resetPassword(body) {
    const { email } = await resetAccount(body);
    requireValue(validPassword(body.password), 400, PASSWORD_RULE);
    const entry = await checkCode(ResetCode, email, body.code);
    const user = await User.findById(entry.userId);
    requireValue(user, 400, 'The code expired. Ask for a new one.');
    const password = await bcrypt.hash(body.password, 10);
    await useCode(ResetCode, entry);
    await User.updateOne({ _id: user._id }, { $set: { password } });
    // Whoever knew the old password is logged out everywhere.
    await Session.deleteMany({ userId: user._id });
    return { message: 'Your password was changed. Log in with your new password.' };
  }
  async function authenticate(token) {
    requireValue(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 401, 'Please log in again.');
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date(clock()) } });
    requireValue(session, 401, 'Your session has expired. Please log in again.');
    const user = await User.findById(session.userId);
    requireValue(user, 401, 'Please log in again.');
    // A suspension also ends every session; this covers any that slip through.
    const suspension = suspensionOf(user, clock());
    requireValue(!suspension, 401, suspensionMessage(suspension));
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
  return { sendSignupCode, register, login, sendResetCode, checkResetCode, resetPassword, authenticate, middleware };
}

module.exports = { createAuth, maskEmail };
