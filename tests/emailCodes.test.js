const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../indang-trike-backend/auth');
const { createBrevoMailer } = require('../indang-trike-backend/mailer');

// Just enough of the User, Session, EmailCode and ResetCode models for auth.js, in memory.
function fakeModels() {
  const matches = (doc, query) => Object.entries(query).every(([key, value]) => {
    if (value?.$in) return value.$in.includes(doc[key]);
    if (value?.$gt) return doc[key] > value.$gt;
    return doc[key] === value;
  });
  const collection = () => {
    const docs = [];
    return {
      docs,
      findOne: async (query) => docs.find((doc) => matches(doc, query)) ?? null,
      findById: async (id) => docs.find((doc) => doc._id === id) ?? null,
      exists: async (query) => docs.some((doc) => matches(doc, query)),
      create: async (doc) => { const created = { _id: `id${docs.length + 1}-${Math.random()}`, attempts: 0, ...doc }; docs.push(created); return created; },
      deleteOne: async (query) => { const index = docs.findIndex((doc) => matches(doc, query)); if (index >= 0) docs.splice(index, 1); },
      deleteMany: async (query) => { for (let i = docs.length - 1; i >= 0; i -= 1) if (matches(docs[i], query)) docs.splice(i, 1); },
      updateOne: async (query, update) => {
        const doc = docs.find((item) => matches(item, query));
        if (!doc) return;
        for (const [key, by] of Object.entries(update.$inc ?? {})) doc[key] += by;
        Object.assign(doc, update.$set);
      },
    };
  };
  return { User: collection(), Session: collection(), EmailCode: collection(), ResetCode: collection() };
}
function setup() {
  let now = Date.parse('2026-10-19T08:00:00Z');
  const sent = [], models = fakeModels();
  const auth = createAuth(models, () => now, { sendEmail: async (message) => { sent.push(message); } });
  return { auth, models, sent, advance: (ms) => { now += ms; } };
}
const form = { phone: '09171234567', password: 'strong-password', firstName: 'Juan', lastName: 'Dela Cruz', email: 'juan@gmail.com' };

test('the account is created only with the code emailed for that address', async () => {
  const { auth, models, sent } = setup();
  assert.deepEqual(await auth.sendSignupCode(form), { email: 'juan@gmail.com', message: 'We sent a 6-digit code to your email.' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'juan@gmail.com');
  assert.match(sent[0].code, /^\d{6}$/);
  assert.equal(models.User.docs.length, 0);
  assert.notEqual(models.EmailCode.docs[0].codeHash, sent[0].code);

  await assert.rejects(auth.register(form), { status: 400, message: /Incorrect code/ });
  const wrong = sent[0].code === '000000' ? '111111' : '000000';
  await assert.rejects(auth.register({ ...form, code: wrong }), { status: 400 });
  const user = await auth.register({ ...form, code: sent[0].code });
  assert.equal(user.email, 'juan@gmail.com');
  assert.equal(models.EmailCode.docs.length, 0);
  // The code works once.
  await assert.rejects(auth.register({ ...form, phone: '09181234567', email: 'juan@gmail.com', code: sent[0].code }), { status: 409 });
});

test('a form with mistakes, a taken phone or a taken email gets no code', async () => {
  const { auth, sent } = setup();
  await assert.rejects(auth.sendSignupCode({ ...form, password: 'short' }), { status: 400 });
  await assert.rejects(auth.sendSignupCode({ ...form, email: 'not-an-email' }), { status: 400 });
  await auth.sendSignupCode(form);
  await auth.register({ ...form, code: sent[0].code });
  await assert.rejects(auth.sendSignupCode({ ...form, email: 'other@gmail.com' }), { status: 409, message: /Phone number/ });
  await assert.rejects(auth.sendSignupCode({ ...form, phone: '09181234567' }), { status: 409, message: /email already/ });
  assert.equal(sent.length, 1);
});

test('codes can be resent after a minute, expire after ten, and allow five wrong tries', async () => {
  const { auth, sent, advance } = setup();
  await auth.sendSignupCode(form);
  await assert.rejects(auth.sendSignupCode(form), { status: 429 });
  advance(60000);
  await auth.sendSignupCode(form);
  assert.equal(sent.length, 2);
  // Only the newest code counts; an old one is a wrong try.
  let tries = 0;
  if (sent[0].code !== sent[1].code) { await assert.rejects(auth.register({ ...form, code: sent[0].code }), { status: 400 }); tries += 1; }

  const wrong = sent[1].code === '000000' ? '111111' : '000000';
  for (; tries < 5; tries += 1) await assert.rejects(auth.register({ ...form, code: wrong }), { status: 400 });
  await assert.rejects(auth.register({ ...form, code: sent[1].code }), { status: 429, message: /Too many wrong codes/ });

  advance(60000);
  await auth.sendSignupCode(form);
  advance(10 * 60 * 1000);
  await assert.rejects(auth.register({ ...form, code: sent[2].code }), { status: 400, message: /expired/ });
});

test('without a mailer no codes are sent, and a failed send leaves no usable code', async () => {
  const models = fakeModels();
  await assert.rejects(createAuth(models, Date.now).sendSignupCode(form), { status: 503 });
  const failing = createAuth(models, Date.now, { sendEmail: async () => { throw new Error('Brevo answered 401'); } });
  const quiet = console.error; console.error = () => {};
  try { await assert.rejects(failing.sendSignupCode(form), { status: 503, message: /Could not send the code/ }); }
  finally { console.error = quiet; }
  assert.equal(models.EmailCode.docs.length, 0);
});

test('the Brevo mailer sends the code from the verified sender', async () => {
  assert.equal(createBrevoMailer({ apiKey: '', senderEmail: '' }), null);
  const calls = [];
  const send = createBrevoMailer({ apiKey: 'key', senderEmail: 'me@gmail.com', fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true }; } });
  await send({ to: 'juan@gmail.com', code: '123456' });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].options.headers['api-key'], 'key');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.sender, { name: 'IndangGO', email: 'me@gmail.com' });
  assert.deepEqual(body.to, [{ email: 'juan@gmail.com' }]);
  assert.match(body.textContent, /123456/);
  const failing = createBrevoMailer({ apiKey: 'key', senderEmail: 'me@gmail.com', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'Key not found' }) });
  await assert.rejects(failing({ to: 'juan@gmail.com', code: '123456' }), /Brevo answered 401/);
});

