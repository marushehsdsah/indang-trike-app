const { randomBytes, randomInt, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { HttpError, requireValue, normalizePhilippinePhone, profileFields, publicUser } = require('./policy');

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const hashCode = (email, code) => createHash('sha256').update(`${email}:${code}`).digest('hex');
// An emailed code (sign-up or password reset) lasts 10 minutes, can be resent
// after a minute, and allows five wrong tries before a new one is needed.
const CODE_TTL_MS = 10 * 60 * 1000, CODE_RESEND_MS = 60 * 1000, CODE_ATTEMPTS = 5;
const validPassword = (password) => typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password) <= 72;
const PASSWORD_RULE = 'Password must have at least 8 characters and at most 72 bytes.';

function createAuth(models, clock, { sendEmail } = {}) {
  const { User, Session, EmailCode, ResetCode } = models;
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
  // Returns the stored code entry when `code` matches; a wrong code uses up a try.
  async function checkCode(Codes, email, code) {
    const entry = await Codes.findOne({ email, expiresAt: { $gt: new Date(clock()) } });
    requireValue(entry, 400, 'The code expired. Ask for a new one.');
    requireValue(entry.attempts < CODE_ATTEMPTS, 429, 'Too many wrong codes. Ask for a new one.');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || hashCode(email, code) !== entry.codeHash) {
      await Codes.updateOne({ _id: entry._id }, { $inc: { attempts: 1 } });
      throw new HttpError(400, 'Incorrect code. Check your email and try again.');
    }
    return entry;
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
    const entry = await checkCode(EmailCode, fields.email, body.code);
    await EmailCode.deleteOne({ _id: entry._id });
    try {
      return publicUser(await User.create({ phone, password: await bcrypt.hash(body.password, 10), role, ...fields }));
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
  // Forgot password: a code goes to the account's email, the app checks it,
  // then the code and a new password change it. The answer is the same whether
  // or not an account uses the email, so the form cannot reveal who has one.
  const resetEmail = (body) => {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254, 400, 'Enter a valid email address.');
    return email;
  };
  async function sendResetCode(body) {
    const email = resetEmail(body);
    const user = await User.findOne({ email });
    if (user) await issueCode(ResetCode, email, 'reset', { userId: user._id });
    return { email, message: 'If an account uses this email, we sent it a 6-digit code.' };
  }
  async function checkResetCode(body) {
    await checkCode(ResetCode, resetEmail(body), body.code);
    return { ok: true };
  }
  async function resetPassword(body) {
    const email = resetEmail(body);
    requireValue(validPassword(body.password), 400, PASSWORD_RULE);
    const entry = await checkCode(ResetCode, email, body.code);
    const user = await User.findById(entry.userId);
    requireValue(user, 400, 'The code expired. Ask for a new one.');
    await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(body.password, 10) } });
    await ResetCode.deleteOne({ _id: entry._id });
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

module.exports = { createAuth };
