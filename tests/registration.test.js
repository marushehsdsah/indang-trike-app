const test = require('node:test');
const assert = require('node:assert/strict');

function loadRegistrationModule() {
  try {
    return require('../utils/registration');
  } catch (error) {
    const moduleDoesNotExist =
      error.code === 'MODULE_NOT_FOUND' &&
      error.message.includes("'../utils/registration'");

    if (!moduleDoesNotExist) throw error;
    return {};
  }
}

const {
  getApiBaseUrl,
  submitRegistration,
  validateRegistration,
} = loadRegistrationModule();

const validForm = {
  firstName: ' Juan ',
  lastName: ' Dela Cruz ',
  email: ' JUAN@example.com ',
  phone: '0912 345 6789',
  password: 'secret123',
  confirmPassword: 'secret123',
  acceptedTerms: true,
};

test('submits a valid registration with a normalized Philippine phone number', async () => {
  const requests = [];
  const fetchImpl = async (...args) => {
    requests.push(args);
    return {
      ok: true,
      json: async () => ({ message: 'Account created successfully!' }),
    };
  };

  const result = await submitRegistration?.(validForm, {
    apiBaseUrl: 'http://192.168.1.20:3000/',
    fetchImpl,
  });

  assert.equal(result?.message, 'Account created successfully!');
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'http://192.168.1.20:3000/api/register');
  assert.deepEqual(requests[0][1], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+639123456789', password: 'secret123', firstName: 'Juan', lastName: 'Dela Cruz', email: 'juan@example.com', role: 'passenger' }),
  });
});

test('driver registration requires and submits vehicle details', async () => {
  const form = { ...validForm, role: 'driver', plate: 'abc 123', toda: 'Bancod', capacity: 3 };
  assert.ok(validateRegistration({ ...form, plate: '' }));
  assert.ok(validateRegistration({ ...form, capacity: 8 }));
  let payload;
  await submitRegistration(form, { apiBaseUrl: 'http://localhost', fetchImpl: async (url, options) => {
    payload = JSON.parse(options.body); return { ok: true, json: async () => ({}) };
  } });
  assert.equal(payload.role, 'driver');
  assert.equal(payload.plate, 'ABC 123');
  assert.equal(payload.capacity, 3);
});

test('rejects an invalid form before contacting the backend', async () => {
  let requestCount = 0;

  await assert.rejects(
    submitRegistration?.(
      { ...validForm, confirmPassword: 'different' },
      {
        apiBaseUrl: 'http://127.0.0.1:3000',
        fetchImpl: async () => {
          requestCount += 1;
        },
      },
    ),
    { message: 'Passwords do not match.' },
  );
  assert.equal(requestCount, 0);
});

test('requires every displayed field and acceptance of the terms', () => {
  assert.equal(validateRegistration?.({ ...validForm, firstName: ' ' }), 'First name is required.');
  assert.equal(validateRegistration?.({ ...validForm, lastName: '' }), 'Last name is required.');
  assert.equal(validateRegistration?.({ ...validForm, email: 'not-an-email' }), 'Enter a valid email address.');
  assert.equal(validateRegistration?.({ ...validForm, phone: '123' }), 'Enter a valid Philippine mobile number.');
  assert.equal(validateRegistration?.({ ...validForm, password: 'short' }), 'Password must be at least 8 characters.');
  assert.equal(validateRegistration?.({ ...validForm, acceptedTerms: false }), 'You must accept the Terms of Service and Privacy Policy.');
});

test('surfaces the backend error when registration is rejected', async () => {
  await assert.rejects(
    submitRegistration?.(validForm, {
      apiBaseUrl: 'http://127.0.0.1:3000',
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Phone number already registered' }),
      }),
    }),
    { message: 'Phone number already registered' },
  );
});

test('derives the backend address from Metro and honors an explicit override', () => {
  assert.equal(
    getApiBaseUrl?.({ scriptUrl: 'http://192.168.1.20:8081/index.bundle?platform=android' }),
    'http://192.168.1.20:3000',
  );
  assert.equal(
    getApiBaseUrl?.({ configuredUrl: 'https://api.example.com/' }),
    'https://api.example.com',
  );
  assert.equal(getApiBaseUrl?.({ platform: 'android' }), 'http://10.0.2.2:3000');
});
