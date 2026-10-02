import { API_BASE_URL } from './config.mjs';
import { filterUsers, isLive, locationLabel, routeSummary, statusLabel, snapshotTiming } from './model.mjs';

const $ = id => document.getElementById(id);
const tokenKey = 'indanggo.god-view.session';
let token = '', generation = 0, snapshot = null, selected = null, role = 'all';
let connected = false, timer, pending = false, controller, fleetMap = null, mapStarting = false, serverOffset = 0;
const now = () => Date.now() + serverOffset;
const visibleUsers = () => filterUsers(snapshot?.users || [], role, $('search').value);
const routeFor = (user) => user && (snapshot?.routes || []).find(route => route.driverId === user.id || route.passengerId === user.id);
// A matched ride's path shows while its driver or passenger is listed.
const visibleRoutes = (users) => { const ids = new Set(users.map(user => user.id)); return (snapshot?.routes || []).filter(route => ids.has(route.driverId) || ids.has(route.passengerId)); };
const text = (tag, value, className = '') => { const node = document.createElement(tag); node.textContent = value; node.className = className; return node; };
function storeToken(value) { token = value; try { value ? sessionStorage.setItem(tokenKey, value) : sessionStorage.removeItem(tokenKey); } catch {} }
function showError(id, message) { $(id).textContent = message; $(id).hidden = !message; }

async function request(path, { auth = token, body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(70000)]) : AbortSignal.timeout(70000) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the server. Check your connection and try again; a sleeping server can take a minute to wake.');
  }
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request failed.'), { status: response.status });
  return data;
}

function endSession(message = '') {
  generation += 1; clearTimeout(timer); controller?.abort(); pending = false;
  storeToken(''); snapshot = null; selected = null; connected = false;
  fleetMap?.remove(); fleetMap = null; mapStarting = false;
  $('user-list').replaceChildren(); $('person-details').replaceChildren(); $('person-details').hidden = true;
  $('dashboard').hidden = true; $('login').hidden = false;
  $('password').value = ''; showError('login-error', message);
}

async function startMap() {
  if (fleetMap || mapStarting || !snapshot) return;
  const run = generation;
  mapStarting = true;
  try {
    const [mapModule, data] = await Promise.all([import('./map.mjs'), request('/admin/map')]);
    if (run !== generation) return;
    fleetMap = mapModule.createFleetMap($('map'), snapshot.serviceArea, data.boundary, selectUser, message => showError('map-error', message));
    render();
  } catch (error) {
    if (run === generation) showError('map-error', error.status === 401 || error.status === 403 ? 'Map access expired. Refresh to sign in again.' : 'Map unavailable. You can still use the people list; use Refresh now to retry.');
  } finally { if (run === generation) mapStarting = false; }
}

