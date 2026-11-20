const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, flush, React, renderer } = require('./helpers/reactHarness');
const { createMotion } = require('./helpers/motionMock');

// The admin interface (IndangGoAdmin) with React Native's components drawn as
// plain elements: the hamburger menu, Account Approval and Driver Review.
const alerts = [];
const host = (name) => name;
const motion = createMotion(React);
const reactNative = {
  View: host('View'), Text: host('Text'), TextInput: host('TextInput'), TouchableOpacity: host('TouchableOpacity'), Pressable: host('Pressable'),
  ScrollView: host('ScrollView'), ActivityIndicator: host('ActivityIndicator'), RefreshControl: host('RefreshControl'), Image: host('Image'),
  Animated: motion.Animated, Easing: motion.Easing, AccessibilityInfo: motion.AccessibilityInfo,
  useWindowDimensions: () => ({ width: 400, height: 800 }),
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
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) },
  'expo-linear-gradient': { LinearGradient: motion.LinearGradient } };
const admin = (file, extra = {}) => loadSource(`IndangGoAdmin/src/${file}`, { ...mocks, ...extra });
mocks['../theme/colors'] = admin('theme/colors.js');
mocks['./data/mockData'] = admin('data/mockData.js');
mocks['./session'] = mocks['../session'] = admin('session.js');
mocks['../useAdminData'] = admin('useAdminData.js');
mocks['../formatDate'] = admin('formatDate.js');
mocks['./Skeleton'] = mocks['../components/Skeleton'] = admin('components/Skeleton.js');
for (const name of ['StatusBadge', 'LoadState', 'TopHeader', 'DriverDocuments']) mocks[`../components/${name}`] = admin(`components/${name}.js`);
const TopHeader = mocks['../components/TopHeader'].default;
const { AdminSession } = mocks['../session'];

const textOf = (node) => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''));
const texts = (root) => root.findAll((node) => node.type === 'Text').map(textOf);
// The skeletons on screen (components/Skeleton.js).
const progressbars = (root) => root.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'progressbar');
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

