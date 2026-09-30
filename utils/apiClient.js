// A hosted free backend sleeps when idle and takes about a minute to wake, so
// requests wait that long; an unreachable server still fails immediately.
const REQUEST_TIMEOUT_MS = 70000;

async function apiRequest(path, { baseUrl, token, body, method = body === undefined ? 'GET' : 'POST', fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response, data;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    try { data = await response.json(); } catch { data = {}; }
  } catch (cause) {
    const error = new Error(cause.name === 'AbortError' ? 'IndangGO did not answer in time. If the server was asleep it can take a minute to start, so retry shortly.' : 'Could not connect to IndangGO. Check your connection and backend address.');
    error.cause = cause; throw error;
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    const error = new Error(data.error || `The request failed (${response.status}).`);
    error.status = response.status; throw error;
  }
  return data;
}
module.exports = { apiRequest };
