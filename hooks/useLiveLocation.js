import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { isFreshFix } from '../utils/rideState';
import { isInIndangServiceArea } from '../data/indangMap';

function measuredFix(position) {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy,
    timestamp: position.timestamp, heading: position.coords.heading, speed: position.coords.speed };
}
const MESSAGES = {
  idle: 'GPS is off while you are offline.', locating: 'Waiting for GPS…', denied: 'Location permission is off. Enable it in Settings.',
  approximate: 'IndangGO only has your approximate location. Allow precise location in Settings.',
  disabled: 'Turn on location services to use GPS.', inaccurate: 'GPS accuracy is low. Move to an open area.',
  stale: 'GPS signal is stale. Waiting for a fresh location.',
  unavailable: 'Could not get your location. Check GPS and try again.', ready: 'Live GPS',
};
// Android pauses the app while it shows a system dialog, which stops GPS; if
// starting GPS showed the dialog again, the two would loop. So GPS never asks
// to turn on Google's location accuracy (plain GPS works without it), and the
// permission is requested once automatically, then only when the user retries.
const WATCH_OPTIONS = { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false };
const CURRENT_OPTIONS = { accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false };

// GPS is tracked everywhere. Whether the fix is inside Indang is reported
// separately (`inServiceArea`), because only booking and matching need Indang.
export default function useLiveLocation(enabled) {
  const [fix, setFix] = useState(null), [status, setStatus] = useState('idle'), [retryKey, setRetryKey] = useState(0);
  const generation = useRef(0);
  // The latest usable fix and whether readings since then were too inaccurate.
  const usable = useRef(null), lowAccuracy = useRef(false);
  const asked = useRef(false), askOnStart = useRef(false);
  const apply = useCallback((position) => {
    const next = measuredFix(position);
    if (!isFreshFix(next)) {
      // Indoors, accuracy hovers around the limit; one poor reading keeps a
      // usable fix until it goes stale rather than switching GPS off and on.
      lowAccuracy.current = true;
      if (!isFreshFix(usable.current)) { usable.current = null; setFix(null); setStatus('inaccurate'); }
      return next;
    }
    lowAccuracy.current = false;
    if (!usable.current || next.timestamp >= usable.current.timestamp) usable.current = next;
    setFix(usable.current);
    setStatus('ready');
    return next;
  }, []);
  const permission = useCallback(async (ask) => {
    if (!await Location.hasServicesEnabledAsync()) { setStatus('disabled'); throw new Error(MESSAGES.disabled); }
    let result = await Location.getForegroundPermissionsAsync();
    const precise = result.status === 'granted' && result.android?.accuracy !== 'coarse';
    if (!precise && result.canAskAgain !== false && (ask || !asked.current)) {
      asked.current = true;
      result = await Location.requestForegroundPermissionsAsync();
    }
    if (result.status !== 'granted') { setStatus('denied'); throw new Error(MESSAGES.denied); }
    if (result.android?.accuracy === 'coarse') { setStatus('approximate'); throw new Error(MESSAGES.approximate); }
  }, []);
  const getCurrentFix = useCallback(async () => {
    setStatus('locating');
    await permission(true);
    let timer;
    try {
      const position = await Promise.race([
        Location.getCurrentPositionAsync(CURRENT_OPTIONS),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('GPS timed out. Move to an open area and retry.')), 12000); }),
      ]);
      const next = apply(position);
      if (!isFreshFix(next)) throw new Error(MESSAGES.inaccurate);
      return next;
    } finally { clearTimeout(timer); }
  }, [permission, apply]);

  useEffect(() => {
    const current = ++generation.current;
    let subscription;
    usable.current = null; lowAccuracy.current = false;
    if (!enabled) { setFix(null); setStatus('idle'); return undefined; }
    setFix(null); setStatus('locating');
    const ask = askOnStart.current;
    askOnStart.current = false;
    (async () => {
      try {
        await permission(ask);
        if (current !== generation.current) return;
        subscription = await Location.watchPositionAsync(
          WATCH_OPTIONS,
          (position) => { if (current === generation.current) apply(position); },
          () => { if (current === generation.current) setStatus('unavailable'); },
        );
        if (current !== generation.current) subscription.remove();
      } catch { if (current === generation.current) setStatus((value) => ['denied', 'approximate', 'disabled'].includes(value) ? value : 'unavailable'); }
    })();
    return () => { generation.current += 1; subscription?.remove(); };
  }, [enabled, retryKey, permission, apply]);
  useEffect(() => {
    if (!enabled || !fix) return undefined;
    const timer = setInterval(() => {
      if (!isFreshFix(fix)) setStatus((value) => value === 'ready' ? (lowAccuracy.current ? 'inaccurate' : 'stale') : value);
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, fix]);
  // A retry is the user asking, so it may show the permission prompt again.
  const retry = useCallback(() => { askOnStart.current = true; setRetryKey((value) => value + 1); }, []);
  const inServiceArea = useMemo(() => (fix ? isInIndangServiceArea(fix) : null), [fix]);
  return { fix, status, inServiceArea, message: MESSAGES[status], retry, getCurrentFix };
}