function applySnapshot(data, requestStarted) {
  snapshot = data;
  ({ connected, serverOffset } = snapshotTiming(data.serverTime, requestStarted, Date.now()));
  if (selected && !data.users.some(user => user.id === selected)) selected = null;
  $('area-name').textContent = data.serviceArea.name;
  $('last-updated').textContent = `Updated ${new Date(data.serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  showError('connection-error', connected ? '' : 'Updates are delayed. Displayed positions are last known while we reconnect.'); render(); startMap();
}

async function refresh() {
  if (!token || pending || document.hidden) return;
  clearTimeout(timer); pending = true;
  const run = generation;
  controller = new AbortController();
  const requestStarted = Date.now();
  try {
    const data = await request('/admin/overview', { signal: controller.signal });
    if (run === generation) applySnapshot(data, requestStarted);
  } catch (error) {
    if (run !== generation) return;
    if (error.status === 401 || error.status === 403) { endSession(error.message); return; }
    connected = false; showError('connection-error', `${error.message} Displayed positions are last known.`); render();
  } finally {
    if (run === generation) { pending = false; if (!document.hidden) timer = setTimeout(refresh, 3000); }
  }
}

function selectUser(id) {
  selected = id; render();
  const user = snapshot?.users.find(item => item.id === id);
  fleetMap?.focus(user, routeFor(user));
}

function renderDetails() {
  const panel = $('person-details'), user = visibleUsers().find(item => item.id === selected);
  panel.replaceChildren(); panel.hidden = !user;
  if (!user) return;
  const close = text('button', '×', 'detail-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close user details');
  close.addEventListener('click', () => { selected = null; render(); });
  panel.append(close, text('span', user.role === 'driver' ? 'DRIVER' : 'PASSENGER', `eyebrow ${user.role}-text`), text('h2', user.name));
  panel.append(text('p', statusLabel(user), 'detail-status'));
  if (user.plate || user.toda) panel.append(text('p', [user.plate, user.toda].filter(Boolean).join(' · '), 'muted small'));
  panel.append(text('p', locationLabel(user, now(), connected), 'detail-gps'));
  if (user.location) {
    panel.append(text('p', `${user.location.latitude.toFixed(5)}, ${user.location.longitude.toFixed(5)} · ±${Math.round(user.location.accuracy)} m`, 'small muted'));
    panel.append(text('p', `Measured ${new Date(user.location.timestamp).toLocaleString()}`, 'small muted'));
    if (!user.inServiceArea) panel.append(text('p', `Outside ${snapshot.serviceArea.name}`, 'outside-label'));
  }
  if (user.ride) panel.append(text('p', `${user.ride.pickup} → ${user.ride.destination}`, 'trip-summary'));
  const route = routeFor(user);
  if (route) for (const line of routeSummary(route)) panel.append(text('p', line, 'route-summary'));
}

function render() {
  const users = visibleUsers(), summary = snapshot?.summary;
  for (const [key, field] of [['online', 'online'], ['drivers', 'drivers'], ['passengers', 'passengers'], ['rides', 'activeRides']]) $('count-' + key).textContent = connected && summary ? summary[field] : '—';
  $('available-note').textContent = connected && summary ? `${summary.availableDrivers} ready for requests` : 'Waiting for an update';
  $('connection-status').textContent = connected ? 'Live updates' : 'Updates paused';
  $('connection-status').className = `connection ${connected ? 'live' : 'paused'}`;
  $('result-count').textContent = users.length;
  $('list-footnote').textContent = connected ? `${users.filter(user => isLive(user, now(), connected)).length} live locations · updates every 3s` : 'Last snapshot · reconnecting';
  $('fit-users').disabled = !users.some(user => user.location);
  const focused = document.activeElement?.dataset.userId;
  const list = $('user-list'), nodes = users.map(user => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `user-row${selected === user.id ? ' selected' : ''}`;
    button.dataset.userId = user.id; button.setAttribute('aria-pressed', String(selected === user.id));
    const avatar = text('span', user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(), `avatar ${user.role}`);
    const copy = document.createElement('span'); copy.className = 'user-copy';
    copy.append(text('strong', user.name), text('span', `${user.role === 'driver' ? 'Driver' : 'Passenger'} · ${statusLabel(user)}`, 'user-subtitle'), text('span', locationLabel(user, now(), connected), `user-gps${isLive(user, now(), connected) ? ' live-text' : ''}`));
    button.append(avatar, copy, text('span', '›', 'row-arrow'));
    button.addEventListener('click', () => selectUser(user.id)); return button;
  });
  list.replaceChildren(...nodes);
  if (focused) nodes.find(node => node.dataset.userId === focused)?.focus({ preventScroll: true });
  $('empty').hidden = users.length > 0;
  $('empty').querySelector('h3').textContent = snapshot?.users.length ? 'No matching people' : 'No one online yet';
  $('empty').querySelector('p').textContent = snapshot?.users.length ? 'Try another name or account type.' : 'Connected drivers and passengers will appear here when they open the app.';
  fleetMap?.update(users, selected, now(), connected, visibleRoutes(users)); renderDetails();
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const run = ++generation;
  $('sign-in').disabled = true; $('login-progress').hidden = false; showError('login-error', '');
  let candidate;
  try {
    candidate = await request('/login', { auth: '', body: { phone: $('phone').value, password: $('password').value } });
    const requestStarted = Date.now();
    const data = await request('/admin/overview', { auth: candidate.token });
    if (run !== generation) return;
    storeToken(candidate.token); $('password').value = '';
    $('admin-name').textContent = candidate.user.firstName || 'Pilot admin';
    $('login').hidden = true; $('dashboard').hidden = false;
    applySnapshot(data, requestStarted); timer = setTimeout(refresh, 3000);
  } catch (error) {
    if (candidate?.token) request('/logout', { auth: candidate.token, body: {} }).catch(() => {});
    if (run === generation) showError('login-error', error.message);
  } finally { $('sign-in').disabled = false; $('login-progress').hidden = true; }
});

$('sign-out').addEventListener('click', async () => {
  const previous = token; endSession();
  try { await request('/logout', { auth: previous, body: {} }); }
  catch { showError('login-error', 'Signed out of this browser. The server could not confirm session revocation.'); }
});
$('search').addEventListener('input', render);
$('role-filters').addEventListener('click', event => {
  const button = event.target.closest('button[data-role]'); if (!button) return;
  role = button.dataset.role;
  for (const item of $('role-filters').querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
  render();
});
$('refresh').addEventListener('click', refresh);
$('fit-area').addEventListener('click', () => fleetMap?.fitArea());
$('fit-users').addEventListener('click', () => fleetMap?.fitUsers(visibleUsers()));
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) refresh(); });
// Age GPS on screen even if the next network request is slow.
setInterval(() => { if (snapshot && !document.hidden) {
  if (now() - snapshot.serverTime > 10000) { connected = false; showError('connection-error', 'Updates are delayed. Displayed positions are last known while we reconnect.'); }
  render();
} }, 1000);
try { token = sessionStorage.getItem(tokenKey) || ''; } catch {}
if (token) { $('login').hidden = true; $('dashboard').hidden = false; refresh(); }
