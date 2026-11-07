const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, flush, React, renderer } = require('./helpers/reactHarness');

// The admin interface (IndangGoAdmin) with React Native's components drawn as
// plain elements: the hamburger menu, Account Approval and Driver Review.
const alerts = [];
const host = (name) => name;
const reactNative = {
  View: host('View'), Text: host('Text'), TextInput: host('TextInput'), TouchableOpacity: host('TouchableOpacity'), Pressable: host('Pressable'),
  ScrollView: host('ScrollView'), ActivityIndicator: host('ActivityIndicator'), RefreshControl: host('RefreshControl'),
  Modal: ({ visible, children }) => (visible ? React.createElement('Modal', null, children) : null),
  FlatList: ({ data, renderItem, keyExtractor, ListEmptyComponent }) => React.createElement('FlatList', null, data.length
    ? data.map((item, index) => React.createElement(React.Fragment, { key: keyExtractor(item) }, renderItem({ item, index })))
    : ListEmptyComponent),
  StyleSheet: { create: (styles) => styles }, Platform: { OS: 'android' },
  Alert: { alert: (...args) => alerts.push(args) },
};
// Screens that come back into view run their focus effects again (refocus).
const focusEffects = new Set();
const navigation = { calls: [] };
for (const method of ['navigate', 'setParams', 'popTo', 'goBack']) navigation[method] = (...args) => navigation.calls.push([method, ...args]);
let route = { name: 'Main', params: {} };
const routing = {
  useNavigation: () => navigation, useRoute: () => route,
  useFocusEffect: (effect) => React.useEffect(() => { focusEffects.add(effect); effect(); return () => focusEffects.delete(effect); }, [effect]),
};
const refocus = () => renderer.act(async () => { for (const effect of focusEffects) effect(); });

const mocks = { react: React, 'react-native': reactNative, '@expo/vector-icons': { Ionicons: host('Ionicons') }, '@react-navigation/native': routing,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) } };
const admin = (file, extra = {}) => loadSource(`IndangGoAdmin/src/${file}`, { ...mocks, ...extra });
mocks['../theme/colors'] = admin('theme/colors.js');
mocks['./data/mockData'] = admin('data/mockData.js');
mocks['./session'] = mocks['../session'] = admin('session.js');
mocks['../useAdminData'] = admin('useAdminData.js');
mocks['../formatDate'] = admin('formatDate.js');
for (const name of ['StatusBadge', 'LoadState', 'TopHeader']) mocks[`../components/${name}`] = admin(`components/${name}.js`);
const TopHeader = mocks['../components/TopHeader'].default;
const { AdminSession } = mocks['../session'];

const textOf = (node) => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''));
const texts = (root) => root.findAll((node) => node.type === 'Text').map(textOf);
// The button labelled `label`: by its accessibility label, or by all of its text.
const pressable = (root, label) => root.find((node) => typeof node.props.onPress === 'function' && typeof node.type === 'string' && node.type !== 'Text'
  && (node.props.accessibilityLabel === label || texts(node).join('') === label));
const press = (root, label) => renderer.act(async () => { pressable(root, label).props.onPress(); });
async function render(element) {
  let tree;
  await renderer.act(async () => { tree = renderer.create(element); });
  await flush();
  return tree;
}
function reset(at = { name: 'Main', params: {} }) { navigation.calls = []; alerts.length = 0; route = at; }

const pending = { key: 'd1', id: '09170000011', name: 'Dante Reyes', email: 'dante@example.com', role: 'RIDER', status: 'Offline', toda: 'ITODA', plate: 'SIM 011',
  approval: 'Pending', capacity: 4, joined: '2026-10-22T02:00:00.000Z', approvedAt: null, terminatedAt: null, terminationReason: '' };
const suspended = { ...pending, key: 'd3', name: 'Lito Camagong', approval: 'Suspended', terminatedAt: '2026-10-22T03:00:00.000Z', terminationReason: 'Plate not on the list' };
// The API, as the app provides it to the admin screens.
function api(responses) {
  const calls = [];
  return {
    calls,
    session: { admin: { name: 'Pilot Admin', adminId: '09170000001', role: 'Administrator' }, signOut: async () => {},
      load: async (name) => { calls.push(['load', name]); return typeof responses[name] === 'function' ? responses[name]() : responses[name]; },
      act: async (path, body) => { calls.push(['act', path, body]); return responses[path](body); } },
  };
}
const withSession = (session, element) => React.createElement(AdminSession.Provider, { value: session }, element);

