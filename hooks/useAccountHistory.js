import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { readSessionCache, updateSessionCache } from '../services/sessionCache';
import { trimHistory } from '../utils/offlineSession';

// History and totals from the server, falling back to the copy saved on the
// phone (fromCache) when the server cannot be reached.
export default function useAccountHistory() {
  const { request, ride, user } = useApp();
  const [saved] = useState(() => { const cache = readSessionCache(); return cache?.user?.id === user?.id ? cache : null; });
  const [rides, setRides] = useState(saved?.history || []), [stats, setStats] = useState(saved?.stats || null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [fromCache, setFromCache] = useState(Boolean(saved?.history));
  const userId = user?.id;
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [history, totals] = await Promise.all([request('/history'), request('/stats')]);
      setRides(history.rides); setStats(totals); setError(null); setFromCache(false);
      updateSessionCache(userId, { history: trimHistory(history.rides), stats: totals });
    } catch (failure) {
      const cache = readSessionCache();
      if (cache?.user?.id === userId && cache.history) { setRides(cache.history); setStats(cache.stats || null); setFromCache(true); setError(null); }
      else setError(failure.message);
    }
    finally { setLoading(false); }
  }, [request, userId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload, ride?.status]));
  return { rides, stats, loading, error, fromCache, reload };
}
