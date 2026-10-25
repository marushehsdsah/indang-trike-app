const MESSAGES = {
  signup: { subject: 'is your IndangGO code', intro: 'Your IndangGO sign-up code is', ignore: 'If you did not sign up for IndangGO, ignore this email.' },
  reset: { subject: 'is your IndangGO password reset code', intro: 'Your IndangGO password reset code is', ignore: 'If you did not ask to reset your password, ignore this email; your password stays the same.' },
};
// What a driver is told when an admin decides on their account (admin.js),
// after checking it against their TODA's list of registered drivers.
const CHECKED = "An IndangGO admin checked your details against your TODA's list of registered drivers";
const NOTICES = {
  driverApproved: { subject: 'Your IndangGO driver registration is approved',
    lines: ['We are pleased to inform you that your driver registration has been approved. You can now accept bookings from passengers.',
      'Open the app and go online to start receiving bookings.'] },
  driverDeclined: { subject: 'Your IndangGO driver registration was declined',
    lines: ['We regret to inform you that your driver registration has been declined because the information you provided does not match the records of registered drivers from the TODAs in Indang.',
      'You may register again by providing the correct information and required credentials.'] },
  driverTerminated: { subject: 'Your IndangGO driver account was suspended',
    lines: [`${CHECKED} and suspended your driver account.`, 'You cannot log in while it is suspended, and this mobile number and email cannot be used to sign up again.'] },
  driverDeleted: { subject: 'Your IndangGO driver account was deleted',
    lines: [`${CHECKED} and deleted your driver account.`, 'If any of your details were wrong, you can sign up again with the correct ones.'] },
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function codeEmail(code, purpose) {
  const text = MESSAGES[purpose] ?? MESSAGES.signup;
  return {
    subject: `${code} ${text.subject}`,
    textContent: `${text.intro} ${code}.\n\nIt expires in 10 minutes. ${text.ignore}`,
    htmlContent: `<p>${text.intro}</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`
      + `<p>It expires in 10 minutes. ${text.ignore}</p>`,
  };
}
const SIGN_OFF = '— The IndangGO Team';
// name: the driver's first name; reason: what the admin wrote, if anything.
function noticeEmail({ subject, lines }, { name, reason }) {
  const paragraphs = [`Hi ${name || 'there'},`, ...lines, ...(reason ? [`Reason: ${reason}`] : []), SIGN_OFF];
  return { subject, textContent: paragraphs.join('\n\n'), htmlContent: paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join('') };
}

// Sends sign-up and password reset codes, and drivers' account notices,
// through Brevo's email API. It goes over HTTPS because Render's free tier
// blocks outgoing SMTP. Without BREVO_API_KEY and BREVO_SENDER_EMAIL (a sender
// verified in Brevo) the server cannot send email.
function createBrevoMailer({
  apiKey = process.env.BREVO_API_KEY, senderEmail = process.env.BREVO_SENDER_EMAIL,
  senderName = process.env.BREVO_SENDER_NAME || 'IndangGO', fetchImpl = fetch,
} = {}) {
  if (!apiKey?.trim() || !senderEmail?.trim()) return null;
  return async function sendEmail({ to, code, purpose = 'signup', name, reason }) {
    const content = NOTICES[purpose] ? noticeEmail(NOTICES[purpose], { name, reason }) : codeEmail(code, purpose);
    const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { name: senderName, email: senderEmail.trim() }, to: [{ email: to }], ...content }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Brevo answered ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
  };
}

module.exports = { createBrevoMailer, NOTICES };
