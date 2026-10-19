const MESSAGES = {
  signup: { subject: 'is your IndangGO code', intro: 'Your IndangGO sign-up code is', ignore: 'If you did not sign up for IndangGO, ignore this email.' },
  reset: { subject: 'is your IndangGO password reset code', intro: 'Your IndangGO password reset code is', ignore: 'If you did not ask to reset your password, ignore this email; your password stays the same.' },
};

// Sends sign-up and password reset codes through Brevo's email API. It goes over HTTPS because
// Render's free tier blocks outgoing SMTP. Without BREVO_API_KEY and
// BREVO_SENDER_EMAIL (a sender verified in Brevo) the server cannot send codes.
function createBrevoMailer({
  apiKey = process.env.BREVO_API_KEY, senderEmail = process.env.BREVO_SENDER_EMAIL,
  senderName = process.env.BREVO_SENDER_NAME || 'IndangGO', fetchImpl = fetch,
} = {}) {
  if (!apiKey?.trim() || !senderEmail?.trim()) return null;
  return async function sendEmail({ to, code, purpose = 'signup' }) {
    const text = MESSAGES[purpose] ?? MESSAGES.signup;
    const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail.trim() }, to: [{ email: to }],
        subject: `${code} ${text.subject}`,
        textContent: `${text.intro} ${code}.\n\nIt expires in 10 minutes. ${text.ignore}`,
        htmlContent: `<p>${text.intro}</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`
          + `<p>It expires in 10 minutes. ${text.ignore}</p>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Brevo answered ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
  };
}

module.exports = { createBrevoMailer };
