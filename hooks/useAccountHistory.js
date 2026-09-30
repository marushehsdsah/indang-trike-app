import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';

export default function useAccountHistory() {
  const { request, ride } = useApp();
  const [rides, setRides] = useState([]), [stats, setStats] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [history, totals] = await Promise.all([request('/history'), request('/stats')]);
      setRides(history.rides); setStats(totals); setError(null);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [request]);
  useFocusEffect(useCallback(() => { reload(); }, [reload, ride?.status]));
  return { rides, stats, loading, error, reload };
}
