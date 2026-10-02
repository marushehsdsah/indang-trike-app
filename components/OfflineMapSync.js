import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { syncOfflineMap } from '../services/offlineMap';

// Keeps the offline map current for a signed-in user: checks it on start and
// whenever the app returns to the foreground or the internet comes back.
export default function OfflineMapSync() {
  const { user, online, foreground } = useApp();
  const signedIn = Boolean(user);
  useEffect(() => { if (signedIn && foreground) syncOfflineMap({ online }); }, [signedIn, online, foreground]);
  return null;
}
