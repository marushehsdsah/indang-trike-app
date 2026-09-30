const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhilippinePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');

  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;

  return null;
}

function validateRegistration(form) {
  if (!form.firstName?.trim()) return 'First name is required.';
  if (!form.lastName?.trim()) return 'Last name is required.';
  if (!EMAIL_PATTERN.test(form.email?.trim() ?? '')) return 'Enter a valid email address.';
  if (!normalizePhilippinePhone(form.phone)) return 'Enter a valid Philippine mobile number.';
  if ((form.password ?? '').length < 8) return 'Password must be at least 8 characters.';
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  if (!form.acceptedTerms) return 'You must accept the Terms of Service and Privacy Policy.';
  if (form.role && !['passenger', 'driver'].includes(form.role)) return 'Choose passenger or driver.';
  if (form.role === 'driver' && (!form.plate?.trim() || !form.toda?.trim() || !Number.isInteger(form.capacity) || form.capacity < 1 || form.capacity > 4)) {
    return 'Enter your plate, TODA, and capacity (1–4).';
  }

  return null;
}

function getApiBaseUrl({ configuredUrl, scriptUrl, platform } = {}) {
  if (configuredUrl?.trim()) return configuredUrl.trim().replace(/\/$/, '');

  if (scriptUrl) {
    try {
      let hostname = new URL(scriptUrl).hostname;
      if (platform === 'android' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
        hostname = '10.0.2.2';
      }
      return `http://${hostname}:3000`;
    } catch {
      // Fall through to the platform-specific local development address.
    }
  }

  return platform === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://127.0.0.1:3000';
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function submitRegistration(form, { apiBaseUrl, fetchImpl = fetch } = {}) {
  const validationError = validateRegistration(form);
  if (validationError) throw new Error(validationError);
  if (!apiBaseUrl) throw new Error('The registration service address is not configured.');

  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, '')}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalizePhilippinePhone(form.phone),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role || 'passenger',
        ...(form.role === 'driver' ? { plate: form.plate.trim().toUpperCase(), toda: form.toda.trim(), capacity: form.capacity } : {}),
      }),
    });
  } catch {
    throw new Error('Could not connect to the registration service. Check that the backend is running.');
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(body.error || `Registration failed (${response.status}).`);
  }

  return body;
}

module.exports = {
  getApiBaseUrl,
  normalizePhilippinePhone,
  submitRegistration,
  validateRegistration,
};
