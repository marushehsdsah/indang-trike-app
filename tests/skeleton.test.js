const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, flush, deferred, React, renderer } = require('./helpers/reactHarness');
const { createMotion } = require('./helpers/motionMock');
const STRINGS = require('../i18n/strings');

// Skeleton loading in the passenger and driver app (components/ui/Skeleton.js)
// and the screens that use it, with React Native drawn as plain elements.
const host = (name) => name;
const motion = createMotion(React);
const esm = (value) => ({ __esModule: true, default: value });
const t = (key, values = {}) => (STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const reactNative = {
  View: host('View'), Text: host('Text'), Pressable: host('Pressable'), RefreshControl: host('RefreshControl'), Image: host('Image'),
  StyleSheet: { create: (styles) => styles }, Alert: { alert() {} },
  Animated: motion.Animated, Easing: motion.Easing, AccessibilityInfo: motion.AccessibilityInfo,
};
let reduced = false;
const theme = loadSource('theme.js', {});
const Skeleton = loadSource('components/ui/Skeleton.js', {
  react: React, 'react-native': reactNative, 'expo-linear-gradient': { LinearGradient: motion.LinearGradient },
  '../../hooks/useReducedMotion': esm(() => reduced), '../../i18n': { useI18n: () => ({ t }) }, '../../theme': theme,
});
const { Bone, SkeletonSwap, SHOW_AFTER_MS } = Skeleton;
const Shapes = loadSource('components/LoadingSkeletons.js', {
  react: React, 'react-native': reactNative, './ui/Surfaces': { Card: host('Card'), Divider: host('Divider') }, './ui/Skeleton': Skeleton, '../theme': theme,
});

async function render(element) {
  let tree;
  await renderer.act(async () => { tree = renderer.create(element); });
  await flush();
  return tree;
}
const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wrappers = (root) => root.findAll((node) => node.type === 'Animated.View');
const skeletons = (root) => root.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'progressbar');
const content = React.createElement('Text', null, 'The trips');
const swap = (loading) => React.createElement(SkeletonSwap, { loading, skeleton: React.createElement(Shapes.TripCardsSkeleton) }, content);

test('a skeleton holds its place unseen for 0.3 s, so a quick load never flashes it', async () => {
  const before = motion.animations.length;
  const tree = await render(swap(true));
  assert.equal(skeletons(tree.root).length, 1);
  assert.equal(skeletons(tree.root)[0].props.accessibilityLabel, 'Loading…', 'screen readers hear "Loading…"');
  // (The other timing is the light's sweep, inside its loop.)
  const appear = motion.animations.slice(before).find(({ kind, config }) => kind === 'timing' && config.delay === SHOW_AFTER_MS);
  assert.deepEqual([appear.config.duration, appear.config.useNativeDriver, appear.started], [150, true, true]);
  // The data came within 0.3 s: the content just appears, with no wrapper to fade.
  await renderer.act(async () => tree.update(swap(false)));
  assert.equal(skeletons(tree.root).length, 0);
  assert.equal(wrappers(tree.root).length, 0);
  assert.ok(tree.root.findAll((node) => node.type === 'Text').some((node) => node.children.includes('The trips')));
});

test('content that replaces a skeleton that was seen fades in; content already there never shows a skeleton', async () => {
  const tree = await render(swap(true));
  await later(SHOW_AFTER_MS + 50);
  const before = motion.animations.length;
  await renderer.act(async () => tree.update(swap(false)));
  assert.equal(skeletons(tree.root).length, 0);
  const fade = motion.animations.slice(before).find(({ kind, config }) => kind === 'timing' && config.duration === 200);
  assert.deepEqual([fade.config.delay, fade.started], [0, true], 'a new fade, not the skeleton\'s');
  assert.equal(wrappers(tree.root).length, 1);
  const settled = await render(swap(false));
  assert.equal(skeletons(settled.root).length, 0);
  assert.equal(wrappers(settled.root).length, 0);
});

