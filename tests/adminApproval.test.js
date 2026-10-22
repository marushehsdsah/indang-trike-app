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
const terminated = { ...pending, key: 'd3', name: 'Lito Camagong', approval: 'Terminated', terminatedAt: '2026-10-22T03:00:00.000Z', terminationReason: 'Plate not on the list' };
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

test('Account Approval lists the pending drivers, then the terminated ones, and opens a driver\'s review', async () => {
  reset({ name: 'AccountApproval', params: {} });
  const second = { ...pending, key: 'd2', name: 'Rosa Mendoza' };
  const server = api({ approvals: () => ({ drivers: [pending, second, terminated] }) });
  const AccountApprovalScreen = admin('screens/AccountApprovalScreen.js').default;
  const tree = await render(withSession(server.session, React.createElement(AccountApprovalScreen, { navigation })));
  const shown = texts(tree.root);
  for (const text of ['Account Approval', 'Pending (2)', 'Terminated (1)', 'Dante Reyes', 'Rosa Mendoza', 'Mobile No#: 09170000011', 'ITODA · SIM 011']) assert.ok(shown.includes(text), text);
  assert.ok(shown.some((text) => /^Signed up Oct 22, 2026/.test(text)), 'when they signed up, in Philippine time');
  assert.ok(!shown.includes('Lito Camagong'));
  await press(tree.root, 'Terminated (1)');
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

test('Driver Review approves, terminates with a reason, or unblocks, after the admin confirms', async () => {
  const DriverReviewScreen = admin('screens/DriverReviewScreen.js').default;
  const screen = (session, key) => withSession(session, React.createElement(DriverReviewScreen, { navigation, route: { params: { key } } }));
  const confirm = async () => {
    const [, , buttons] = alerts.at(-1);
    assert.deepEqual(buttons.map((button) => button.text)[0], 'Cancel');
    await renderer.act(async () => { await buttons[1].onPress(); });
    await flush();
  };

  // A pending driver: Approve, Terminate or Delete, and a reason box.
  reset({ name: 'DriverReview', params: { key: 'd1' } });
  const server = api({ 'drivers/d1': { driver: pending },
    'drivers/d1/terminate': () => ({ driver: { ...pending, approval: 'Terminated' }, emailed: true }),
    'drivers/d1/approve': () => { throw new Error('This driver is no longer waiting for approval.'); } });
  const tree = await render(screen(server.session, 'd1'));
  const shown = texts(tree.root);
  for (const text of ['Dante Reyes', 'PENDING', '09170000011', 'dante@example.com', 'ITODA', 'SIM 011', '4 passengers', 'Approve', 'Terminate', 'Delete', 'Reason (optional)']) assert.ok(shown.includes(text), text);
  assert.ok(!shown.includes('Unblock'));
  await renderer.act(async () => tree.root.find((node) => node.type === 'TextInput').props.onChangeText('  Plate not on the list '));
  await press(tree.root, 'Terminate');
  assert.equal(alerts.at(-1)[0], 'Terminate this account?');
  assert.equal(server.calls.filter(([kind]) => kind === 'act').length, 0, 'nothing is sent before the admin confirms');
  await confirm();
  assert.deepEqual(server.calls.at(-1), ['act', 'drivers/d1/terminate', { reason: 'Plate not on the list' }]);
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['Account terminated', 'Dante Reyes was emailed about it.']);
  await renderer.act(async () => alerts.at(-1)[2][0].onPress());
  assert.deepEqual(navigation.calls, [['goBack']]);

  // Another admin decided first: the error shows and the driver loads again.
  reset({ name: 'DriverReview', params: { key: 'd1' } });
  await press(tree.root, 'Approve');
  await confirm();
  assert.deepEqual(alerts.at(-1).slice(0, 2), ['Couldn’t update the driver', 'This driver is no longer waiting for approval.']);
  assert.deepEqual(server.calls.at(-1), ['load', 'drivers/d1']);
  assert.deepEqual(navigation.calls, []);

  // A terminated driver can only be unblocked; no reason is sent.
  reset({ name: 'DriverReview', params: { key: 'd3' } });
  const blocked = api({ 'drivers/d3': { driver: terminated }, 'drivers/d3/unblock': () => ({ driver: { ...terminated, approval: 'Pending' } }) });
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
  const server = api({ accounts: { accounts: [pending, approved, terminated, passenger] } });
  const AccountsScreen = admin('screens/AccountsScreen.js').default;
  const tree = await render(withSession(server.session, React.createElement(AccountsScreen)));
  const badges = (name) => texts(tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes(name))).filter((text) => /^[A-Z]+$/.test(text));
  assert.deepEqual(badges('Dante Reyes'), ['PENDING', 'RIDER']);
  assert.deepEqual(badges('Rosa Mendoza'), ['RIDER'], 'approved drivers need no badge');
  assert.deepEqual(badges('Lito Camagong'), ['TERMINATED', 'RIDER']);
  assert.equal(tree.root.findAll((node) => node.type === 'Ionicons' && node.props.name === 'person-add').length, 0, 'no add-account button over the list');
  await renderer.act(async () => tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes('Bea Santos')).props.onPress());
  assert.deepEqual(navigation.calls, [], 'a passenger has no review');
  await renderer.act(async () => tree.root.find((node) => node.type === 'TouchableOpacity' && texts(node).includes('Lito Camagong')).props.onPress());
  assert.deepEqual(navigation.calls, [['navigate', 'DriverReview', { key: 'd3', name: 'Lito Camagong' }]]);
});

test('run on its own, the admin interface approves and removes the mock drivers', async () => {
  reset({ name: 'AccountApproval', params: {} });
  const AccountApprovalScreen = admin('screens/AccountApprovalScreen.js').default;
  // No provider: the mock data of data/mockData.js.
  const tree = await render(React.createElement(AccountApprovalScreen, { navigation }));
  assert.ok(texts(tree.root).includes('Pending (2)'));
  assert.ok(texts(tree.root).includes('Terminated (1)'));
  let session;
  const Probe = () => { session = mocks['../session'].useAdminSession(); return null; };
  await render(React.createElement(Probe));
  const [elena, virgilio] = (await session.load('approvals')).drivers;
  assert.deepEqual((await session.act(`drivers/${elena.key}/approve`)).driver.approval, 'Approved');
  await session.act(`drivers/${virgilio.key}/delete`, { reason: 'Wrong plate' });
  await refocus();
  assert.ok(texts(tree.root).includes('Pending (0)'));
  assert.equal((await session.load('accounts')).accounts.some((account) => account.key === virgilio.key), false);
  assert.equal((await session.load('dashboard')).pendingDrivers, 0);
});