test('Driver Review shows the photos of the driver\'s license, registration and franchise, and opens each full screen', async () => {
  const DriverReviewScreen = admin('screens/DriverReviewScreen.js').default;
  const screen = (session) => withSession(session, React.createElement(DriverReviewScreen, { navigation, route: { params: { key: 'd1' } } }));
  reset({ name: 'DriverReview', params: { key: 'd1' } });
  const at = '2026-10-22T02:00:00.000Z';
  const documents = [{ kind: 'license', label: 'Driver’s license', uploadedAt: at }, { kind: 'registration', label: 'Registration (OR/CR)', uploadedAt: at },
    { kind: 'franchise', label: 'Franchise (MTOP)', uploadedAt: at }];
  const address = (kind) => `https://api.test/api/admin/drivers/d1/documents/${kind}`;
  // Each photo loads with the admin's token, as the app's session gives it.
  const imageSource = (path) => ({ uri: `https://api.test/api/admin/${path}`, headers: { Authorization: 'Bearer admin-token' } });
  const server = api({ 'drivers/d1': { driver: { ...pending, documents } } });
  const tree = await render(screen({ ...server.session, imageSource }));
  const shown = texts(tree.root);
  for (const text of ['Documents', 'Driver’s license', 'Registration (OR/CR)', 'Franchise (MTOP)']) assert.ok(shown.includes(text), text);
  const images = (root = tree.root) => root.findAll((node) => node.type === 'Image').map((node) => node.props.source);
  assert.deepEqual(images().map((source) => source.uri), ['license', 'registration', 'franchise'].map(address));
  assert.equal(images()[0].headers.Authorization, 'Bearer admin-token');
  assert.equal(tree.root.findAll((node) => node.type === 'Modal').length, 0);

  // Each tile shimmers until its photo has downloaded.
  const shimmering = () => progressbars(tree.root).length;
  assert.equal(shimmering(), 3);
  await renderer.act(async () => tree.root.findAll((node) => node.type === 'Image')[0].props.onLoad());
  assert.equal(shimmering(), 2, 'the license arrived');
  for (const image of tree.root.findAll((node) => node.type === 'Image').slice(1)) await renderer.act(async () => image.props.onLoad());
  assert.equal(shimmering(), 0);

  // Tapping a photo opens it full screen; Zoom draws it larger, in its own shape.
  await press(tree.root, 'Open Franchise (MTOP)');
  let viewer = tree.root.find((node) => node.type === 'Modal');
  assert.ok(texts(viewer).includes('Franchise (MTOP)'));
  const fitted = viewer.find((node) => node.type === 'Image');
  assert.deepEqual([fitted.props.source.uri, fitted.props.resizeMode], [address('franchise'), 'contain']);
  await renderer.act(async () => fitted.props.onLoad({ nativeEvent: { source: { width: 2000, height: 1000 } } }));
  await press(viewer, 'Zoom in');
  viewer = tree.root.find((node) => node.type === 'Modal');
  assert.deepEqual(viewer.find((node) => node.type === 'Image').props.style, { width: 1000, height: 500 }, '2.5 times the screen width');
  await press(viewer, 'Fit to screen');
  await press(tree.root, 'Close');
  assert.equal(tree.root.findAll((node) => node.type === 'Modal').length, 0);

  // A photo that did not load says so, and tapping it tries again.
  await renderer.act(async () => tree.root.findAll((node) => node.type === 'Image')[0].props.onError());
  assert.ok(texts(tree.root).includes('Couldn’t load. Tap to retry'));
  assert.equal(images().length, 2);
  await press(tree.root, 'Retry Driver’s license');
  assert.equal(images().length, 3);
  assert.equal(shimmering(), 1, 'it shimmers again while it downloads again');

  // A driver who signed up before photos were asked for has none to show.
  const legacy = api({ 'drivers/d1': { driver: { ...pending, documents: documents.map((document) => ({ ...document, uploadedAt: null })) } } });
  const old = await render(screen({ ...legacy.session, imageSource }));
  assert.ok(texts(old.root).includes('No document photos on file. This driver signed up before photos were required.'));
  assert.equal(images(old.root).length, 0);
  // Nor does a driver from a server without document photos, or the mock data.
  const before = await render(screen(api({ 'drivers/d1': { driver: pending } }).session));
  assert.ok(!texts(before.root).includes('Documents'));
});