test('the hamburger menu opens Account Approval and returns to the Dashboard tab', async () => {
  reset();
  const tree = await render(React.createElement(TopHeader, { title: 'Admin', section: 'dashboard' }));
  assert.equal(tree.root.findAll((node) => node.type === 'Modal').length, 0, 'closed at first');
  await press(tree.root, 'Open menu');
  assert.deepEqual(texts(tree.root.find((node) => node.type === 'Modal')), ['Dashboard', 'Account Approval']);
  assert.equal(tree.root.find((node) => node.props.accessibilityRole === 'menuitem' && node.props.accessibilityState.selected).props.accessibilityState.selected, true);
  await press(tree.root, 'Account Approval');
  assert.deepEqual(navigation.calls, [['navigate', 'AccountApproval']]);
  assert.equal(tree.root.findAll((node) => node.type === 'Modal').length, 0, 'choosing closes the menu');

  // From the Accounts or Trips tab, Dashboard switches Main to its Dashboard tab.
  await press(tree.root, 'Open menu');
  await press(tree.root, 'Dashboard');
  assert.equal(navigation.calls[1][0], 'setParams');
  assert.equal(navigation.calls[1][1].tab, 'dashboard');
  // A tap outside the menu closes it without going anywhere.
  await press(tree.root, 'Open menu');
  await press(tree.root, 'Close menu');
  assert.equal(navigation.calls.length, 2);
  assert.equal(tree.root.findAll((node) => node.type === 'Modal').length, 0);

  // From Account Approval, Dashboard goes back to Main's Dashboard tab.
  reset({ name: 'AccountApproval', params: {} });
  const onApproval = await render(React.createElement(TopHeader, { title: 'Admin', section: 'approval' }));
  await press(onApproval.root, 'Open menu');
  await press(onApproval.root, 'Account Approval');
  assert.deepEqual(navigation.calls, [], 'already there');
  await press(onApproval.root, 'Open menu');
  await press(onApproval.root, 'Dashboard');
  assert.equal(navigation.calls[0][0], 'popTo');
  assert.equal(navigation.calls[0][1], 'Main');
  assert.equal(navigation.calls[0][2].tab, 'dashboard');
});

test('Dashboard from the menu switches Main to the Dashboard tab every time', async () => {
  let changeTab;
  const MainScreen = admin('screens/MainScreen.js', {
    './DashboardScreen': { __esModule: true, default: () => React.createElement('Text', null, 'dashboard tab') },
    './AccountsScreen': { __esModule: true, default: () => React.createElement('Text', null, 'accounts tab') },
    './TripsScreen': { __esModule: true, default: () => React.createElement('Text', null, 'trips tab') },
    '../components/BottomNav': { __esModule: true, default: ({ onChangeTab }) => { changeTab = onChangeTab; return null; } },
  }).default;
  const tree = await render(React.createElement(MainScreen, { route: { name: 'Main', params: undefined } }));
  assert.deepEqual(texts(tree.root), ['dashboard tab']);
  await renderer.act(async () => changeTab('accounts'));
  assert.deepEqual(texts(tree.root), ['accounts tab']);
  await renderer.act(async () => tree.update(React.createElement(MainScreen, { route: { name: 'Main', params: { tab: 'dashboard', at: 1 } } })));
  assert.deepEqual(texts(tree.root), ['dashboard tab']);
  await renderer.act(async () => changeTab('trips'));
  await renderer.act(async () => tree.update(React.createElement(MainScreen, { route: { name: 'Main', params: { tab: 'dashboard', at: 2 } } })));
  assert.deepEqual(texts(tree.root), ['dashboard tab'], 'the same choice again still counts');
});

