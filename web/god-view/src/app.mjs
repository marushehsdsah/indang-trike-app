import { API_BASE_URL } from './config.mjs';
import { accountCounts, accountRole, cancellationLabel, filterAccounts, filterTrips, filterUsers, formatDistance, formatFare, formatPhone, isLive, isOnline, locationLabel, mapPeople, ratingLabel, roleCountLabel, routeSummary, languageWarningLabel, safetyReportLabel, sortAccounts, statusLabel, snapshotTiming, tripOf } from './model.mjs';

const $ = id => document.getElementById(id);
const tokenKey = 'indanggo.god-view.session';
let token = '', generation = 0, snapshot = null, selected = null, role = 'all', view = 'live';
let connected = false, timer, pending = false, controller, fleetMap = null, mapStarting = false, serverOffset = 0;
// The Accounts view: every passenger and driver account, online or offline.
let accounts = null, accountsTotal = 0, accountsUpdated = 0, accountsTimer, accountsPending = false;
const accountFilters = { type: 'all', status: 'all' };
// One account's trip history (#accounts/<id>).
let historyId = null, history = null, historyUpdated = 0, historyTimer, historyPending = false, historyFilter = 'all', listScroll = 0;
// The Reports view (#reports): drivers' reports about passengers.
let reports = null, reportsUpdated = 0, reportsTimer, reportsPending = false, reportFilter = 'pending', reviewing = null;
const now = () => Date.now() + serverOffset;
const visibleUsers = () => filterUsers(snapshot?.users || [], role, $('search').value);
const routeFor = (user) => user && (snapshot?.routes || []).find(route => route.driverId === user.id || route.passengerId === user.id);
// A matched ride's path shows while its driver or passenger is listed.
const visibleRoutes = (users) => { const ids = new Set(users.map(user => user.id)); return (snapshot?.routes || []).filter(route => ids.has(route.driverId) || ids.has(route.passengerId)); };
const text = (tag, value, className = '') => { const node = document.createElement(tag); node.textContent = value; node.className = className; return node; };
const initials = name => name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
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
  // An older API answers a route it lacks with an HTML page.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request failed.'), { status: response.status, missingRoute: response.status === 404 && !data.error });
  return data;
}

function endSession(message = '') {
  generation += 1; clearTimeout(timer); controller?.abort(); pending = false;
  storeToken(''); snapshot = null; selected = null; connected = false;
  fleetMap?.remove(); fleetMap = null; mapStarting = false;
  clearTimeout(accountsTimer); accountsPending = false; accounts = null; accountsUpdated = 0; showError('accounts-error', ''); renderAccounts();
  clearTimeout(historyTimer); historyPending = false; history = null; historyUpdated = 0; showError('history-error', ''); renderHistory();
  clearTimeout(reportsTimer); reportsPending = false; reports = null; reportsUpdated = 0; showError('reports-error', ''); renderReports();
  $('user-list').replaceChildren(); $('person-details').replaceChildren(); $('person-details').hidden = true;
  $('dashboard').hidden = true; $('login').hidden = false;
  $('password').value = ''; showError('login-error', message);
}

