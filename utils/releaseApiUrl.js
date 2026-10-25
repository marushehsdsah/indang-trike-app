// Used by metro.config.js while building a release (the APK), not by the app.
// A release build has no PC to fall back on (utils/registration.js
// getApiBaseUrl), and Android refuses plain http in release builds, so it
// needs the backend's public https address in EXPO_PUBLIC_API_URL.
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

// Why a release build cannot use this address, or '' when it can.
function releaseApiUrlProblem(url) {
  const value = String(url ?? '').trim();
  if (!value) return 'EXPO_PUBLIC_API_URL is not set';
  let parsed;
  try { parsed = new URL(value); } catch { return `EXPO_PUBLIC_API_URL is not a web address (${value})`; }
  if (parsed.protocol !== 'https:') return `EXPO_PUBLIC_API_URL must start with https:// (it is ${value})`;
  if (LOCAL_HOST.test(parsed.hostname)) return `EXPO_PUBLIC_API_URL points at this PC or the local network (${value}), which phones cannot reach`;
  return '';
}

module.exports = { releaseApiUrlProblem };
