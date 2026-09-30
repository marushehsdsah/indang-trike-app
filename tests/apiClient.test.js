const test = require('node:test');
const assert = require('node:assert/strict');
const { apiRequest } = require('../utils/apiClient');

test('API requests authenticate and preserve rejected action errors', async () => {
  let options;
  await assert.rejects(apiRequest('/rides/one/accept', { baseUrl: 'http://local', token: 'secret', body: { offerId: 'offer' }, fetchImpl: async (url, init) => {
    assert.equal(url, 'http://local/api/rides/one/accept'); options = init;
    return { ok: false, status: 409, json: async () => ({ error: 'Offer expired' }) };
  } }), (error) => error.status === 409 && error.message === 'Offer expired');
  assert.equal(options.headers.Authorization, 'Bearer secret');
  assert.equal(JSON.parse(options.body).offerId, 'offer');
});

test('unreachable backend produces an actionable failure rather than success', async () => {
  await assert.rejects(apiRequest('/state', { baseUrl: 'http://local', fetchImpl: async () => { throw new TypeError('Network'); } }), /connect/i);
});

test('a request that times out suggests waiting for a sleeping server', async () => {
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(apiRequest('/state', { baseUrl: 'https://api.example', fetchImpl, timeoutMs: 10 }), /asleep.*retry/i);
});
