// Real browser + real API/database. Only a uniquely named test database is used.
// The God view website is built and served from its own origin, as in
// production, and reads the API cross-origin.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { io } = require('socket.io-client');
const { createBackend } = require('../indang-trike-backend/app');
const { DEFAULT_TRIP } = require('../data/indangMap');

async function main() {
  const dbName = `indang_test_browser_${randomUUID().replaceAll('-', '')}`;
  const backend = await createBackend({ mongoUri: `${process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017'}/${dbName}`, adminPhones: '09179999991' });
  const sockets = []; let browser, site, siteDir;
  try {
    await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${backend.server.address().port}`;
    const { buildSite } = await import('../web/god-view/build.mjs');
    const { startServer } = await import('../web/god-view/serve.mjs');
    siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'god-view-site-'));
    buildSite(siteDir, base);
    site = await startServer(siteDir, 0);
    const siteUrl = `http://127.0.0.1:${site.address().port}`;
    async function request(path, body, token) {
      const response = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
    }
    async function account(phone, role, firstName) {
      await request('/register', { phone, role, firstName, lastName: 'Pilot', email: `${phone}@example.com`, password: 'pilot-test-password', ...(role === 'driver' ? { plate: 'TEST-101', toda: 'General Trias', capacity: 4 } : {}) });
      return request('/login', { phone, password: 'pilot-test-password' });
    }
    async function connect(account) {
      const socket = io(base, { auth: { token: account.token }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      return socket;
    }
    await account('09179999991', 'passenger', 'Admin');
    const driver = await account('09179999992', 'driver', 'Alex');
    const passenger = await account('09179999993', 'passenger', 'Bea');
    const missing = await account('09179999994', 'passenger', '<img src=x onerror=alert(1)>');
    await connect(driver); await connect(passenger); const missingSocket = await connect(missing);
    const fix = { ...DEFAULT_TRIP.pickup.coordinate, timestamp: Date.now(), accuracy: 5 };
    await request('/driver/location', fix, driver.token);
    await request('/driver/availability', { available: true }, driver.token);
    await request('/passenger/location', { ...fix, ...DEFAULT_TRIP.dropoff.coordinate }, passenger.token);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${siteUrl}/`);
    await page.screenshot({ path: '/tmp/indang-god-view-login.png', fullPage: true });
    // Ordinary app credentials cannot open the admin dashboard.
    await page.locator('#phone').fill('09179999992');
    await page.locator('#password').fill('pilot-test-password');
    await page.locator('#sign-in').click();
    await page.locator('#login-error').filter({ hasText: 'does not have God view access' }).waitFor();
    await page.locator('#phone').fill('09179999991');
    await page.locator('#password').fill('pilot-test-password');
    await page.locator('#sign-in').click();
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#count-online').textContent === '3');
    await page.waitForFunction(() => document.querySelectorAll('.person-marker').length === 2);
    // The map canvas must fill its panel, not only the size it started at.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#map canvas')?.getBoundingClientRect(), panel = document.querySelector('#map').getBoundingClientRect();
      return canvas && Math.abs(canvas.width - panel.width) <= 2 && Math.abs(canvas.height - panel.height) <= 2;
    }, null, { timeout: 5000 });
    assert.equal(await page.locator('#user-list img').count(), 0, 'account markup stays text');
    assert.equal(await page.locator('#user-list').getByText('Waiting for GPS').count(), 1);
    await page.locator('[data-role=driver]').click();
    assert.equal(await page.locator('.user-row').count(), 1);
    await page.locator('.user-row').click();
    await page.locator('#person-details').getByText('TEST-101 · General Trias').waitFor();
    await page.locator('[data-role=all]').click();
    await page.locator('#search').fill('Bea');
    assert.equal(await page.locator('.user-row').count(), 1);
    assert.equal(await page.locator('.person-marker').count(), 1);
    await page.locator('#search').fill('');
    await page.locator('#fit-area').click();
    await page.waitForTimeout(1200);
    await request('/passenger/location/unavailable', {}, passenger.token);
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelectorAll('.person-marker.is-stale').length === 1);
    missingSocket.disconnect();
    await page.waitForFunction(() => document.querySelector('#count-online').textContent === '2');
    // A failed snapshot must mark retained positions as old.
    await page.route('**/api/admin/overview', route => route.abort('failed'));
    await page.locator('#refresh').click();
    await page.locator('#connection-status').filter({ hasText: 'Updates paused' }).waitFor();
    assert.equal(await page.locator('#count-online').textContent(), '—');
    assert.equal(await page.locator('.person-marker.is-stale').count(), 2);
    await page.unroute('**/api/admin/overview');
    await page.locator('#refresh').click();
    await page.locator('#connection-status').filter({ hasText: 'Live updates' }).waitFor();
    // A successful but old response must not restore the live indicator.
    await page.route('**/api/admin/overview', async route => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 11000));
      await route.fulfill({ response });
    });
    const delayed = page.waitForResponse('**/api/admin/overview');
    await page.locator('#refresh').click();
    await delayed;
    await page.locator('#connection-status').filter({ hasText: 'Updates paused' }).waitFor();
    assert.equal(await page.locator('#count-online').textContent(), '—');
    await page.unroute('**/api/admin/overview');
    await page.locator('#refresh').click();
    await page.locator('#connection-status').filter({ hasText: 'Live updates' }).waitFor();
    await page.screenshot({ path: '/tmp/indang-god-view-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#fit-area').click();
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow on phones');
    await page.screenshot({ path: '/tmp/indang-god-view-mobile.png', fullPage: true });
    await page.locator('#sign-out').click();
    await page.locator('#login').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.person-marker').count(), 0);
    assert.equal(await page.locator('.user-row').count(), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('indanggo.god-view.session')), null);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: separate-origin site, full-size map, access control, real GPS markers, missing/stale GPS, safe text, role/search filters, disconnect/reconnect, responsive layout and logout.');
  } finally {
    await browser?.close(); sockets.forEach(socket => socket.disconnect());
    site?.close(); if (siteDir) fs.rmSync(siteDir, { recursive: true, force: true });
    await backend.dispatch.run(async () => {});
    assert.equal(backend.models.User.db.name, dbName);
    await backend.models.User.db.dropDatabase(); await backend.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