test('Account Approval lists the pending drivers, then the suspended ones, and opens a driver\'s review', async () => {
  reset({ name: 'AccountApproval', params: {} });
  const second = { ...pending, key: 'd2', name: 'Rosa Mendoza' };
  const server = api({ approvals: () => ({ drivers: [pending, second, suspended] }) });
  const AccountApprovalScreen = admin('screens/AccountApprovalScreen.js').default;
  const tree = await render(withSession(server.session, React.createElement(AccountApprovalScreen, { navigation })));
  const shown = texts(tree.root);
  for (const text of ['Account Approval', 'Pending (2)', 'Suspended (1)', 'Dante Reyes', 'Rosa Mendoza', 'Mobile No#: 09170000011', 'ITODA · SIM 011']) assert.ok(shown.includes(text), text);
  assert.ok(shown.some((text) => /^Signed up Oct 22, 2026/.test(text)), 'when they signed up, in Philippine time');
  assert.ok(!shown.includes('Lito Camagong'));
  await press(tree.root, 'Suspended (1)');
  assert.ok(texts(tree.root).includes('Lito Camagong'));
  assert.ok(texts(tree.root).includes('Reason: Plate not on the list'));
  assert.ok(!texts(tree.root).includes('Dante Reyes'));
  await press(tree.root, 'Review Lito Camagong');
  assert.deepEqual(navigation.calls, [['navigate', 'DriverReview', { key: 'd3', name: 'Lito Camagong' }]]);
  // Back from a review, the list loads again.
  await refocus();
  assert.deepEqual(server.calls, [['load', 'approvals'], ['load', 'approvals']]);

  const empty = api({ approvals: { drivers: [] } });
  const none = await render(withSession(empty.session, React.createElement(AccountApprovalScreen, { navigation })));
  assert.ok(texts(none.root).includes('No drivers are waiting for approval.'));
});

test('Driver Review approves or declines a pending driver, suspends an approved one, or unblocks, after the admin confirms', async () => {
  const DriverReviewScreen = admin('screens/DriverReviewScreen.js').default;
  const screen = (session, key) => withSession(session, React.createElement(DriverReviewScreen, { navigation, route: { params: { key } } }));
  const confirm = async () => {
    const [, , buttons] = alerts.at(-1);
    assert.deepEqual(buttons.map((button) => button.text)[0], 'Cancel');
    await renderer.act(async () => { await buttons[1].onPress(); });
    await flush();
  };

  // A pending driver: Approve or Decline, and a reason box.
  reset({ name: 'DriverReview', params: { key: 'd1' } });
  const server = api({ 'drivers/d1': { driver: pending },
    'drivers/d1/decline': () => ({ driver: pending, emailed: true }),
    'drivers/d1/approve': () => { throw new Error('This driver is no longer waiting for approval.'); } });
  const tree = await render(screen(server.session, 'd1'));
  const shown = texts(tree.root);
  for (const text of ['Dante Reyes', 'PENDING', '09170000011', 'dante@example.com', 'ITODA', 'SIM 011', '4 passengers', 'Approve', 'Decline', 'Reason (optional)']) assert.ok(shown.includes(text), text);
  assert.ok(!shown.includes('Suspend') && !shown.includes('Delete') && !shown.includes('Unblock'), 'a registration is declined, not suspended');
  await renderer.act(async () => tree.root.find((node) => node.type === 'TextInput').props.onChangeText('  Plate not on the list '));
  await press(tree.root, 'Decline');
  assert.equal(alerts.at(-1)[0], 'Decline this registration?');
  assert.match(alerts.at(-1)[1], /can sign up again with the same mobile number and email/);
  assert.equal(server.calls.filter(([kind]) => kind === 'act').length, 0, 'nothing is sent before the admin confirms');
  await confirm();
  assert.deepEqual(server.calls.at(-1), ['act', 'drivers/d1/decline', { reason: 'Plate not on the list' }]);
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['Registration declined', 'Dante Reyes was emailed about it.']);
  await renderer.act(async () => alerts.at(-1)[2][0].onPress());
  assert.deepEqual(navigation.calls, [['goBack']]);

  // Another admin decided first: the error shows and the driver loads again.
  reset({ name: 'DriverReview', params: { key: 'd1' } });
  await press(tree.root, 'Approve');
  await confirm();
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['Couldn’t update the driver', 'This driver is no longer waiting for approval.']);
  assert.deepEqual(server.calls.at(-1), ['load', 'drivers/d1']);
  assert.deepEqual(navigation.calls, []);

  // An approved driver: Suspend or Delete, with the reason.
  reset({ name: 'DriverReview', params: { key: 'd2' } });
  const approved = { ...pending, key: 'd2', name: 'Rosa Mendoza', approval: 'Approved', approvedAt: '2026-10-22T04:00:00.000Z' };
  const active = api({ 'drivers/d2': { driver: approved }, 'drivers/d2/terminate': () => ({ driver: { ...approved, approval: 'Suspended' }, emailed: false }) });
  const review = await render(screen(active.session, 'd2'));
  const choices = texts(review.root);
  for (const text of ['APPROVED', 'Suspend', 'Delete', 'Reason (optional)']) assert.ok(choices.includes(text), text);
  assert.ok(!choices.includes('Approve') && !choices.includes('Decline'));
  assert.ok(!choices.some((text) => /terminat/i.test(text)), 'the screen says suspend, not terminate');
  await renderer.act(async () => review.root.find((node) => node.type === 'TextInput').props.onChangeText('Fake plate'));
  await press(review.root, 'Suspend');
  assert.equal(alerts.at(-1)[0], 'Suspend this account?');
  await confirm();
  assert.deepEqual(active.calls.at(-1), ['act', 'drivers/d2/terminate', { reason: 'Fake plate' }]);
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['Account suspended', 'The email to Rosa Mendoza couldn’t be sent, so let them know yourself.']);

  // A suspended driver can only be unblocked; no reason is sent.
  reset({ name: 'DriverReview', params: { key: 'd3' } });
  const blocked = api({ 'drivers/d3': { driver: suspended }, 'drivers/d3/unblock': () => ({ driver: { ...suspended, approval: 'Pending' } }) });
  const unblock = await render(screen(blocked.session, 'd3'));
  const options = texts(unblock.root);
  assert.ok(options.includes('Unblock') && options.includes('Plate not on the list'));
  assert.ok(!options.includes('Approve') && !options.includes('Delete') && !options.includes('Reason (optional)'));
  await press(unblock.root, 'Unblock');
  await confirm();
  assert.deepEqual(blocked.calls.at(-1), ['act', 'drivers/d3/unblock', {}]);
  assert.equal(alerts.at(-1)[0], 'Driver unblocked');
});