test('each admin screen shows a shimmering skeleton while its first load runs, then its data or the error, and never on a later reload', async () => {
  reset();
  // Every load waits until the test answers it.
  const loads = [];
  const session = { admin: { name: 'Pilot Admin', adminId: '09170000001', role: 'Administrator' }, signOut: async () => {}, act: async () => ({}), imageSource: () => null,
    load: (name) => new Promise((resolve, reject) => loads.push({ name, resolve, reject })) };
  const answer = (value) => renderer.act(async () => { loads.shift().resolve(value); });
  const AccountsScreen = admin('screens/AccountsScreen.js').default;
  const before = motion.animations.length;
  const tree = await render(withSession(session, React.createElement(AccountsScreen)));
  const [skeleton] = progressbars(tree.root);
  assert.equal(skeleton.props.accessibilityLabel, 'Loading', 'screen readers hear one "Loading"');
  assert.ok(!texts(tree.root).includes('Retry'));
  // It stays unseen for 0.3 s, so a quick load never flashes it, then fades in.
  const added = motion.animations.slice(before);
  assert.ok(added.some(({ kind, config }) => kind === 'timing' && config.delay === 300 && config.duration === 150 && config.useNativeDriver));
  // The light sweeps across each shape once it has a width, on the native side, in a loop.
  assert.ok(added.some(({ kind, started }) => kind === 'loop' && started));
  assert.equal(tree.root.findAll((node) => node.type === 'LinearGradient').length, 0);
  await renderer.act(async () => skeleton.findAll((node) => typeof node.props.onLayout === 'function')[0].props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
  assert.equal(tree.root.findAll((node) => node.type === 'LinearGradient').length, 1);

  // A load that took longer than 0.3 s: the skeleton was seen, so the list fades in.
  await new Promise((resolve) => setTimeout(resolve, 350));
  const shown = motion.animations.length;
  await answer({ accounts: [pending] });
  assert.equal(progressbars(tree.root).length, 0);
  assert.ok(texts(tree.root).includes('Dante Reyes'));
  assert.ok(motion.animations.slice(shown).some(({ kind, config }) => kind === 'timing' && config.delay === 0 && config.duration === 200));
  assert.equal(tree.root.find((node) => node.type === 'FlatList').parent.parent.props.style[0].flex, 1, 'the list keeps the screen height while it fades in');
  // Coming back to the screen reloads it behind the list already shown.
  await refocus();
  assert.equal(loads.length, 1);
  assert.equal(progressbars(tree.root).length, 0);
  assert.ok(texts(tree.root).includes('Dante Reyes'));
  await answer({ accounts: [pending] });

  // A first load that fails shows the error and Retry, never an endless skeleton.
  const failing = await render(withSession(session, React.createElement(AccountsScreen)));
  await renderer.act(async () => { loads.shift().reject(new Error('Could not connect to IndangGO.')); });
  assert.equal(progressbars(failing.root).length, 0);
  assert.ok(texts(failing.root).includes('Could not connect to IndangGO.') && texts(failing.root).includes('Retry'));
  await press(failing.root, 'Retry');
  assert.equal(progressbars(failing.root).length, 1, 'retrying a first load shows the skeleton again');
  await answer({ accounts: [] });
  assert.ok(texts(failing.root).includes('No accounts yet.'));

  // The other screens have their own skeletons.
  for (const [file, props] of [['DashboardScreen', {}], ['TripsScreen', {}], ['AccountApprovalScreen', { navigation }], ['DriverReviewScreen', { navigation, route: { params: { key: 'd1' } } }]]) {
    const Screen = admin(`screens/${file}.js`).default;
    const view = await render(withSession(session, React.createElement(Screen, props)));
    assert.equal(progressbars(view.root).length, 1, file);
    await renderer.act(async () => { loads.splice(0).forEach(({ reject }) => reject(new Error('offline'))); });
    assert.equal(progressbars(view.root).length, 0, `${file} shows the error instead`);
  }
});

test('with "Remove animations" on, a skeleton keeps still', async () => {
  const { Skeleton, Bone } = mocks['../components/Skeleton'];
  motion.reduced = true;
  try {
    const before = motion.animations.length;
    const tree = await render(React.createElement(Skeleton, null, React.createElement(Bone)));
    await renderer.act(async () => tree.root.find((node) => typeof node.props.onLayout === 'function').props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
    assert.equal(tree.root.findAll((node) => node.type === 'LinearGradient').length, 0, 'no light sweeps');
    // The setting is read once drawn; a loop started before the answer stops at once.
    assert.ok(motion.animations.slice(before).filter(({ kind, started }) => kind === 'loop' && started).every(({ stopped }) => stopped), 'no loop keeps running');
    assert.equal(progressbars(tree.root).length, 1, 'it still says it is loading');
  } finally { motion.reduced = false; }
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
    '../context/AppContext': { useApp: () => ({ user, signOut: async () => {}, request: async () => ({}), token: 'staff-token' }) },
    '../services/api': { API_BASE_URL: 'https://api.test' },
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
    // A driver's document photos load with the session's token.
    assert.deepEqual(seen.imageSource('drivers/d1/documents/license'),
      { uri: 'https://api.test/api/admin/drivers/d1/documents/license', headers: { Authorization: 'Bearer staff-token' } });
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
