const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, flush, React, renderer } = require('./helpers/reactHarness');
const { DEFAULT_TRIP, isInIndangServiceArea } = require('../data/indangMap');
const { getRoadGraph } = require('../data/roadNetwork');
const { resolveBookingRoute } = require('../utils/bookingRoute');

// The trip screen with its map and controls drawn as plain elements, and the
// app's state supplied directly: the phone has lost its link to the server.
const host = (name) => name;
const anything = new Proxy({}, { get: () => 0 });
const navigation = { calls: [] };
for (const method of ['navigate', 'setParams', 'reset', 'goBack']) navigation[method] = (...args) => navigation.calls.push([method, ...args]);
let app = null;
const OFFLINE_PILL = { tone: 'offline', icon: 'wifi-off', label: 'status.offline' };
const mocks = {
  react: React,
  'react-native': {
    View: host('View'), Text: host('Text'), Pressable: host('Pressable'), ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles) => styles }, Alert: { alert: () => {} }, useWindowDimensions: () => ({ width: 400, height: 800 }),
  },
  '@maplibre/maplibre-react-native': { GeoJSONSource: host('GeoJSONSource'), Layer: host('Layer'), ViewAnnotation: host('ViewAnnotation') },
  '@expo/vector-icons': { MaterialCommunityIcons: host('Icon') },
  '../components/RouteMap': { __esModule: true, default: React.forwardRef(({ children }, ref) => React.createElement('RouteMap', null, children)) },
  '../components/StatusPill': { __esModule: true, default: host('StatusPill') },
  '../components/Plate': { __esModule: true, default: host('Plate') },
  '../components/LiveLocationMarker': { __esModule: true, default: host('LiveLocationMarker') },
  '../components/RideDetails': { PersonRow: host('PersonRow'), TripFacts: host('TripFacts') },
  '../components/RatingPrompt': { __esModule: true, default: host('RatingPrompt') },
  '../components/ReportPrompt': { __esModule: true, default: host('ReportPrompt') },
  '../components/ChatSheet': { __esModule: true, default: host('ChatSheet') },
  '../components/ChatNotice': { __esModule: true, default: host('ChatNotice') },
  '../components/ui/KeyboardAwareScrollView': { __esModule: true, default: host('KeyboardAwareScrollView') },
  '../hooks/useKeyboardHeight': { __esModule: true, default: () => 0 },
  '../hooks/useReducedMotion': { __esModule: true, default: () => true },
  '../components/map/MapChrome': {
    FloatingCard: host('FloatingCard'), MapTop: host('MapTop'),
    MapBottom: ({ rail, children }) => React.createElement('MapBottom', null, React.createElement('Rail', null, rail), children),
  },
  '../components/ui/Screen': { BleedScreen: host('BleedScreen') },
  '../components/ui/Button': { __esModule: true, default: host('Button') },
  '../components/ui/IconButton': { __esModule: true, default: host('IconButton') },
  '../components/ui/Surfaces': { Divider: host('Divider'), Money: host('Money') },
  '../hooks/useMapStatus': { useConnectionStatus: () => (app.connected ? null : OFFLINE_PILL), useGpsStatus: () => ({ tone: 'live', label: 'status.live' }) },
  '../context/AppContext': { useApp: () => app },
  '../i18n': { useI18n: () => ({ t: (key) => key }) },
  '../utils/feedback': { tapFeedback: () => {} },
  '../theme': { COLORS: anything, ELEVATION: anything, RADIUS: anything, SPACE: anything, TYPE: anything },
};
const ActiveRideScreen = loadSource('screens/ActiveRideScreen.js', mocks).default;

const tripRoute = resolveBookingRoute({ roadGraph: getRoadGraph(), pickup: DEFAULT_TRIP.pickup, destination: DEFAULT_TRIP.dropoff, isInServiceArea: isInIndangServiceArea });
const fixAt = ({ latitude, longitude }) => ({ latitude, longitude, accuracy: 8, timestamp: Date.now(), heading: null, speed: null });
const passenger = { id: 'passenger-one', firstName: 'Ana', lastName: 'Cruz', rating: null };