test('Accounts shows which drivers are not approved, and tapping a driver opens their review', async () => {
  reset();
  const passenger = { key: 'p1', id: '09170000902', name: 'Bea Santos', email: 'bea@example.com', role: 'PASSENGER', status: 'Offline' };
  const approved = { ...pending, key: 'd2', name: 'Rosa Mendoza', approval: 'Approved' };
  const server = api({ accounts: { accounts: [pending, approved, suspended, passenger] } });
  const AccountsScreen = admin('screens/AccountsScreen.js').default;
  const tree = await render(withSession(server.session, React.createElement(AccountsScreen)));
  const badges = (name) => texts(tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes(name))).filter((text) => /^[A-Z]+$/.test(text));
  assert.deepEqual(badges('Dante Reyes'), ['PENDING', 'RIDER']);
  assert.deepEqual(badges('Rosa Mendoza'), ['RIDER'], 'approved drivers need no badge');
  assert.deepEqual(badges('Lito Camagong'), ['SUSPENDED', 'RIDER']);
  assert.equal(tree.root.findAll((node) => node.type === 'Ionicons' && node.props.name === 'person-add').length, 0, 'no add-account button over the list');
  await renderer.act(async () => tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes('Bea Santos')).props.onPress());
  assert.deepEqual(navigation.calls, [], 'a passenger has no review');
  await renderer.act(async () => tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes('Lito Camagong')).props.onPress());
  assert.deepEqual(navigation.calls, [['navigate', 'DriverReview', { key: 'd3', name: 'Lito Camagong' }]]);
});

// The admin screens as the app gives them a staff account (navigation/AdminNavigator.js).
const ADMIN = { name: 'Toda Officer', adminId: '09170000002', role: 'Admin', toda: 'BCITODA' };
const SUPERADMIN = { name: 'Pilot Admin', adminId: '09170000001', role: 'Superadmin', toda: null };
const DASHBOARD = { totalAccounts: 2, onlineNow: 1, ongoingTrips: 0, recentTrips: [], pendingDrivers: 0 };