test('a light sweeps across each shape on the native side, and keeps still with "Remove animations" on', async () => {
  const before = motion.animations.length;
  const tree = await render(React.createElement(Skeleton.Skeleton, null, React.createElement(Bone, { width: 200 })));
  const loop = motion.animations.slice(before).find(({ kind }) => kind === 'loop');
  assert.ok(loop.started);
  const [sweep, pause] = loop.config.config;
  assert.deepEqual([sweep.config.duration, sweep.config.useNativeDriver, pause.config], [1000, true, 400]);
  assert.equal(tree.root.findAll((node) => node.type === 'LinearGradient').length, 0, 'not before the shape has a width');
  await renderer.act(async () => tree.root.find((node) => typeof node.props.onLayout === 'function').props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
  const band = tree.root.find((node) => node.type === 'Animated.View');
  assert.equal(band.props.style.width, 120, 'a little over half the shape');
  assert.deepEqual(band.props.style.transform[0].translateX.interpolation.outputRange, [-120, 200], 'from just before the shape to just past it');
  await renderer.act(async () => tree.unmount());
  assert.ok(loop.stopped, 'the loop stops with the skeleton');

  reduced = true;
  try {
    const still = motion.animations.length;
    const quiet = await render(React.createElement(Skeleton.Skeleton, null, React.createElement(Bone)));
    await renderer.act(async () => quiet.root.find((node) => typeof node.props.onLayout === 'function').props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
    assert.equal(quiet.root.findAll((node) => node.type === 'LinearGradient').length, 0);
    assert.ok(!motion.animations.slice(still).some(({ kind }) => kind === 'loop'));
    // A fade still waits its delay, but takes no time.
    await render(React.createElement(Skeleton.FadeIn, { delay: SHOW_AFTER_MS }, content));
    assert.equal(motion.animations.at(-1).config.duration, 0);
  } finally { reduced = false; }
});

test('each screen\'s skeleton is shaped like what it stands in for, with grey shapes only', async () => {
  const count = async (element, type) => (await render(element)).root.findAll((node) => node.type === type).length;
  assert.equal(await count(React.createElement(Shapes.TripCardsSkeleton), 'Card'), 3);
  assert.equal(await count(React.createElement(Shapes.BookingCardsSkeleton), 'Card'), 2);
  assert.equal(await count(React.createElement(Shapes.RecentPlacesSkeleton), 'Divider'), 2, 'three rows');
  for (const Shape of [Shapes.TripCardsSkeleton, Shapes.BookingCardsSkeleton, Shapes.RecentPlacesSkeleton, Shapes.ChatBubblesSkeleton, Shapes.ValueSkeleton]) {
    const tree = await render(React.createElement(Shape));
    assert.equal(tree.root.findAll((node) => node.type === 'Text').length, 0, 'no made-up text');
    assert.equal(skeletons(tree.root).length, 1, 'one "Loading" for the whole shape');
  }
  const value = await render(React.createElement(Shapes.ValueSkeleton, { lineHeight: 28 }));
  assert.equal(skeletons(value.root)[0].props.style[1].height, 28, 'as tall as the number it stands in for');
});

// useAccountHistory with a fake server and saved copy.
function historyHarness({ cache = null } = {}) {
  const calls = [];
  const app = { ride: null, user: { id: 'u1' }, request: (path) => { const call = deferred(); calls.push({ path, ...call }); return call.promise; } };
  const useAccountHistory = loadSource('hooks/useAccountHistory.js', {
    react: React, '@react-navigation/native': { useFocusEffect: (effect) => React.useEffect(() => effect(), [effect]) },
    '../context/AppContext': { useApp: () => app }, '../services/sessionCache': { readSessionCache: () => cache, updateSessionCache() {} },
  }).default;
  const state = {};
  const Probe = () => { Object.assign(state, useAccountHistory()); return null; };
  const answer = (history, stats) => renderer.act(async () => { calls.shift().resolve(history); calls.shift().resolve(stats); });
  return { calls, state, Probe, answer };
}

test('trips and totals count as loaded once there is something to show, and stay loaded while they reload', async () => {
  const fresh = historyHarness();
  await render(React.createElement(fresh.Probe));
  assert.deepEqual([fresh.state.loaded, fresh.state.loading], [false, true], 'a skeleton until the first answer');
  await fresh.answer({ rides: [] }, { trips: 0 });
  assert.deepEqual([fresh.state.loaded, fresh.state.loading], [true, false]);
  renderer.act(() => { fresh.state.reload(); });
  await flush();
  assert.deepEqual([fresh.state.loaded, fresh.state.loading], [true, true], 'a reload keeps what is shown');
  await fresh.answer({ rides: [] }, { trips: 0 });

  const failing = historyHarness();
  await render(React.createElement(failing.Probe));
  await renderer.act(async () => { failing.calls.shift().reject(new Error('Could not connect to IndangGO.')); });
  assert.deepEqual([failing.state.loaded, failing.state.error], [true, 'Could not connect to IndangGO.'], 'the error, never an endless skeleton');

  const saved = historyHarness({ cache: { user: { id: 'u1' }, history: [{ id: 'r1' }], stats: { trips: 1 } } });
  await render(React.createElement(saved.Probe));
  assert.deepEqual([saved.state.loaded, saved.state.rides.length], [true, 1], 'the saved copy shows at once');
});

// A screen's parts drawn as plain elements; SkeletonSwap shows which side it is on.
const screenMocks = (extra) => ({
  react: React, 'react-native': reactNative, '@expo/vector-icons': { MaterialCommunityIcons: host('Icon') },
  '../components/ui/Screen': esm(host('Screen')), '../components/ui/AppHeader': esm(host('AppHeader')), '../components/ui/Button': esm(host('Button')),
  '../components/ui/Surfaces': { Card: host('Card'), EmptyState: host('EmptyState'), Money: host('Money'), SegmentedControl: host('SegmentedControl') },
  '../components/BottomNav': esm(host('BottomNav')), '../components/ConnectionBanner': esm(host('ConnectionBanner')), '../components/TripStops': esm(host('TripStops')),
  '../components/ui/KeyboardAwareScrollView': esm(host('ScrollView')),
  '../components/ui/Skeleton': { SkeletonSwap: ({ loading, skeleton, children }) => React.createElement(loading ? 'SkeletonSide' : 'ContentSide', null, loading ? skeleton : children) },
  '../components/LoadingSkeletons': { TripCardsSkeleton: host('TripCardsSkeleton'), BookingCardsSkeleton: host('BookingCardsSkeleton') },
  '../i18n': { useI18n: () => ({ t, language: 'en' }) }, '../theme': theme, ...extra,
});
const has = (root, type) => root.findAll((node) => node.type === type).length > 0;
// The pull-to-refresh spinner, which the scroll view takes as a prop.
const spinner = (root) => root.find((node) => node.type === 'ScrollView').props.refreshControl.props;

test('Trips shows its skeleton only on the first load, then the trips, the empty state or the error', async () => {
  let history = { rides: [], loading: true, loaded: false, error: null, fromCache: false, reload() {} };
  const HistoryScreen = loadSource('screens/HistoryScreen.js', screenMocks({
    '../components/RatingPrompt': { __esModule: true, default: host('RatingPrompt'), Stars: host('Stars') }, '../components/ReportPrompt': esm(host('ReportPrompt')),
    '../hooks/useAccountHistory': esm(() => history), '../context/AppContext': { useApp: () => ({ user: { role: 'passenger' } }) },
  })).default;
  const view = () => React.createElement(HistoryScreen, { navigation: { navigate() {} } });
  const tree = await render(view());
  assert.ok(has(tree.root, 'SkeletonSide') && has(tree.root, 'TripCardsSkeleton'));
  assert.equal(spinner(tree.root).refreshing, false, 'the skeleton, not the pull spinner too');
  history = { ...history, loading: false, loaded: true };
  await renderer.act(async () => tree.update(view()));
  assert.ok(has(tree.root, 'ContentSide') && has(tree.root, 'EmptyState'));
  // Pulling to refresh keeps the empty state, with the spinner on top.
  history = { ...history, loading: true };
  await renderer.act(async () => tree.update(view()));
  assert.ok(!has(tree.root, 'SkeletonSide') && has(tree.root, 'EmptyState'));
  assert.equal(spinner(tree.root).refreshing, true);
  history = { ...history, loading: false, error: 'Could not connect to IndangGO.' };
  await renderer.act(async () => tree.update(view()));
  assert.ok(!has(tree.root, 'SkeletonSide') && !has(tree.root, 'ContentSide'));
});

test('Bookings shows its skeleton until the first list arrives, and not during the reloads every 15 seconds', async () => {
  const calls = [];
  const fix = { latitude: 14.2, longitude: 120.88, accuracy: 5, timestamp: Date.now() };
  const app = { user: { role: 'driver', available: true }, ride: null, gps: { status: 'ready', fix }, connected: true, bookingsVersion: 0, rideAction: async () => {},
    request: () => { const call = deferred(); calls.push(call); return call.promise; } };
  const BookingsScreen = loadSource('screens/BookingsScreen.js', screenMocks({
    '@react-navigation/native': { useFocusEffect: (effect) => React.useEffect(() => effect(), [effect]) },
    '../components/RatingPrompt': { RatingBadge: host('RatingBadge') }, '../context/AppContext': { useApp: () => app },
  })).default;
  const tree = await render(React.createElement(BookingsScreen, { navigation: { navigate() {} } }));
  // The screen's 15-second timer stops even when an assertion fails.
  try {
    assert.equal(calls.length, 1);
    assert.ok(has(tree.root, 'SkeletonSide') && has(tree.root, 'BookingCardsSkeleton'));
    await renderer.act(async () => { calls.shift().resolve({ bookings: [] }); });
    assert.ok(has(tree.root, 'ContentSide') && has(tree.root, 'EmptyState'));
    // A reload (pull to refresh, or the timer) keeps the list on screen.
    await renderer.act(async () => { spinner(tree.root).onRefresh(); });
    assert.equal(calls.length, 1);
    assert.ok(!has(tree.root, 'SkeletonSide') && has(tree.root, 'EmptyState'), 'the empty state stays, it does not blink');
    assert.equal(spinner(tree.root).refreshing, true);
    await renderer.act(async () => { calls.shift().resolve({ bookings: [] }); });
  } finally { await renderer.act(async () => tree.unmount()); }
});