function state({ status, at, gpsStatus = 'ready', connected = false, role = 'driver' }) {
  return {
    user: { id: role === 'driver' ? 'driver-one' : 'passenger-one', role, tester: false },
    ride: { id: 'ride-one', version: 3, status, trip: DEFAULT_TRIP, route: tripRoute.details, passengers: 1, fare: 45,
      passenger, driver: { id: 'driver-one', firstName: 'Ben', plate: 'ABC 123', toda: 'ITODA' }, driverLocation: null, passengerLocation: null,
      driverConnected: false, driverLocationAvailable: false, unreadMessages: 0 },
    gps: { status: gpsStatus, fix: gpsStatus === 'ready' ? fixAt(at) : null, retry: () => {} },
    connected, online: connected, serverOffset: 0, chat: { rideId: null, messages: [] },
    rideAction: async () => {}, dismissRide: () => {}, loadChat: async () => {},
  };
}
async function render(current) {
  app = current; navigation.calls = [];
  let tree;
  await renderer.act(async () => { tree = renderer.create(React.createElement(ActiveRideScreen, { navigation, route: { params: {} } })); });
  await flush();
  return tree;
}
const navigateButton = (tree) => tree.root.findAll((node) => node.type === 'Button' && node.props.label === 'active.navigate')[0] ?? null;

test('the test trip has a route on the offline road graph', () => {
  assert.equal(tripRoute.status, 'ok');
});

test('offline on the way to the pickup, the driver can still open turn-by-turn to the passenger', async () => {
  const tree = await render(state({ status: 'accepted', at: DEFAULT_TRIP.dropoff.coordinate }));
  try {
    const button = navigateButton(tree);
    assert.ok(button, 'the Navigate button is shown without the server link');
    await renderer.act(async () => { button.props.onPress(); });
    const [method, screen, params] = navigation.calls.at(-1);
    assert.equal(method, 'navigate');
    assert.equal(screen, 'Navigation');
    assert.equal(params.rideId, 'ride-one');
    assert.deepEqual(params.trip.dropoff, DEFAULT_TRIP.pickup, 'it leads to the pickup');
    assert.ok(params.route.coordinates.length > 1, 'with a road route found on the phone');
  } finally { await renderer.act(async () => tree.unmount()); }
});

test('offline during the trip, the driver can still open turn-by-turn to the drop-off', async () => {
  const tree = await render(state({ status: 'in_progress', at: DEFAULT_TRIP.pickup.coordinate }));
  try {
    const button = navigateButton(tree);
    assert.ok(button, 'the Navigate button is shown without the server link');
    await renderer.act(async () => { button.props.onPress(); });
    const [, screen, params] = navigation.calls.at(-1);
    assert.equal(screen, 'Navigation');
    assert.deepEqual(params.trip.dropoff, DEFAULT_TRIP.dropoff);
    assert.ok(params.route.coordinates.length > 1);
  } finally { await renderer.act(async () => tree.unmount()); }
});

test('offline, the trip actions that need the server stay disabled', async () => {
  const tree = await render(state({ status: 'in_progress', at: DEFAULT_TRIP.dropoff.coordinate }));
  try {
    const complete = tree.root.findAll((node) => node.type === 'Button' && node.props.label === 'driver.action.complete')[0];
    assert.ok(complete, 'at the drop-off the Complete button is shown');
    assert.equal(complete.props.disabled, true, 'but completing waits for the connection');
    assert.ok(tree.root.findAll((node) => node.type === 'StatusPill' && node.props.tone === 'offline').length, 'the pill says the phone is offline');
  } finally { await renderer.act(async () => tree.unmount()); }
});

test('without a live GPS fix there is nothing to navigate from, online or not', async () => {
  for (const connected of [false, true]) {
    const tree = await render(state({ status: 'accepted', at: DEFAULT_TRIP.dropoff.coordinate, gpsStatus: 'stale', connected }));
    try { assert.equal(navigateButton(tree), null); }
    finally { await renderer.act(async () => tree.unmount()); }
  }
});

test('online, the driver keeps the Navigate button as before', async () => {
  const tree = await render(state({ status: 'accepted', at: DEFAULT_TRIP.dropoff.coordinate, connected: true }));
  try { assert.ok(navigateButton(tree)); }
  finally { await renderer.act(async () => tree.unmount()); }
});

test('the driver sees how many passengers to pick up under the passenger\'s name', async () => {
  const { translate } = require('../i18n/translate');
  const tree = await render(state({ status: 'accepted', at: DEFAULT_TRIP.dropoff.coordinate, connected: true }));
  try {
    const [row] = tree.root.findAll((node) => node.type === 'PersonRow');
    assert.equal(row.props.person, passenger);
    assert.equal(row.props.subtitle, 'trip.riders');
    assert.equal(translate('en', 'trip.riders', { count: 3 }), 'Passengers: 3');
    assert.equal(translate('fil', 'trip.riders', { count: 3 }), 'Pasahero: 3');
  } finally { await renderer.act(async () => tree.unmount()); }
});

test('a passenger never gets the Navigate button', async () => {
  const tree = await render(state({ status: 'in_progress', at: DEFAULT_TRIP.pickup.coordinate, connected: true, role: 'passenger' }));
  try { assert.equal(navigateButton(tree), null); }
  finally { await renderer.act(async () => tree.unmount()); }
});