test('an admin\'s screens name their TODA, and Accounts has no passenger filter for them', async () => {
  reset();
  const server = api({ accounts: { accounts: [pending] }, dashboard: DASHBOARD });
  const session = { ...server.session, admin: ADMIN };
  const ProfileScreen = admin('screens/ProfileScreen.js').default;
  const profile = await render(withSession(session, React.createElement(ProfileScreen, { navigation })));
  const shown = texts(profile.root);
  assert.ok(shown.includes('Admin') && shown.includes('TODA') && shown.includes('BCITODA'), shown.join(' | '));
  const DashboardScreen = admin('screens/DashboardScreen.js').default;
  const dashboard = await render(withSession(session, React.createElement(DashboardScreen)));
  assert.ok(texts(dashboard.root).includes('BCITODA drivers'));
  assert.ok(texts(dashboard.root).includes('Drivers'));
  assert.equal(texts(dashboard.root).includes('Total Accounts'), false);
  const AccountsScreen = admin('screens/AccountsScreen.js').default;
  const accounts = await render(withSession(session, React.createElement(AccountsScreen)));
  assert.equal(texts(accounts.root).includes('Passengers'), false, 'no role filter');
  assert.ok(texts(accounts.root).includes('Dante Reyes'));
  const empty = await render(withSession({ ...session, load: async () => ({ accounts: [] }) }, React.createElement(AccountsScreen)));
  assert.ok(texts(empty.root).includes('No drivers in your TODA yet.'));
  // An admin not yet assigned a TODA is told so on their profile.
  const unassigned = await render(withSession({ ...session, admin: { ...ADMIN, toda: '' } }, React.createElement(ProfileScreen, { navigation })));
  assert.ok(texts(unassigned.root).includes('Not assigned yet'));
});

test('a superadmin\'s screens cover every TODA, as before', async () => {
  reset();
  const server = api({ accounts: { accounts: [pending] }, dashboard: DASHBOARD });
  const session = { ...server.session, admin: SUPERADMIN };
  const profile = await render(withSession(session, React.createElement(admin('screens/ProfileScreen.js').default, { navigation })));
  assert.ok(texts(profile.root).includes('Superadmin'));
  assert.equal(texts(profile.root).includes('TODA'), false);
  const dashboard = await render(withSession(session, React.createElement(admin('screens/DashboardScreen.js').default)));
  assert.ok(texts(dashboard.root).includes('Total Accounts'));
  const accounts = await render(withSession(session, React.createElement(admin('screens/AccountsScreen.js').default)));
  assert.ok(['All', 'Drivers', 'Passengers', 'Admins'].every((label) => texts(accounts.root).includes(label)));
});

test('a superadmin\'s Accounts lists the staff too, and its Admins filter shows only them', async () => {
  reset();
  const passenger = { key: 'p1', id: '09170000902', name: 'Bea Santos', email: 'bea@example.com', role: 'PASSENGER', status: 'Offline' };
  const superadmin = { key: 's1', id: '09170000001', name: 'Pilot Admin', email: '', role: 'SUPERADMIN', status: 'Online' };
  const todaAdmin = { key: 'a1', id: '09170000002', name: 'Toda Officer', email: 'officer@example.com', role: 'ADMIN', status: 'Offline', toda: 'BCITODA' };
  const newAdmin = { key: 'a2', id: '09170000003', name: 'New Officer', email: 'new@example.com', role: 'ADMIN', status: 'Offline', toda: '' };
  const server = api({ accounts: { accounts: [pending, passenger, superadmin, todaAdmin, newAdmin] } });
  const tree = await render(withSession({ ...server.session, admin: SUPERADMIN }, React.createElement(admin('screens/AccountsScreen.js').default)));
  const card = (name) => tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes(name));
  const names = () => ['Dante Reyes', 'Bea Santos', 'Pilot Admin', 'Toda Officer', 'New Officer'].filter((name) => texts(tree.root).includes(name));
  assert.deepEqual(names(), ['Dante Reyes', 'Bea Santos', 'Pilot Admin', 'Toda Officer', 'New Officer'], 'All lists everyone');
  // Each staff card names its role and the TODA it manages.
  assert.ok(texts(card('Pilot Admin')).includes('SUPERADMIN') && texts(card('Pilot Admin')).includes('Every TODA'));
  assert.ok(texts(card('Toda Officer')).includes('ADMIN') && texts(card('Toda Officer')).includes('BCITODA'));
  assert.ok(texts(card('New Officer')).includes('No TODA yet'));
  await press(tree.root, 'Admins');
  assert.deepEqual(names(), ['Pilot Admin', 'Toda Officer', 'New Officer']);
  await press(tree.root, 'Passengers');
  assert.deepEqual(names(), ['Bea Santos'], 'staff are not passengers');
  await press(tree.root, 'Drivers');
  assert.deepEqual(names(), ['Dante Reyes']);
  // A staff account has no review to open.
  await press(tree.root, 'Admins');
  await renderer.act(async () => card('Toda Officer').props.onPress());
  assert.deepEqual(navigation.calls, []);
});