async function startMap() {
  if (fleetMap || mapStarting || !snapshot || view !== 'live') return;
  const run = generation;
  mapStarting = true;
  try {
    const [mapModule, data] = await Promise.all([import('./map.mjs'), request('/admin/map')]);
    if (run !== generation) return;
    fleetMap = mapModule.createFleetMap($('map'), snapshot.serviceArea, data.boundary, data.places, selectUser, message => showError('map-error', message));
    // Someone picked with Show on map before the map was up.
    if (selected) selectUser(selected); else render();
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

// The driver and passenger on a trip together, when the selection is one of them.
function selectedTrip() {
  const route = selected && tripOf(selected, snapshot?.routes || []);
  const people = route && [route.driverId, route.passengerId].map(id => snapshot.users.find(user => user.id === id));
  return route && people.every(Boolean) ? { route, driver: people[0], passenger: people[1] } : null;
}

function renderTripDetails(panel, { route, driver, passenger }) {
  panel.append(text('span', 'ON A TRIP', 'eyebrow trip-text'), text('h2', `${driver.name} & ${passenger.name}`));
  panel.append(text('p', 'Driver and passenger are travelling together.', 'detail-status'));
  for (const [label, person, className] of [['DRIVER', driver, 'driver-text'], ['PASSENGER', passenger, 'passenger-text']]) {
    const member = document.createElement('div'); member.className = 'detail-member';
    member.append(text('span', label, `eyebrow ${className}`), text('strong', person.name));
    if (person.plate || person.toda) member.append(text('p', [person.plate, person.toda].filter(Boolean).join(' · '), 'muted small'));
    member.append(text('p', ratingLabel(person), 'muted small'));
    if (safetyReportLabel(person)) member.append(text('p', safetyReportLabel(person), 'outside-label'));
    if (languageWarningLabel(person)) member.append(text('p', languageWarningLabel(person), 'outside-label'));
    member.append(text('p', locationLabel(person, now(), connected), 'detail-gps'));
    panel.append(member);
  }
  if (driver.ride) panel.append(text('p', `${driver.ride.pickup} → ${driver.ride.destination}`, 'trip-summary'));
  for (const line of routeSummary(route)) panel.append(text('p', line, 'route-summary'));
}

function renderDetails() {
  const panel = $('person-details'), trip = selectedTrip(), user = trip ? null : visibleUsers().find(item => item.id === selected);
  panel.replaceChildren(); panel.hidden = !user && !trip;
  if (!user && !trip) return;
  const close = text('button', '×', 'detail-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close user details');
  close.addEventListener('click', () => { selected = null; render(); });
  if (trip) { panel.append(close); renderTripDetails(panel, trip); return; }
  panel.append(close, text('span', user.role === 'driver' ? 'DRIVER' : 'PASSENGER', `eyebrow ${user.role}-text`), text('h2', user.name));
  panel.append(text('p', statusLabel(user), 'detail-status'));
  if (user.plate || user.toda) panel.append(text('p', [user.plate, user.toda].filter(Boolean).join(' · '), 'muted small'));
  panel.append(text('p', ratingLabel(user), 'muted small'));
  if (safetyReportLabel(user)) panel.append(text('p', safetyReportLabel(user), 'outside-label'));
  if (languageWarningLabel(user)) panel.append(text('p', languageWarningLabel(user), 'outside-label'));
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
  // Selecting either person on a trip highlights both.
  const trip = selected && tripOf(selected, snapshot?.routes || []);
  const highlighted = new Set(trip ? [trip.driverId, trip.passengerId] : [selected]);
  const list = $('user-list'), nodes = users.map(user => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `user-row${highlighted.has(user.id) ? ' selected' : ''}`;
    button.dataset.userId = user.id; button.setAttribute('aria-pressed', String(highlighted.has(user.id)));
    const avatar = text('span', initials(user.name), `avatar ${user.role}`);
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
  const routes = visibleRoutes(users);
  fleetMap?.update(mapPeople(users, routes), selected, now(), connected, routes); renderDetails();
}

// Live map, Accounts (#accounts) or one account's trip history
// (#accounts/<id>), from the address, so a reload or the back button keeps
// the view.
function showView() {
  const previous = view, account = location.hash.match(/^#accounts\/([a-f\d]{24})$/i)?.[1] ?? null;
  view = account ? 'history' : location.hash === '#accounts' ? 'accounts' : location.hash === '#reports' ? 'reports' : 'live';
  if (previous === 'accounts' && view === 'history') listScroll = scrollY;
  const changed = account !== historyId;
  if (changed) { historyId = account; history = null; historyUpdated = 0; showError('history-error', ''); }
  $('live-view').hidden = view !== 'live'; $('accounts-view').hidden = view !== 'accounts'; $('history-view').hidden = view !== 'history'; $('reports-view').hidden = view !== 'reports';
  for (const tab of document.querySelectorAll('.view-tab')) {
    if (tab.dataset.view === (view === 'history' ? 'accounts' : view)) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  if (view === 'live') startMap();
  else if (view === 'reports') { renderReports(); loadReports(); }
  else if (view === 'accounts') {
    renderAccounts(); loadAccounts();
    // Back from a trip history to where the list was.
    if (previous === 'history') scrollTo(0, listScroll);
  } else {
    if (changed) scrollTo(0, 0);
    renderHistory(); loadHistory();
  }
}

function showOnMap(id) {
  location.hash = 'live'; showView(); selectUser(id);
}

async function loadAccounts() {
  if (!token || view !== 'accounts' || accountsPending || document.hidden) return;
  clearTimeout(accountsTimer); accountsPending = true;
  const run = generation;
  try {
    const data = await request('/admin/accounts');
    if (run !== generation) return;
    accounts = sortAccounts(data.accounts); accountsTotal = data.total ?? data.accounts.length; accountsUpdated = Date.now();
    showError('accounts-error', '');
  } catch (error) {
    if (run !== generation) return;
    if (error.status === 401 || error.status === 403) { endSession(error.message); return; }
    showError('accounts-error', error.status === 404 ? 'This server cannot list accounts yet. Deploy the latest API, then refresh.' : `${error.message}${accounts ? ' Showing the last list loaded.' : ''}`);
  } finally {
    if (run === generation) {
      accountsPending = false; renderAccounts();
      if (view === 'accounts' && !document.hidden) accountsTimer = setTimeout(loadAccounts, 10000);
    }
  }
}

function accountRow(account) {
  const row = document.createElement('tr'), kind = accountRole(account), online = isOnline(account);
  const cell = (className, ...children) => { const node = document.createElement('td'); node.className = className; node.append(...children); return node; };
  // The name opens the account's trip history, as does a click anywhere else on the row.
  const link = text('a', account.name, 'account-link'); link.href = `#accounts/${account.key}`;
  const name = document.createElement('strong'); name.append(link);
  const who = document.createElement('div'); who.className = 'account-who';
  const copy = document.createElement('span'); copy.className = 'user-copy';
  copy.append(name, text('span', account.email || 'No email', 'user-subtitle'));
  who.append(text('span', initials(account.name), `avatar ${kind}`), copy);
  row.className = 'account-row';
  row.addEventListener('click', event => { if (!event.target.closest('a, button')) link.click(); });
  const vehicle = kind === 'driver' ? [text('span', account.plate || 'No plate', 'cell-main'), text('span', account.toda || 'No TODA', 'cell-note')] : [text('span', '—', 'cell-note')];
  const status = [text('span', online ? 'Online' : 'Offline', `status-pill ${online ? 'online' : 'offline'}`)];
  if (account.status === 'Available') status.push(text('span', 'Ready for requests', 'cell-note'));
  const action = [];
  if (online) {
    const button = text('button', 'Show on map', 'quiet'); button.type = 'button'; button.dataset.accountKey = account.key;
    button.addEventListener('click', () => showOnMap(account.key)); action.push(button);
  }
  row.append(cell('cell-who', who), cell('cell-type', text('span', kind === 'driver' ? 'Driver' : 'Passenger', `role-tag ${kind}`)),
    cell('cell-phone', formatPhone(account.id)), cell(`cell-vehicle${kind === 'driver' ? '' : ' is-empty'}`, ...vehicle), cell('cell-status', ...status), cell('cell-action', ...action));
  return row;
}

function renderAccounts() {
  const list = accounts || [], counts = accountCounts(list);
  const shown = filterAccounts(list, accountFilters.type, accountFilters.status, $('account-search').value);
  for (const group of ['all', 'online', 'offline']) {
    $(`account-count-${group}`).textContent = accounts ? (group === 'all' ? accountsTotal : counts[group].total) : '—';
    $(`account-note-${group}`).textContent = accounts ? roleCountLabel(counts[group]) : 'Loading…';
  }
  $('accounts-updated').textContent = accountsUpdated ? `Updated ${new Date(accountsUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Loading accounts…';
  $('account-result-count').textContent = `${shown.length} shown`;
  const focused = document.activeElement?.dataset.accountKey, rows = shown.map(accountRow);
  $('account-rows').replaceChildren(...rows);
  if (focused) $('account-rows').querySelector(`[data-account-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  $('accounts-table').hidden = !shown.length;
  const failed = !accounts && !$('accounts-error').hidden, empty = $('accounts-empty');
  empty.hidden = shown.length > 0;
  empty.querySelector('h3').textContent = failed ? 'Accounts unavailable' : !accounts ? 'Loading accounts' : list.length ? 'No matching accounts' : 'No accounts yet';
  empty.querySelector('p').textContent = failed ? 'Use Refresh now to try again.' : !accounts ? 'Getting every driver and passenger account.' : list.length ? 'Try another name, number, type or status.' : 'Drivers and passengers appear here once they sign up in the app.';
  $('accounts-footnote').textContent = accounts && accountsTotal > list.length
    ? `Showing the newest ${list.length} of ${accountsTotal} accounts; the online and offline counts cover those shown.`
    : 'Online means the app is open and connected. Refreshes every 10 seconds.';
}

async function loadHistory() {
  if (!token || view !== 'history' || historyPending || document.hidden) return;
  clearTimeout(historyTimer); historyPending = true;
  const run = generation, id = historyId;
  try {
    const data = await request(`/admin/accounts/${id}`);
    if (run !== generation || id !== historyId) return;
    history = data; historyUpdated = Date.now(); showError('history-error', '');
  } catch (error) {
    if (run !== generation || id !== historyId) return;
    if (error.status === 401 || error.status === 403) { endSession(error.message); return; }
    showError('history-error', error.missingRoute ? 'This server cannot show trip histories yet. Deploy the latest API, then refresh.' : `${error.message}${history ? ' Showing the trips last loaded.' : ''}`);
  } finally {
    if (run === generation) {
      historyPending = false; renderHistory();
      // Another account may have been opened while this one loaded.
      if (view === 'history' && !document.hidden) historyTimer = setTimeout(loadHistory, id === historyId ? 10000 : 0);
    }
  }
}

const shortDate = date => date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

function renderProfile(account) {
  const profile = $('history-profile'), failed = !account && !$('history-error').hidden;
  if (!account) { profile.replaceChildren(text('h1', failed ? 'Account unavailable' : 'Loading account…')); return; }
  const kind = accountRole(account), online = isOnline(account);
  const heading = document.createElement('h1');
  heading.append(text('span', account.name, 'profile-name'), text('span', online ? 'Online' : 'Offline', `status-pill ${online ? 'online' : 'offline'}`));
  const copy = document.createElement('div'); copy.className = 'profile-copy';
  const details = [formatPhone(account.id), account.email, kind === 'driver' ? [account.plate, account.toda].filter(Boolean).join(' · ') : '',
    account.joined ? `Joined ${shortDate(new Date(account.joined))}` : '', ratingLabel(account)];
  copy.append(text('span', `${kind === 'driver' ? 'DRIVER' : 'PASSENGER'} ACCOUNT`, `eyebrow ${kind}-text`), heading, text('p', details.filter(Boolean).join(' · '), 'muted'));
  if (online) {
    const button = text('button', 'Show on map', 'quiet'); button.type = 'button';
    button.addEventListener('click', () => showOnMap(account.key)); copy.append(button);
  }
  profile.replaceChildren(text('span', initials(account.name), `avatar large ${kind}`), copy);
}

function tripRow(trip) {
  const row = document.createElement('tr'), date = new Date(trip.date);
  const cell = (className, ...children) => { const node = document.createElement('td'); node.className = className; node.append(...children); return node; };
  const route = [Number.isFinite(trip.distanceMeters) ? formatDistance(trip.distanceMeters) : '', trip.passengers ? `${trip.passengers} passenger${trip.passengers === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const statusNote = { Ongoing: () => statusLabel({ status: trip.stage }), Cancelled: () => cancellationLabel(trip), 'No driver': () => 'No driver accepted' }[trip.status]?.() || '';
  const status = [text('span', trip.status, `status-pill ${trip.status.toLowerCase().replace(' ', '-')}`)];
  if (statusNote) status.push(text('span', statusNote, 'cell-note'));
  const rating = [];
  if (trip.rating) {
    rating.push(text('span', `★ ${trip.rating.stars}`, 'cell-main stars'));
    const said = [trip.rating.tags.join(', '), trip.rating.comment && `“${trip.rating.comment}”`].filter(Boolean).join(' · ');
    if (said) rating.push(text('span', said, 'cell-note'));
    if (trip.rating.flagged) rating.push(text('span', 'Safety report', 'cell-flag'));
  } else rating.push(text('span', trip.status === 'Completed' ? 'Not rated' : '—', 'cell-note'));
  row.append(cell('cell-date', text('span', shortDate(date), 'cell-main'), text('span', date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'cell-note')),
    cell('cell-trip', text('span', trip.id, 'trip-id')),
    cell('cell-route', text('span', `${trip.pickup} → ${trip.destination}`, 'cell-main'), ...(route ? [text('span', route, 'cell-note')] : [])),
    cell('cell-with', text('span', trip.with || 'No driver', trip.with ? 'cell-main' : 'cell-note')),
    cell('cell-fare', text('span', formatFare(trip.fare), trip.status === 'Completed' ? 'cell-main' : 'cell-note')),
    cell('cell-status', ...status), cell('cell-rating', ...rating));
  return row;
}

function renderHistory() {
  const account = history?.account, summary = history?.summary, driver = Boolean(account) && accountRole(account) === 'driver';
  renderProfile(account);
  const counts = { total: summary?.trips, completed: summary?.completed, cancelled: summary && summary.cancelled + summary.noDriver };
  for (const [key, value] of Object.entries(counts)) $(`history-count-${key}`).textContent = summary ? value : '—';
  $('history-note-total').textContent = !summary ? 'Loading…' : summary.ongoing ? `${summary.ongoing} ongoing now` : driver ? 'Accepted as the driver' : 'Booked as the passenger';
  $('history-note-cancelled').textContent = !summary ? 'Loading…' : summary.noDriver ? `${summary.noDriver} found no driver` : 'By the passenger or driver';
  $('history-fares-label').textContent = driver ? 'Fares earned' : 'Fares paid';
  $('history-fares').textContent = summary ? formatFare(summary.fares) : '—';
  $('history-with-heading').textContent = driver ? 'Passenger' : 'Driver';
  $('history-rating-heading').textContent = driver ? 'Passenger’s rating' : 'Driver’s rating';
  $('history-updated').textContent = historyUpdated ? `Updated ${new Date(historyUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Loading trips…';
  const trips = history?.trips || [], shown = filterTrips(trips, historyFilter);
  $('history-result-count').textContent = `${shown.length} shown`;
  $('history-rows').replaceChildren(...shown.map(tripRow));
  $('history-table').hidden = !shown.length;
  const failed = !history && !$('history-error').hidden, empty = $('history-empty');
  empty.hidden = shown.length > 0;
  empty.querySelector('h3').textContent = failed ? 'Trip history unavailable' : !history ? 'Loading trips' : trips.length ? `No ${historyFilter} trips` : 'No trips yet';
  empty.querySelector('p').textContent = failed ? 'Use Refresh now to try again.' : !history ? 'Getting every trip this account booked or drove.' : trips.length ? 'Try another status.'
    : driver ? 'Trips appear here once this driver accepts a request.' : 'Trips appear here once this passenger books a ride.';
  $('history-footnote').textContent = summary && summary.trips > trips.length
    ? `Showing the newest ${trips.length} of ${summary.trips} trips; the totals above cover them all.`
    : 'Times are when each trip was booked. Refreshes every 10 seconds.';
}

// Reports load every 10 seconds on the Reports view, and every 30 elsewhere
// for the tab's count of reports waiting for review.
async function loadReports() {
  if (!token || reportsPending || document.hidden) return;
  clearTimeout(reportsTimer); reportsPending = true;
  const run = generation;
  try {
    const data = await request('/admin/reports');
    if (run !== generation) return;
    reports = data.reports; reportsUpdated = Date.now(); showError('reports-error', '');
  } catch (error) {
    if (run !== generation) return;
    if (error.status === 401 || error.status === 403) { endSession(error.message); return; }
    showError('reports-error', error.missingRoute ? 'This server cannot show reports yet. Deploy the latest API, then refresh.' : `${error.message}${reports ? ' Showing the reports last loaded.' : ''}`);
  } finally {
    if (run === generation) {
      reportsPending = false; renderReports();
      if (!document.hidden) reportsTimer = setTimeout(loadReports, view === 'reports' ? 10000 : 30000);
    }
  }
}

const dateTime = date => `${shortDate(date)}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

// Where a passenger stands: suspended until when, disabled, or how many offenses so far.
function standing(passenger) {
  if (passenger.disabled) return { label: 'Disabled', className: 'disabled' };
  if (passenger.suspendedUntil) return { label: `Suspended until ${dateTime(new Date(passenger.suspendedUntil))}`, className: 'suspended' };
  return { label: passenger.offenses ? `${passenger.offenses} upheld report${passenger.offenses === 1 ? '' : 's'}` : 'No upheld reports', className: 'clear' };
}

async function review(report, decision) {
  if (reviewing) return;
  const passenger = report.passenger;
  const question = decision === 'uphold'
    ? passenger.nextPenalty === 'Permanently disabled'
      ? `Uphold this report and permanently disable ${passenger.name}'s account?\n\nThis is their third offense: the account is disabled for good and its mobile number and email can never sign up again.`
      : `Uphold this report and give ${passenger.name} a ${passenger.nextPenalty.toLowerCase()}?\n\nThey are signed out at once and any booking they have is cancelled.`
    : `Dismiss this report? ${passenger.name} gets no penalty for it.`;
  if (!confirm(question)) return;
  reviewing = report.key; renderReports();
  try {
    const { report: updated } = await request(`/admin/reports/${report.key}/${decision}`, { body: {} });
    // The passenger's standing changed on their other reports too.
    reports = reports.map(item => item.key === updated.key ? updated : item.passenger?.key === updated.passenger?.key ? { ...item, passenger: updated.passenger } : item);
    showError('reports-error', '');
  } catch (error) {
    if (error.status === 401 || error.status === 403) { endSession(error.message); return; }
    showError('reports-error', error.message);
  } finally { reviewing = null; renderReports(); loadReports(); }
}

function reportRow(report) {
  const row = document.createElement('tr'), date = new Date(report.date), passenger = report.passenger, driver = report.driver, trip = report.trip;
  const cell = (className, ...children) => { const node = document.createElement('td'); node.className = className; node.append(...children); return node; };
  const who = document.createElement('div'); who.className = 'account-who';
  const copy = document.createElement('span'); copy.className = 'user-copy';
  if (passenger) {
    const link = text('a', passenger.name, 'account-link'); link.href = `#accounts/${passenger.key}`;
    const name = document.createElement('strong'); name.append(link);
    const state = standing(passenger);
    copy.append(name, text('span', [formatPhone(passenger.phone), passenger.email].filter(Boolean).join(' · '), 'user-subtitle'), text('span', state.label, `standing ${state.className}`));
    who.append(text('span', initials(passenger.name), 'avatar passenger'), copy);
  } else who.append(text('span', 'Deleted account', 'cell-note'));
  const what = [text('span', report.reasonLabel, `cell-main reason ${report.reason}`)];
  if (report.details) what.push(text('span', `“${report.details}”`, 'cell-quote'));
  if (driver) what.push(text('span', `By ${driver.name}${driver.plate ? ` · ${driver.plate}` : ''}${driver.toda ? ` · ${driver.toda}` : ''}`, 'cell-note'));
  const tripCells = trip ? [text('span', trip.id, 'trip-id'), text('span', trip.route, 'cell-note'),
    text('span', trip.status === 'Cancelled' && trip.cancelledBy ? `Cancelled by the ${trip.cancelledBy}` : trip.status, 'cell-note')] : [text('span', '—', 'cell-note')];
  const decision = [];
  if (report.status === 'pending' && passenger) {
    const actions = document.createElement('div'); actions.className = 'report-actions';
    const uphold = text('button', `Uphold · ${passenger.nextPenalty === 'Permanently disabled' ? 'disable' : passenger.nextPenalty.replace(' suspension', '')}`, `report-button ${passenger.nextPenalty === 'Permanently disabled' ? 'severe' : 'uphold'}`);
    const dismiss = text('button', 'Dismiss', 'report-button dismiss');
    for (const [button, decisionName] of [[uphold, 'uphold'], [dismiss, 'dismiss']]) {
      button.type = 'button'; button.disabled = Boolean(reviewing);
      button.addEventListener('click', () => review(report, decisionName)); actions.append(button);
    }
    decision.push(actions, text('span', reviewing === report.key ? 'Saving…' : `Next penalty: ${passenger.nextPenalty}`, 'cell-note'));
  } else {
    decision.push(text('span', report.status === 'pending' ? 'Waiting' : report.status === 'upheld' ? 'Upheld' : 'Dismissed', `status-pill ${report.status}`));
    if (report.penalty) decision.push(text('span', report.penalty.permanent ? 'Disabled · number and email blocked' : `${report.penalty.label} · until ${dateTime(new Date(report.penalty.until))}`, 'cell-flag'));
    if (report.reviewedAt) decision.push(text('span', `Reviewed ${dateTime(new Date(report.reviewedAt))}`, 'cell-note'));
  }
  row.append(cell('cell-date', text('span', shortDate(date), 'cell-main'), text('span', date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'cell-note')),
    cell('cell-who', who), cell('cell-what', ...what), cell('cell-trip', ...tripCells), cell('cell-decision', ...decision));
  return row;
}

function renderReports() {
  const list = reports || [], pending = list.filter(item => item.status === 'pending');
  const passengers = new Map(list.filter(item => item.passenger).map(item => [item.passenger.key, item.passenger]));
  $('report-count-pending').textContent = reports ? pending.length : '—';
  $('report-note-pending').textContent = !reports ? 'Loading…' : pending.length ? `About ${new Set(pending.map(item => item.passenger?.key)).size} passenger${new Set(pending.map(item => item.passenger?.key)).size === 1 ? '' : 's'}` : 'All caught up';
  $('report-count-suspended').textContent = reports ? [...passengers.values()].filter(item => item.suspendedUntil && !item.disabled).length : '—';
  $('report-count-disabled').textContent = reports ? [...passengers.values()].filter(item => item.disabled).length : '—';
  $('reports-badge').textContent = pending.length; $('reports-badge').hidden = !pending.length;
  $('reports-updated').textContent = reportsUpdated ? `Updated ${new Date(reportsUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Loading reports…';
  const shown = list.filter(item => reportFilter === 'all' || item.status === reportFilter);
  $('report-result-count').textContent = `${shown.length} shown`;
  $('report-rows').replaceChildren(...shown.map(reportRow));
  $('reports-table').hidden = !shown.length;
  const failed = !reports && !$('reports-error').hidden, empty = $('reports-empty');
  empty.hidden = shown.length > 0;
  empty.querySelector('h3').textContent = failed ? 'Reports unavailable' : !reports ? 'Loading reports' : reportFilter === 'pending' ? 'No reports waiting' : list.length ? 'No reports here' : 'No reports yet';
  empty.querySelector('p').textContent = failed ? 'Use Refresh now to try again.' : !reports ? "Getting drivers' reports about passengers." : reportFilter === 'pending' ? 'New reports from drivers appear here for review.' : 'Try another filter.';
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
    applySnapshot(data, requestStarted); timer = setTimeout(refresh, 3000); showView(); loadReports();
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
window.addEventListener('hashchange', showView);
$('account-search').addEventListener('input', renderAccounts);
for (const [group, key] of [['account-types', 'type'], ['account-statuses', 'status']]) $(group).addEventListener('click', event => {
  const button = event.target.closest(`button[data-${key}]`); if (!button) return;
  accountFilters[key] = button.dataset[key];
  for (const item of $(group).querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
  renderAccounts();
});
$('accounts-refresh').addEventListener('click', loadAccounts);
$('history-statuses').addEventListener('click', event => {
  const button = event.target.closest('button[data-trip]'); if (!button) return;
  historyFilter = button.dataset.trip;
  for (const item of $('history-statuses').querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
  renderHistory();
});
$('history-refresh').addEventListener('click', loadHistory);
$('reports-refresh').addEventListener('click', loadReports);
$('report-statuses').addEventListener('click', event => {
  const button = event.target.closest('button[data-report]'); if (!button) return;
  reportFilter = button.dataset.report;
  for (const item of $('report-statuses').querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
  renderReports();
});
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer); clearTimeout(accountsTimer); clearTimeout(historyTimer); clearTimeout(reportsTimer);
  if (!document.hidden) { refresh(); loadAccounts(); loadHistory(); loadReports(); }
});
// Age GPS on screen even if the next network request is slow.
setInterval(() => { if (snapshot && !document.hidden) {
  if (now() - snapshot.serverTime > 10000) { connected = false; showError('connection-error', 'Updates are delayed. Displayed positions are last known while we reconnect.'); }
  render();
} }, 1000);
try { token = sessionStorage.getItem(tokenKey) || ''; } catch {}
if (token) { $('login').hidden = true; $('dashboard').hidden = false; refresh(); loadReports(); }
showView();
