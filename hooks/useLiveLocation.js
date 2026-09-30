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
  disabled: 'Turn on location services to use GPS.', inaccurate: 'GPS accuracy is low. Move to an open area.',
  stale: 'GPS signal is stale. Waiting for a fresh location.',
  unavailable: 'Could not get your location. Check GPS and try again.', ready: 'Live GPS',
};

// GPS is tracked everywhere. Whether the fix is inside Indang is reported
// separately (`inServiceArea`), because only booking and matching need Indang.
export default function useLiveLocation(enabled) {
  const [fix, setFix] = useState(null), [status, setStatus] = useState('idle'), [retryKey, setRetryKey] = useState(0);
  const generation = useRef(0);
  const apply = useCallback((position) => {
    const next = measuredFix(position);
    if (!isFreshFix(next)) { setFix(null); setStatus('inaccurate'); return next; }
    setFix((previous) => previous && previous.timestamp > next.timestamp ? previous : next);
    setStatus('ready');
    return next;
  }, []);
  const permission = useCallback(async () => {
    if (!await Location.hasServicesEnabledAsync()) { setStatus('disabled'); throw new Error(MESSAGES.disabled); }
    const result = await Location.requestForegroundPermissionsAsync();
    if (result.status !== 'granted') { setStatus('denied'); throw new Error(MESSAGES.denied); }
  }, []);
  const getCurrentFix = useCallback(async () => {
    setStatus('locating');
    await permission();
    let timer;
    try {
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
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
    if (!enabled) { setFix(null); setStatus('idle'); return undefined; }
    setFix(null); setStatus('locating');
    (async () => {
      try {
        await permission();
        if (current !== generation.current) return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (position) => { if (current === generation.current) apply(position); },
          () => { if (current === generation.current) setStatus('unavailable'); },
        );
        if (current !== generation.current) subscription.remove();
      } catch { if (current === generation.current) setStatus((value) => ['denied', 'disabled'].includes(value) ? value : 'unavailable'); }
    })();
    return () => { generation.current += 1; subscription?.remove(); };
  }, [enabled, retryKey, permission, apply]);
  useEffect(() => {
    if (!enabled || !fix) return undefined;
    const timer = setInterval(() => { if (!isFreshFix(fix)) setStatus((value) => value === 'ready' ? 'stale' : value); }, 1000);
    return () => clearInterval(timer);
  }, [enabled, fix]);
  const retry = useCallback(() => setRetryKey((value) => value + 1), []);
  const inServiceArea = useMemo(() => (fix ? isInIndangServiceArea(fix) : null), [fix]);
  return { fix, status, inServiceArea, message: MESSAGES[status], retry, getCurrentFix };
}