test('the app opens the admin screens as Admin of their TODA, or as Superadmin', async () => {
  let seen;
  const Probe = () => { seen = mocks['../session'].useAdminSession(); return null; };
  let user;
  const AdminNavigator = loadSource('navigation/AdminNavigator.js', {
    react: React,
    '@react-navigation/native-stack': { createNativeStackNavigator: () => ({ Navigator: () => React.createElement(Probe), Screen: () => null }) },
    'react-native-safe-area-context': { SafeAreaView: ({ children }) => React.createElement('SafeAreaView', null, children) },
    'expo-status-bar': { StatusBar: host('StatusBar') },
    '../IndangGoAdmin/src/screens/WelcomeScreen': host('WelcomeScreen'), '../IndangGoAdmin/src/screens/MainScreen': host('MainScreen'),
    '../IndangGoAdmin/src/screens/ProfileScreen': host('ProfileScreen'), '../IndangGoAdmin/src/screens/AccountApprovalScreen': host('AccountApprovalScreen'),
    '../IndangGoAdmin/src/screens/DriverReviewScreen': host('DriverReviewScreen'),
    '../IndangGoAdmin/src/theme/colors': mocks['../theme/colors'], '../IndangGoAdmin/src/session': mocks['../session'],
    '../context/AppContext': { useApp: () => ({ user, signOut: async () => {}, request: async () => ({}) }) },
  }).default;
  const cases = [
    [{ role: 'admin', toda: 'BCITODA', firstName: 'Toda', lastName: 'Officer', phone: '+639170000002' }, { name: 'Toda Officer', adminId: '09170000002', role: 'Admin', toda: 'BCITODA' }],
    [{ role: 'admin', firstName: 'New', lastName: 'Admin', phone: '+639170000003' }, { name: 'New Admin', adminId: '09170000003', role: 'Admin', toda: '' }],
    [{ role: 'superadmin', toda: 'BCITODA', firstName: 'Pilot', lastName: 'Admin', phone: '+639170000001' }, { name: 'Pilot Admin', adminId: '09170000001', role: 'Superadmin', toda: null }],
  ];
  for (const [account, expected] of cases) {
    user = account;
    const tree = await render(React.createElement(AdminNavigator));
    assert.deepEqual(seen.admin, expected);
    await renderer.act(async () => tree.unmount());
  }
});

test('run on its own, the admin interface approves and declines the mock drivers', async () => {
  reset({ name: 'AccountApproval', params: {} });
  const AccountApprovalScreen = admin('screens/AccountApprovalScreen.js').default;
  // No provider: the mock data of data/mockData.js.
  const tree = await render(React.createElement(AccountApprovalScreen, { navigation }));
  assert.ok(texts(tree.root).includes('Pending (2)'));
  assert.ok(texts(tree.root).includes('Suspended (1)'));
  let session;
  const Probe = () => { session = mocks['../session'].useAdminSession(); return null; };
  await render(React.createElement(Probe));
  const [elena, virgilio] = (await session.load('approvals')).drivers;
  assert.deepEqual((await session.act(`drivers/${elena.key}/approve`)).driver.approval, 'Approved');
  await session.act(`drivers/${virgilio.key}/decline`, { reason: 'Wrong plate' });
  await refocus();
  assert.ok(texts(tree.root).includes('Pending (0)'));
  assert.equal((await session.load('accounts')).accounts.some((account) => account.key === virgilio.key), false);
  assert.equal((await session.load('dashboard')).pendingDrivers, 0);
});