async function signedUp() {
  const context = setup();
  await context.auth.sendSignupCode(form);
  await context.auth.register({ ...form, code: context.sent[0].code });
  context.sent.length = 0;
  return context;
}

test('a forgotten password is changed with the code emailed to the account, which logs it out everywhere', async () => {
  const { auth, models, sent } = await signedUp();
  await auth.login({ phone: form.phone, password: form.password });
  assert.equal(models.Session.docs.length, 1);

  assert.deepEqual(await auth.sendResetCode({ email: ' Juan@Gmail.com ' }), { email: 'juan@gmail.com', message: 'If an account uses this email, we sent it a 6-digit code.' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].purpose, 'reset');
  const wrong = sent[0].code === '000000' ? '111111' : '000000';
  await assert.rejects(auth.checkResetCode({ email: 'juan@gmail.com', code: wrong }), { status: 400 });
  assert.deepEqual(await auth.checkResetCode({ email: 'juan@gmail.com', code: sent[0].code }), { ok: true });

  await assert.rejects(auth.resetPassword({ email: 'juan@gmail.com', code: sent[0].code, password: 'short' }), { status: 400 });
  await auth.resetPassword({ email: 'juan@gmail.com', code: sent[0].code, password: 'brand-new-password' });
  assert.equal(models.Session.docs.length, 0);
  await assert.rejects(auth.login({ phone: form.phone, password: form.password }), { status: 401 });
  assert.match((await auth.login({ phone: form.phone, password: 'brand-new-password' })).token, /^[a-f0-9]{64}$/);
  // The code works once.
  await assert.rejects(auth.resetPassword({ email: 'juan@gmail.com', code: sent[0].code, password: 'another-password' }), { status: 400 });
});

test('an unknown email gets the same answer and no email; reset codes have the same limits', async () => {
  const { auth, sent, advance } = await signedUp();
  assert.equal((await auth.sendResetCode({ email: 'nobody@gmail.com' })).message, 'If an account uses this email, we sent it a 6-digit code.');
  assert.equal(sent.length, 0);
  await assert.rejects(auth.sendResetCode({ email: 'not-an-email' }), { status: 400 });

  await auth.sendResetCode({ email: 'juan@gmail.com' });
  await assert.rejects(auth.sendResetCode({ email: 'juan@gmail.com' }), { status: 429 });
  const wrong = sent[0].code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) await assert.rejects(auth.checkResetCode({ email: 'juan@gmail.com', code: wrong }), { status: 400 });
  await assert.rejects(auth.resetPassword({ email: 'juan@gmail.com', code: sent[0].code, password: 'brand-new-password' }), { status: 429 });
  advance(60000);
  await auth.sendResetCode({ email: 'juan@gmail.com' });
  advance(10 * 60 * 1000);
  await assert.rejects(auth.resetPassword({ email: 'juan@gmail.com', code: sent[1].code, password: 'brand-new-password' }), { status: 400, message: /expired/ });
});

test('a reset code is not a sign-up code', async () => {
  const { auth, sent, advance } = await signedUp();
  await auth.sendResetCode({ email: 'juan@gmail.com' });
  advance(60000);
  await assert.rejects(auth.register({ ...form, phone: '09181234567', email: 'new@gmail.com', code: sent[0].code }), { status: 400, message: /expired/ });
});

test('the reset email says it is for a password reset', async () => {
  let body;
  const send = createBrevoMailer({ apiKey: 'key', senderEmail: 'me@gmail.com', fetchImpl: async (url, options) => { body = JSON.parse(options.body); return { ok: true }; } });
  await send({ to: 'juan@gmail.com', code: '123456', purpose: 'reset' });
  assert.equal(body.subject, '123456 is your IndangGO password reset code');
  assert.match(body.textContent, /did not ask to reset your password/);
});
