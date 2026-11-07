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
const SERVICE_AREA_PLACES = require('../assets/places/service-area-places.json');

async function main() {
  const dbName = `indang_test_browser_${randomUUID().replaceAll('-', '').slice(0, 16)}`; // Atlas: at most 38 bytes
  const emailedCodes = new Map(); // stands in for Brevo
  const backend = await createBackend({ mongoUri: `${process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017'}/${dbName}`, sendEmail: async ({ to, code }) => { emailedCodes.set(to, code); } });
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
    // A driver is approved as if an admin did it, unless `approved` is false.
    async function account(phone, role, firstName, { approved = true } = {}) {
      const form = { phone, role, firstName, lastName: 'Pilot', email: `${phone}@example.com`, password: 'pilot-test-password', ...(role === 'driver' ? { plate: 'TEST-101', toda: 'Test TODA', capacity: 4 } : {}) };
      await request('/register/code', form);
      const { user } = await request('/register', { ...form, code: emailedCodes.get(form.email) });
      if (role === 'driver' && approved) await backend.models.User.updateOne({ _id: user.id }, { $set: { approval: 'approved' } });
      return request('/login', { phone, password: 'pilot-test-password' });
    }
    async function connect(account) {
      const socket = io(base, { auth: { token: account.token }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      return socket;
    }
    // A superadmin and an admin of one TODA, as only the database makes them;
    // a superadmin has no email.
    const superadmin = await account('09179999991', 'passenger', 'Admin');
    await backend.models.User.updateOne({ _id: superadmin.user.id }, { $set: { role: 'superadmin', email: '' } });
    const todaAdmin = await account('09179999997', 'passenger', 'Toda');
    await backend.models.User.updateOne({ _id: todaAdmin.user.id }, { $set: { role: 'admin', toda: 'BCITODA' } });
    const driver = await account('09179999992', 'driver', 'Alex');
    const passenger = await account('09179999993', 'passenger', 'Bea');
    const missing = await account('09179999994', 'passenger', 'Missing');
    // Registration rejects symbols in names, so plant the unsafe name directly to
    // keep checking that God view escapes names saved before that rule existed.
    await backend.models.User.updateOne({ phone: '+639179999994' }, { firstName: '<img src=x onerror=alert(1)>' });
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
    assert.equal(await page.locator('#login .brand').textContent(), 'IndangGO', 'the sign-in title is the wordmark alone');
    // Ordinary app credentials cannot open the admin dashboard.
    await page.locator('#phone').fill('09179999992');
    await page.locator('#password').fill('pilot-test-password');
    await page.locator('#sign-in').click();
    await page.locator('#login-error').filter({ hasText: 'does not have admin access' }).waitFor();
    // Nor can a TODA's admin, who works in the app instead.
    await page.locator('#phone').fill('09179999997');
    await page.locator('#password').fill('pilot-test-password');
    await page.locator('#sign-in').click();
    await page.locator('#login-error').filter({ hasText: 'God view is for superadmins' }).waitFor();
    assert.equal(await page.locator('#dashboard').isVisible(), false);
    await page.locator('#phone').fill('09179999991');
    await page.locator('#password').fill('pilot-test-password');
    const mapData = page.waitForResponse((response) => response.url().endsWith('/api/admin/map'));
    await page.locator('#sign-in').click();
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    // The top bar names the role and the signed-in account.
    assert.equal(await page.locator('.topbar-role').textContent(), 'Superadmin');
    assert.equal(await page.locator('#admin-name').textContent(), 'Admin Pilot');
    assert.equal(await page.locator('.topbar').getByText('PILOT', { exact: true }).count(), 0, 'no pilot tag in the top bar');
    assert.equal(await page.locator('#live-view').getByText('PILOT OPERATIONS').count(), 0, 'no pilot label on the live map');
    assert.equal((await (await mapData).json()).places.features.length, SERVICE_AREA_PLACES.features.length, 'establishments and landmarks reach the map');
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
    await page.locator('#person-details').getByText('TEST-101 · Test TODA').waitFor();
    await page.locator('[data-role=all]').click();
    await page.locator('#search').fill('Bea');
    assert.equal(await page.locator('.user-row').count(), 1);
    assert.equal(await page.locator('.person-marker').count(), 1);
    await page.locator('#search').fill('');
    // Accounts: every account, online or not, the staff included (the
    // superadmin and the TODA's admin, neither with the app open).
    await page.locator('#person-details [aria-label="Close user details"]').click();
    await page.locator('.view-tab[data-view=accounts]').click();
    await page.waitForFunction(() => document.querySelector('#account-count-all').textContent === '5');
    assert.equal(await page.locator('#map').isVisible(), false);
    assert.equal(await page.locator('#account-count-online').textContent(), '3');
    assert.equal(await page.locator('#account-count-offline').textContent(), '2');
    assert.equal(await page.locator('#account-note-all').textContent(), '1 driver · 2 passengers · 2 admins');
    assert.equal(await page.locator('#account-rows tr').count(), 5);
    assert.equal(await page.locator('#account-rows img').count(), 0, 'account markup stays text');
    assert.equal(await page.locator('#hide-admins').count(), 0, 'no checkbox: the Admins filter instead');
    assert.equal(await page.locator('#account-result-count').textContent(), '5 shown');
    // Admins: the superadmin and the TODA's admin, tagged with their role and
    // TODA. Staff never ride, so neither opens a trip history or shows on the map.
    assert.deepEqual(await page.locator('#account-types button').allTextContents(), ['Everyone', 'Drivers', 'Passengers', 'Admins', 'Pending approval']);
    await page.locator('#account-types [data-type=admin]').click();
    assert.equal(await page.locator('#account-rows tr').count(), 2);
    const superadminRow = page.locator('#account-rows tr', { hasText: 'Admin Pilot' }), todaAdminRow = page.locator('#account-rows tr', { hasText: 'Toda Pilot' });
    for (const label of ['Superadmin', 'Every TODA', 'No email']) await superadminRow.getByText(label, { exact: true }).waitFor();
    for (const label of ['Admin', 'BCITODA', '09179999997@example.com']) await todaAdminRow.getByText(label, { exact: true }).waitFor();
    assert.equal(await page.locator('#account-rows a, #account-rows button').count(), 0, 'no trip history link or map button');
    await todaAdminRow.click();
    assert.equal(await page.evaluate(() => location.hash), '#accounts', 'a staff row opens nothing');
    await page.locator('#account-types [data-type=passenger]').click();
    assert.equal(await page.locator('#account-rows tr').count(), 2, 'staff are not passengers');
    await page.locator('#account-types [data-type=all]').click();
    await page.locator('#account-statuses [data-status=offline]').click();
    assert.equal(await page.locator('#account-rows tr').count(), 2);
    await page.locator('#account-statuses [data-status=all]').click();
    await page.locator('#account-search').fill('0917 999 9992');
    assert.equal(await page.locator('#account-rows tr').count(), 1);
    await page.locator('#account-rows').getByText('Ready for requests', { exact: true }).waitFor();
    await page.locator('#account-rows').getByText('TEST-101', { exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/indang-god-view-accounts.png', fullPage: true });
    await page.reload();
    await page.locator('#account-rows tr').first().waitFor();
    assert.equal(await page.locator('.view-tab[aria-current=page]').textContent(), 'Accounts', 'a reload keeps the view');
    await page.locator('#admin-name').filter({ hasText: 'Admin Pilot' }).waitFor();
    await page.locator('#account-search').fill('0917 999 9992');
    // An online account opens on the map, and the map fills its panel again.
    await page.locator('#account-rows').getByRole('button', { name: 'Show on map' }).click();
    await page.locator('#person-details').getByText('TEST-101 · Test TODA').waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#live');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#map canvas')?.getBoundingClientRect(), panel = document.querySelector('#map').getBoundingClientRect();
      return canvas && panel.width > 0 && Math.abs(canvas.width - panel.width) <= 2 && Math.abs(canvas.height - panel.height) <= 2;
    }, null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('.person-marker').length === 2);
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
    // Each ride stage is drawn: the passenger's requested trip, the driver on
    // the way to the passenger, then both on the trip as one marker.
    await request('/driver/availability', { available: false }, driver.token);
    await request('/rides', { trip: DEFAULT_TRIP, passengers: 1, note: '', idempotencyKey: `god-view-${randomUUID()}` }, passenger.token);
    await page.locator('#refresh').click();
    await page.locator('.user-row', { hasText: 'Bea' }).click();
    await page.locator('#person-details').getByText('Requested trip: 9.0 km · 22 min', { exact: true }).waitFor();
    await page.locator('#person-details').getByText('Waiting for a driver', { exact: true }).waitFor();
    await request('/driver/location', { ...fix, latitude: 14.205, longitude: 120.885, timestamp: Date.now() }, driver.token);
    await request('/driver/availability', { available: true }, driver.token);
    const { offer } = await request('/state', null, driver.token);
    await request(`/rides/${offer.id}/accept`, { offerId: offer.offerId }, driver.token);
    await page.locator('#refresh').click();
    await page.locator('.user-row', { hasText: 'Alex' }).click();
    await page.locator('#person-details').getByText(/^Driver to passenger: [\d.]+ k?m · \d+ min$/).waitFor();
    await page.locator('#person-details').getByText('Then trip: 9.0 km · 22 min', { exact: true }).waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/indang-god-view-to-passenger.png', fullPage: true });
    for (const step of ['arrive', 'start']) await request(`/rides/${offer.id}/${step}`, {}, driver.token);
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelectorAll('.person-marker.trip').length === 1 && document.querySelectorAll('.person-marker').length === 1);
    await page.locator('#person-details [aria-label="Close user details"]').click();
    await page.locator('.person-marker.trip').click();
    await page.locator('#person-details').getByText('ON A TRIP', { exact: true }).waitFor();
    await page.locator('#person-details').getByText('Alex Pilot & Bea Pilot', { exact: true }).waitFor();
    await page.locator('#person-details').getByText('To destination: 9.0 km · 22 min', { exact: true }).waitFor();
    assert.equal(await page.locator('.user-row.selected').count(), 2, 'both people are highlighted');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/indang-god-view-desktop.png', fullPage: true });
    // Each account's whole trip history: the trip ends, the driver reports the
    // passenger, then a click on Bea's row opens her trips.
    await request(`/rides/${offer.id}/complete`, {}, driver.token);
    await request(`/rides/${offer.id}/report`, { reason: 'did_not_pay', details: 'Left without paying' }, driver.token);
    await page.locator('.view-tab[data-view=accounts]').click();
    await page.locator('#account-search').fill('Bea');
    await page.locator('#account-rows tr', { hasText: 'Bea Pilot' }).locator('.cell-phone').click();
    await page.locator('#history-profile').getByText('Bea Pilot', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), `#accounts/${passenger.user.id}`);
    await page.locator('#history-rows tr').first().waitFor();
    assert.equal(await page.locator('#history-download').isHidden(), true, "only a driver's trips download as a PDF");
    assert.equal(await page.locator('#history-rows tr').count(), 1);
    assert.equal(await page.locator('#history-count-completed').textContent(), '1');
    // Drivers report passengers instead of rating them.
    for (const value of ['Alex Pilot', 'Completed', 'Not rated', `${DEFAULT_TRIP.pickup.name} → ${DEFAULT_TRIP.dropoff.name}`]) {
      await page.locator('#history-rows').getByText(value, { exact: true }).waitFor();
    }
    assert.equal(await page.locator('#history-rows img').count(), 0, 'trip markup stays text');
    await page.locator('#history-statuses [data-trip=cancelled]').click();
    await page.locator('#history-empty').getByText('No cancelled trips', { exact: true }).waitFor();
    await page.locator('#history-statuses [data-trip=all]').click();
    // The period above the totals: with the trip booked 10 days ago, the last
    // 7 days have none and the last 14 days have it.
    const ride = await backend.models.Ride.findById(offer.id).lean();
    await backend.models.Ride.collection.updateOne({ _id: ride._id }, { $set: { createdAt: new Date(Date.now() - 10 * 24 * 3600000) } });
    await page.locator('#history-period').selectOption('7');
    await page.locator('#history-empty').getByText('No trips in the last 7 days', { exact: true }).waitFor();
    assert.equal(await page.locator('#history-count-total').textContent(), '0');
    await page.screenshot({ path: '/tmp/indang-god-view-history-week.png', fullPage: true });
    await page.locator('#history-period').selectOption('14');
    await page.locator('#history-rows tr').first().waitFor();
    assert.deepEqual([await page.locator('#history-rows tr').count(), await page.locator('#history-count-completed').textContent()], [1, '1']);
    await page.locator('#history-period').selectOption({ label: 'All time' });
    await page.locator('#history-note-total').filter({ hasText: 'Booked as the passenger' }).waitFor();
    await page.screenshot({ path: '/tmp/indang-god-view-history.png', fullPage: true });
    // The driver's side of the same trip, from the list the back button returns to.
    await page.goBack();
    await page.locator('#accounts-view').waitFor({ state: 'visible' });
    await page.locator('#account-search').fill('Alex');
    await page.locator('#account-rows').getByRole('link', { name: 'Alex Pilot' }).click();
    await page.locator('#history-with-heading').filter({ hasText: 'Passenger' }).waitFor();
    await page.locator('#history-rows').getByText('Bea Pilot', { exact: true }).waitFor();
    assert.equal(await page.locator('#history-fares-label').textContent(), 'Fares earned');
    // A driver's trip records download as a PDF, for the days the admin picks:
    // the trip booked 10 days ago is in the last 14 days.
    await page.locator('#history-download').click();
    await page.locator('#report-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#report-form input[name=days]:checked').getAttribute('value'), '7', 'with All time on screen, the dialog starts at 7 days');
    await page.locator('#report-cancel').click();
    await page.locator('#report-dialog').waitFor({ state: 'hidden' });
    await page.locator('#history-download').click();
    await page.locator('#report-form label', { hasText: 'Last 14 days' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/indang-god-view-report-dialog.png' });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#report-download').click()]);
    assert.match(download.suggestedFilename(), /^indanggo-alex-pilot-trips-last-14-days-\d{4}-\d{2}-\d{2}\.pdf$/);
    const pdf = fs.readFileSync(await download.path()).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.4') && pdf.endsWith('%%EOF\n'));
    for (const value of ['Alex Pilot', '0917 999 9992', '09179999992@example.com', 'TEST-101', 'Test TODA', 'Registered', 'Last 14 days', `#TR-${offer.id.slice(-6).toUpperCase()}`, 'Bea Pilot', 'Completed']) {
      assert.ok(pdf.includes(`(${value}) Tj`), `the PDF shows ${value}`);
    }
    await page.locator('#report-dialog').waitFor({ state: 'hidden' });
    await page.locator('#history-note').filter({ hasText: /^Downloaded Alex Pilot's trips from the last 14 days as indanggo-alex-pilot/ }).waitFor();
    // An ongoing trip in the driver's history can be cancelled, after the admin confirms.
    await request('/driver/location', { ...fix, timestamp: Date.now() }, driver.token);
    const { ride: booked } = await request('/rides', { trip: DEFAULT_TRIP, passengers: 1, note: '', idempotencyKey: `god-view-${randomUUID()}` }, passenger.token);
    const { offer: next } = await request('/state', null, driver.token);
    assert.equal(next?.id, booked.id);
    await request(`/rides/${booked.id}/accept`, { offerId: next.offerId }, driver.token);
    await page.locator('#history-refresh').click();
    await page.locator('#history-statuses [data-trip=ongoing]').click();
    await page.locator('#history-rows').getByText('Heading to pickup', { exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/indang-god-view-ongoing.png', fullPage: true });
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#history-rows').getByRole('button', { name: 'Cancel booking' }).click();
    await page.waitForTimeout(300);
    assert.equal((await backend.models.Ride.findById(booked.id).lean()).status, 'accepted', 'cancelling the question changes nothing');
    page.once('dialog', (dialog) => { assert.equal(dialog.type(), 'prompt'); assert.match(dialog.message(), /^Cancel trip #TR-/); dialog.accept('Passenger called the hotline'); });
    await page.locator('#history-rows').getByRole('button', { name: 'Cancel booking' }).click();
    await page.locator('#history-note').filter({ hasText: /^Trip #TR-\w+ was cancelled\.$/ }).waitFor();
    await page.locator('#history-empty').getByText('No ongoing trips', { exact: true }).waitFor();
    await page.locator('#history-statuses [data-trip=cancelled]').click();
    await page.locator('#history-rows').getByText('By the admin: Passenger called the hotline', { exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/indang-god-view-cancelled.png', fullPage: true });
    assert.deepEqual([(await request('/state', null, driver.token)).ride, (await request('/state', null, passenger.token)).lastRide.status], [null, 'cancelled']);
    // A trip that ends while the page still shows it as ongoing: the server
    // refuses to cancel it, and the page keeps saying why after the history
    // reloads and shows it completed.
    await request('/driver/location', { ...fix, timestamp: Date.now() }, driver.token);
    const { ride: ending } = await request('/rides', { trip: DEFAULT_TRIP, passengers: 1, note: '', idempotencyKey: `god-view-${randomUUID()}` }, passenger.token);
    const { offer: endingOffer } = await request('/state', null, driver.token);
    await request(`/rides/${ending.id}/accept`, { offerId: endingOffer.offerId }, driver.token);
    await page.locator('#history-refresh').click();
    await page.locator('#history-statuses [data-trip=ongoing]').click();
    await page.locator('#history-rows').getByText('Heading to pickup', { exact: true }).waitFor();
    for (const step of ['arrive', 'start', 'complete']) await request(`/rides/${ending.id}/${step}`, {}, driver.token);
    page.once('dialog', (dialog) => dialog.accept(''));
    await page.locator('#history-rows').getByRole('button', { name: 'Cancel booking' }).click();
    const tripRefusal = page.locator('#history-action-error').filter({ hasText: 'This trip has already ended.' });
    await tripRefusal.waitFor();
    await page.locator('#history-empty').getByText('No ongoing trips', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await tripRefusal.isVisible(), true, 'the refusal stays after the history reloads');
    assert.equal((await backend.models.Ride.findById(ending.id).lean()).status, 'completed', 'the trip stays completed');
    // A report another admin (here, another session) already reviewed: the
    // uphold is refused and the page keeps saying why after the reports reload.
    const historyPage = await page.evaluate(() => location.hash);
    const pendingReport = await backend.models.Report.findOne({ status: 'pending', reason: 'did_not_pay' }).lean();
    await page.locator('.view-tab[data-view=reports]').click();
    const reportRow = page.locator('#report-rows tr', { hasText: 'Left without paying' });
    await reportRow.getByRole('button', { name: /^Uphold/ }).waitFor();
    const otherTab = await request('/login', { phone: '09179999991', password: 'pilot-test-password' });
    await request(`/admin/reports/${pendingReport._id}/dismiss`, {}, otherTab.token);
    page.once('dialog', (dialog) => dialog.accept());
    await reportRow.getByRole('button', { name: /^Uphold/ }).click();
    const reportRefusal = page.locator('#reports-action-error').filter({ hasText: 'This report was already reviewed.' });
    await reportRefusal.waitFor();
    await page.locator('#report-statuses [data-report=all]').click();
    await reportRow.getByText('Dismissed', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await reportRefusal.isVisible(), true, 'the refusal stays after the reports reload');
    assert.equal((await backend.models.Report.findById(pendingReport._id).lean()).status, 'dismissed', 'not upheld after all');
    await request('/logout', {}, otherTab.token);
    // Leaving the page clears its refusal; coming back shows none.
    await page.evaluate((hash) => { location.hash = hash; }, historyPage);
    await page.locator('#history-profile .profile-name', { hasText: 'Alex Pilot' }).waitFor();
    assert.equal(await page.locator('#history-action-error').isVisible(), false, 'a new visit starts without the old refusal');
    assert.equal(await page.locator('#reports-action-error').isVisible(), false);
    await page.locator('#history-statuses [data-trip=all]').click();
    // A driver who signs up waits for approval: the Accounts tab counts them,
    // Pending approval lists them, and their page approves, suspends,
    // unblocks or deletes them, each after the admin confirms.
    await account('09179999995', 'driver', 'Cora', { approved: false });
    await page.locator('#accounts-badge').filter({ hasText: '1' }).waitFor();
    await page.locator('.view-tab[data-view=accounts]').click();
    await page.locator('#account-search').fill('');
    await page.locator('#account-types [data-type=pending]').click();
    await page.locator('#account-rows tr', { hasText: 'Cora Pilot' }).getByText('Pending', { exact: true }).waitFor();
    assert.equal(await page.locator('#account-rows tr').count(), 1);
    await page.screenshot({ path: '/tmp/indang-god-view-pending.png', fullPage: true });
    await page.locator('#account-rows').getByRole('link', { name: 'Cora Pilot' }).click();
    await page.locator('#history-profile').getByText('Pending approval', { exact: true }).waitFor();
    // Cancelling the question changes nothing.
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#history-profile [data-decision=approve]').click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#history-note').isVisible(), false);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#history-profile [data-decision=approve]').click();
    await page.locator('#history-note').filter({ hasText: 'Approved. Cora Pilot was emailed.' }).waitFor();
    assert.deepEqual(await page.locator('#history-profile [data-decision]').evaluateAll((buttons) => buttons.map((button) => button.dataset.decision)), ['terminate', 'delete']);
    await page.locator('#accounts-badge').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#history-profile [data-decision=terminate]').textContent(), 'Suspend');
    page.once('dialog', (dialog) => { assert.equal(dialog.type(), 'prompt'); assert.match(dialog.message(), /^Suspend Cora Pilot's account\?/); dialog.accept('Plate not on the TODA list'); });
    await page.locator('#history-profile [data-decision=terminate]').click();
    await page.locator('#history-note').filter({ hasText: 'Suspended. Cora Pilot was emailed.' }).waitFor();
    await page.locator('#history-profile').getByText('Suspended', { exact: true }).waitFor();
    await page.locator('#history-profile').getByText(/Suspended .* · Plate not on the TODA list/).waitFor();
    assert.equal((await backend.models.User.findOne({ phone: '+639179999995' })).terminationReason, 'Plate not on the TODA list');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#history-profile [data-decision=unblock]').click();
    await page.locator('#history-note').filter({ hasText: 'Unblocked. Cora Pilot waits for approval again.' }).waitFor();
    await page.locator('#history-profile').getByText('Pending approval', { exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/indang-god-view-approval.png', fullPage: true });
    page.once('dialog', (dialog) => dialog.accept(''));
    await page.locator('#history-profile [data-decision=delete]').click();
    await page.locator('#accounts-note').filter({ hasText: "Cora Pilot's account was deleted. Cora Pilot was emailed." }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#accounts');
    assert.equal(await backend.models.User.exists({ phone: '+639179999995' }), null);
    await page.locator('#account-types [data-type=all]').click();
    await page.locator('#account-rows tr').first().waitFor();
    assert.equal(await page.locator('#account-rows').getByText('Cora Pilot').count(), 0);
    // TODAs: every TODA lists the drivers who signed up under it, each with
    // their average rating and how many ratings it is from.
    await account('09179999996', 'driver', 'Dina');
    await backend.models.User.updateOne({ phone: '+639179999996' }, { $set: { toda: 'bitoda', plate: 'BIT-202', ratingSum: 9, ratingCount: 2 } });
    await page.locator('.view-tab[data-view=todas]').click();
    await page.locator('#driver-toda-list .toda-row').first().waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#todas');
    // The Indang TODAs by name, then the drivers whose TODA is none of them.
    const todaIds = await page.locator('#driver-toda-list .toda-row').evaluateAll((rows) => rows.map((row) => row.dataset.toda));
    assert.equal(todaIds.length, 17);
    assert.deepEqual([todaIds[0], todaIds.at(-1)], ['alitoda', 'other']);
    assert.equal(await page.locator('#driver-toda-count').textContent(), '16', 'Indang has 16 TODAs');
    assert.equal(await page.locator('#driver-toda-title').textContent(), 'ALITODA');
    await page.locator('#drivers-empty').getByText('No driver has signed up under ALITODA yet.').waitFor();
    await page.locator('#driver-toda-list [data-toda=bitoda]').click();
    await page.waitForFunction(() => document.querySelector('#driver-toda-title').textContent === 'BITODA');
    assert.equal(await page.evaluate(() => location.hash), '#todas/bitoda');
    assert.equal(await page.locator('#driver-toda-list [data-toda=bitoda] .toda-driver-count').textContent(), '1 driver');
    assert.equal(await page.locator('#driver-rows tr').count(), 1);
    const dina = page.locator('#driver-rows tr', { hasText: 'Dina Pilot' });
    await dina.getByText('BIT-202', { exact: true }).waitFor();
    assert.equal(await dina.locator('.driver-rating').textContent(), '4.5★(2)');
    assert.equal(await dina.locator('.driver-rating').getAttribute('aria-label'), 'Rated 4.5 out of 5 from 2 ratings');
    await dina.getByText('Offline', { exact: true }).waitFor();
    await page.locator('#driver-toda-serves').getByText('Serves Bancod; also picks up at CvSU (Kaytapos).').waitFor();
    await page.locator('#driver-toda-summary').getByText('1 driver', { exact: true }).waitFor();
    assert.equal(await page.locator('#driver-toda-summary .driver-rating').textContent(), '4.5★(2)');
    await page.screenshot({ path: '/tmp/indang-god-view-todas.png', fullPage: true });
    // A driver whose TODA is not an Indang TODA is listed with the TODA they gave.
    await page.locator('#driver-toda-list [data-toda=other]').click();
    await page.waitForFunction(() => document.querySelector('#driver-toda-title').textContent === 'Other TODAs');
    const alex = page.locator('#driver-rows tr', { hasText: 'Alex Pilot' });
    await alex.getByText('TEST-101 · Test TODA', { exact: true }).waitFor();
    await alex.getByText('Online', { exact: true }).waitFor();
    assert.equal(await page.locator('#driver-toda-summary .driver-rating').count(), 0, 'no TODA rating for drivers of other TODAs');
    await page.locator('#driver-search').fill('0917 999 9992');
    assert.equal(await page.locator('#driver-rows tr').count(), 1);
    await page.locator('#driver-search').fill('nobody');
    await page.locator('#drivers-empty').getByText('No matching drivers').waitFor();
    assert.equal(await page.locator('#drivers-table').isVisible(), false);
    await page.locator('#driver-search').fill('');
    // A driver's name opens their account; its back link returns to their TODA.
    await page.locator('#driver-toda-list [data-toda=bitoda]').click();
    await page.locator('#driver-rows').getByRole('link', { name: 'Dina Pilot' }).click();
    await page.locator('#history-profile').getByText('Dina Pilot').first().waitFor();
    assert.equal(await page.locator('.view-tab[aria-current=page]').textContent(), 'TODAs');
    assert.equal(await page.locator('#history-view .back-link').textContent(), '← BITODA drivers');
    await page.locator('#history-view .back-link').click();
    await page.waitForFunction(() => document.querySelector('#driver-toda-title').textContent === 'BITODA');
    assert.equal(await page.evaluate(() => location.hash), '#todas/bitoda');
    // From Accounts, the back link still returns to Accounts.
    await page.locator('.view-tab[data-view=accounts]').click();
    await page.locator('#account-rows').getByRole('link', { name: 'Dina Pilot' }).click();
    await page.locator('#history-profile').getByText('Dina Pilot').first().waitFor();
    assert.equal(await page.locator('#history-view .back-link').textContent(), '← All accounts');
    assert.equal(await page.locator('.view-tab[aria-current=page]').textContent(), 'Accounts');
    // Fares: each TODA's fares. Changes wait until the admin saves and
    // confirms; then new bookings are charged them.
    const adminSession = await request('/login', { phone: '09179999991', password: 'pilot-test-password' });
    const purok3Key = 'area/bancod-purok-3/special/poblacion/night';
    await page.locator('.view-tab[data-view=fares]').click();
    await page.locator('#toda-list .toda-row').first().waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#fares');
    await page.waitForFunction(() => document.querySelector('#toda-title').textContent === 'ALITODA');
    await page.locator('#toda-list [data-toda=bitoda]').click();
    await page.waitForFunction(() => document.querySelector('#toda-title').textContent === 'BITODA');
    assert.equal(await page.evaluate(() => location.hash), '#fares/bitoda');
    assert.equal(await page.locator('#special-table tbody').count(), 5, "Bancod's five puroks");
    assert.equal(await page.locator('#regular-table').count(), 0, 'regular trips are not offered, so they have no fares');
    await page.locator('#toda-stops').filter({ hasText: 'Also picks up at CvSU (Kaytapos)' }).waitFor();
    const purok3Night = page.locator(`#special-table [data-fare-key="${purok3Key}"]`);
    assert.equal(await purok3Night.inputValue(), '39');
    assert.equal(await purok3Night.getAttribute('aria-label'), 'Bancod · Purok III, from the poblacion, at night');
    assert.equal(await page.locator('#fare-savebar').isVisible(), false);
    await purok3Night.fill('45');
    await page.locator('#fare-savebar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#fares-badge').textContent(), '1');
    assert.equal(await page.locator('[data-toda-changes=bitoda]').textContent(), '1 unsaved');
    await page.locator(`#special-table [data-fare-key="${purok3Key}"]`).locator('xpath=ancestor::*[contains(@class,"fare-cell")]').filter({ hasText: 'Was ₱39' }).waitFor();
    // A fare may have centavos, at most two decimal places; anything else cannot be saved.
    const extra = page.locator('#town-fares [data-fare-key=extraPassenger]');
    for (const typed of ['2O', '20.505']) {
      await extra.fill(typed);
      await page.locator('#fare-problem').filter({ hasText: 'Fares are ₱1 to ₱1,000, with at most 2 decimal places, like ₱12.50.' }).waitFor();
      assert.equal(await page.locator('#fare-save').isDisabled(), true, typed);
    }
    await extra.fill('20.50');
    await page.locator('#fare-change-count').filter({ hasText: '2 unsaved fare changes' }).waitFor();
    assert.equal(await page.locator('#fare-save').isDisabled(), false);
    // Typed fares stay while another TODA is shown; ITODA lists the same Bancod fares.
    await page.locator('#toda-list [data-toda=itoda]').click();
    await page.waitForFunction(() => document.querySelector('#toda-title').textContent === 'ITODA');
    assert.equal(await purok3Night.inputValue(), '45');
    await page.locator('#fare-search').fill('purok iii');
    assert.equal(await page.locator('#special-table tbody').count(), 2, 'Bancod and Kaytambog each have a Purok III');
    await page.locator('#fare-search').fill('');
    await page.screenshot({ path: '/tmp/indang-god-view-fares.png', fullPage: true });
    // Nothing is saved until the admin confirms.
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#fare-save').click();
    assert.equal(await backend.models.FareSheet.countDocuments(), 0);
    page.once('dialog', (dialog) => {
      assert.match(dialog.message(), /^Save 2 fare changes\?/);
      assert.match(dialog.message(), /Bancod · Purok III, from the poblacion, at night: ₱39 → ₱45/);
      assert.match(dialog.message(), /Each passenger past two: ₱15 → ₱20\.50/);
      dialog.accept();
    });
    await page.locator('#fare-save').click();
    await page.locator('#fares-note').filter({ hasText: 'Saved 2 fare changes. New bookings are charged the new fares.' }).waitFor();
    assert.equal(await page.locator('#fare-savebar').isVisible(), false);
    assert.equal(await page.locator('#fares-badge').isVisible(), false);
    await page.locator('#fares-status').filter({ hasText: '2 fares differ from the municipal taripa' }).waitFor();
    await page.locator('#fares-status').filter({ hasText: 'by Admin Pilot' }).waitFor();
    const charged = await request('/config', null, passenger.token);
    assert.equal(charged.fares.prices[purok3Key], 45);
    assert.equal(charged.fares.prices.extraPassenger, 20.5);
    // The saved fare's box shows its centavos.
    assert.equal(await extra.inputValue(), '20.50');
    // Another admin saves the same fare meanwhile: the page says so, keeps what
    // was typed, and saves it only when asked again.
    await purok3Night.fill('50');
    await request('/admin/fares', { changes: [{ key: purok3Key, from: 45, to: 48 }] }, adminSession.token);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#fare-save').click();
    await page.locator('#fares-error').filter({ hasText: 'Another admin changed fares you are editing: Bancod · Purok III, from the poblacion, at night is now ₱48' }).waitFor();
    assert.equal(await purok3Night.inputValue(), '50');
    assert.equal((await request('/admin/fares', null, adminSession.token)).prices[purok3Key], 48, 'not overwritten unseen');
    page.once('dialog', (dialog) => { assert.match(dialog.message(), /₱48 → ₱50/); dialog.accept(); });
    await page.locator('#fare-save').click();
    await page.locator('#fares-note').filter({ hasText: 'Saved 1 fare change.' }).waitFor();
    assert.equal((await request('/admin/fares', null, adminSession.token)).prices[purok3Key], 50);
    // Back to the taripa, for what follows.
    await request('/admin/fares', { changes: [{ key: purok3Key, from: 50, to: 39 }, { key: 'extraPassenger', from: 20.5, to: 15 }] }, adminSession.token);
    await page.locator('#fares-refresh').click();
    await page.locator('#fares-status').filter({ hasText: 'Every fare matches the municipal taripa' }).waitFor();

    await page.locator('.view-tab[data-view=live]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#fit-area').click();
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow on phones');
    assert.equal(await page.locator('#admin-name').isVisible(), true, 'phones show the account name too');
    await page.screenshot({ path: '/tmp/indang-god-view-mobile.png', fullPage: true });
    await page.locator('.view-tab[data-view=accounts]').click();
    await page.locator('#account-rows tr').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'accounts fit phones too');
    await page.screenshot({ path: '/tmp/indang-god-view-accounts-mobile.png', fullPage: true });
    await page.locator('#account-rows tr').first().locator('.cell-phone').click();
    await page.locator('#history-rows tr').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'trip histories fit phones too');
    await page.screenshot({ path: '/tmp/indang-god-view-history-mobile.png', fullPage: true });
    await page.locator('.view-tab[data-view=todas]').click();
    await page.locator('#driver-rows tr').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'TODA drivers fit phones too');
    await page.screenshot({ path: '/tmp/indang-god-view-todas-mobile.png', fullPage: true });
    await page.locator('.view-tab[data-view=fares]').click();
    await page.locator('#special-table tbody').first().waitFor();
    await page.locator('#toda-list [data-toda=bitoda]').click();
    await page.waitForFunction(() => document.querySelector('#toda-title').textContent === 'BITODA');
    await page.locator('#special-table [data-fare-key$="/night"]').first().fill('41');
    await page.locator('#fare-savebar').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'fares fit phones too');
    await page.screenshot({ path: '/tmp/indang-god-view-fares-mobile.png', fullPage: true });
    // Signing out with fares typed but not saved asks first.
    page.once('dialog', (dialog) => { assert.match(dialog.message(), /^Sign out and discard 1 unsaved fare change\?/); dialog.dismiss(); });
    await page.locator('#sign-out').click();
    assert.equal(await page.locator('#dashboard').isVisible(), true);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#sign-out').click();
    await page.locator('#login').waitFor({ state: 'visible' });
    assert.equal(await backend.models.FareSheet.countDocuments({ 'prices.area/bancod-purok-1/special/poblacion/night': { $exists: true } }), 0, 'the unsaved fare was not saved');
    // The next admin to sign in starts with no typed fares.
    assert.equal(await page.locator('#fares-badge').isVisible(), false);
    await page.locator('#phone').fill('09179999991');
    await page.locator('#password').fill('pilot-test-password');
    await page.locator('#sign-in').click();
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    await page.locator('#special-table tbody').first().waitFor();
    assert.equal(await page.locator('#fare-savebar').isVisible(), false);
    assert.equal(await page.locator('#special-table [data-fare-key$="/night"]').first().inputValue(), '35');
    await page.locator('#sign-out').click();
    await page.locator('#login').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#admin-name').textContent(), '', 'signing out clears the name');
    assert.equal(await page.locator('.person-marker').count(), 0);
    assert.equal(await page.locator('.user-row').count(), 0);
    assert.equal(await page.locator('#account-rows tr').count(), 0);
    assert.equal(await page.locator('#driver-rows tr').count(), 0);
    assert.equal(await page.locator('#history-rows tr').count(), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('indanggo.god-view.session')), null);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: separate-origin site, full-size map, places layer, requested/to-passenger/trip lines, merged trip marker, access control, real GPS markers, missing/stale GPS, safe text, role/search filters, all accounts online and offline, trip histories and their periods, driver trip records as a PDF, cancelling a trip, driver approval, TODA drivers and their ratings, changing TODA fares, disconnect/reconnect, responsive layout and logout.');
  } finally {
    await browser?.close(); sockets.forEach(socket => socket.disconnect());
    site?.close(); if (siteDir) fs.rmSync(siteDir, { recursive: true, force: true });
    await backend.dispatch.run(async () => {});
    assert.equal(backend.models.User.db.name, dbName);
    await backend.models.User.db.dropDatabase(); await backend.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
