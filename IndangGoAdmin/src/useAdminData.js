// =============================================================
// useAdminData.js
// -------------------------------------------------------------
// Loads one screen's data — 'dashboard', 'accounts' or 'trips' —
// through the session (session.js): from the API inside the
// IndangGO app, or the mock data when this runs on its own.
//
// Returns { data, loading, refreshing, error, reload, refresh }:
// - data is null until the first load succeeds, then the latest.
// - reload() tries again after a failed first load; refresh() is
//   for pull-to-refresh. A failed refresh keeps the data already
//   shown and sets error.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSession } from './session';

export default function useAdminData(name) {
  const { load } = useAdminSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Only the latest request may update the screen, and none after it closes.
  const latest = useRef(0);

  const fetchData = useCallback(async (pulled) => {
    const request = ++latest.current;
    if (pulled) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await load(name);
      if (request === latest.current) setData(result);
    } catch (failure) {
      if (request === latest.current) setError(failure.message || 'Could not load. Try again.');
    } finally {
      if (request === latest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [load, name]);

  useEffect(() => {
    fetchData(false);
    return () => { latest.current += 1; };
  }, [fetchData]);

  const reload = useCallback(() => fetchData(false), [fetchData]);
  const refresh = useCallback(() => fetchData(true), [fetchData]);
  return { data, loading, refreshing, error, reload, refresh };
}
