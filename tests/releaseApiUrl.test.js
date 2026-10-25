const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseApiUrlProblem } = require('../utils/releaseApiUrl');

test('a release build needs the backend\'s public https address', () => {
  assert.equal(releaseApiUrlProblem('https://indanggo-api.onrender.com'), '');
  assert.equal(releaseApiUrlProblem('  https://indanggo-api.onrender.com/  '), '');
  assert.match(releaseApiUrlProblem(undefined), /is not set/);
  assert.match(releaseApiUrlProblem('   '), /is not set/);
  assert.match(releaseApiUrlProblem('indanggo-api.onrender.com'), /is not a web address/);
  assert.match(releaseApiUrlProblem('http://indanggo-api.onrender.com'), /must start with https:\/\//);
  for (const local of ['https://localhost:3000', 'https://127.0.0.1:3000', 'https://10.0.2.2:3000', 'https://192.168.1.5:3000', 'https://172.20.0.4']) {
    assert.match(releaseApiUrlProblem(local), /cannot reach/, local);
  }
  assert.equal(releaseApiUrlProblem('https://172.32.0.1'), '', 'outside the private 172.16-31 range');
});
