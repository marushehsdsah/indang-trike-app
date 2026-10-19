#!/usr/bin/env node
// Starts the Expo dev server for the development build and opens the app on
// the running Android emulator once the server is up. Saved changes then
// appear on the emulator without building or installing an APK.
//
// Usage: npm run dev            (extra Expo flags after --, e.g. npm run dev -- --clear)
//
// Needs the development build installed once (npm run android, or
// cd android && ./gradlew installDebug). The app is opened here rather than by
// Expo because the emulator's Android 17 image does not resolve Expo's
// exp+indang-trike-app:// link on its own; naming the activity directly works.
const { spawn, execFileSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const PORT = 8081;
const ACTIVITY = 'com.indanggo.app/.MainActivity';
// 10.0.2.2 is the emulator's address for this PC. (adb reverse, which would let
// it use localhost instead, silently does not forward on this emulator image.)
const DEV_LINK = `exp+indang-trike-app://expo-development-client/?url=${encodeURIComponent(`http://10.0.2.2:${PORT}`)}`;
const ADB = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb') : 'adb';

const expo = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--dev-client', '--port', String(PORT), ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: path.join(__dirname, '..') });
expo.on('exit', (code) => process.exit(code ?? 0));

// Passes the response body to callback, or '' if the request fails.
function getText(url, headers, callback) {
  http.get(url, { headers }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => callback(body));
  }).on('error', () => callback(''));
}

// Polls the dev server until it answers, for up to two minutes.
function whenServerReady(callback, attemptsLeft = 120) {
  getText(`http://localhost:${PORT}/status`, {}, (body) => {
    if (body.includes('packager-status:running')) callback();
    else if (attemptsLeft > 0) setTimeout(() => whenServerReady(callback, attemptsLeft - 1), 1000);
  });
}

// The app's launcher gives up after about 15 s, but the first bundle after the
// server starts takes longer (minutes after --clear). Building it here first
// means the app's own request is answered from memory in a few seconds.
function prepareBundle(callback) {
  console.log('\nPreparing the app\'s code. The first run after --clear can take about two minutes…\n');
  getText(`http://localhost:${PORT}/`, { 'expo-platform': 'android', accept: 'application/expo+json,application/json' }, (manifest) => {
    let bundleUrl;
    try { bundleUrl = JSON.parse(manifest).launchAsset.url; } catch { return callback(); }
    getText(bundleUrl, {}, () => callback());
  });
}

whenServerReady(() => prepareBundle(() => {
  try {
    execFileSync(ADB, ['shell', 'am', 'start', '-n', ACTIVITY, '-a', 'android.intent.action.VIEW', '-d', `'${DEV_LINK}'`], { stdio: 'ignore' });
    console.log('\nOpening IndangGO on the emulator…\n');
  } catch {
    console.log('\nNo emulator found. Start it, then run npm run dev again (or open IndangGO and choose this server).\n');
  }
}));
