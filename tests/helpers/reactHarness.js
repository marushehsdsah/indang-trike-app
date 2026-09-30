const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { transformSync } = require('@babel/core');
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function loadSource(relativePath, mocks) {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  });
  const moduleValue = { exports: {} }, nativeRequire = createRequire(filename);
  new Function('require', 'module', 'exports', code)((id) => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id), moduleValue, moduleValue.exports);
  return moduleValue.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { await renderer.act(async () => { await new Promise((resolve) => setImmediate(resolve)); }); }

const GPS_OFF = { fix: null, status: 'idle', retry: () => {}, getCurrentFix: async () => null };

async function mountApp(service, role = 'passenger', gps = GPS_OFF) {
  const stateEvents = new EventEmitter(), sockets = [];
  const account = { id: 'account-one', firstName: 'Real', lastName: 'User', role, available: false, profileComplete: true };
  const snapshot = { user: account, ride: null, offer: null, lastRide: null, serverTime: Date.now() };
  const location = { current: gps };
  const requestApi = async (route, options) => {
    const supplied = service?.(route, options, snapshot);
    if (supplied !== undefined) return supplied;
    if (route === '/login') return { token: 'session-one', user: account };
    if (route === '/state') return snapshot;
    if (route === '/config') return { fare: 45 };
    if (route === '/logout') return { ok: true };
    return {};
  };
  const mocks = {
    'react-native': { AppState: { currentState: 'active', addEventListener: (name, handler) => { stateEvents.on(name, handler); return { remove: () => stateEvents.off(name, handler) }; } } },
    'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} },
    'socket.io-client': { io: () => {
      const socket = new EventEmitter(); socket.disconnect = () => socket.emit('disconnect', 'io client disconnect'); sockets.push(socket);
      queueMicrotask(() => socket.emit('connect')); return socket;
    } },
    '../services/api': { API_BASE_URL: 'http://test', requestApi },
    '../hooks/useLiveLocation': { __esModule: true, default: () => location.current },
  };
  const { AppProvider, useApp } = loadSource('context/AppContext.js', mocks);
  let value, tree;
  function Consumer() { value = useApp(); return null; }
  await renderer.act(async () => { tree = renderer.create(React.createElement(AppProvider, null, React.createElement(Consumer))); });
  await flush();
  return { get value() { return value; }, snapshot, account, sockets, stateEvents, location,
    close: async () => renderer.act(async () => tree.unmount()) };
}

module.exports = { loadSource, deferred, flush, mountApp, React, renderer };
