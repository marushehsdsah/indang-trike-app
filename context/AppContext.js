import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';
import { API_BASE_URL, requestApi } from '../services/api';
import useLiveLocation from '../hooks/useLiveLocation';
import { ACTIVE_STATUSES, ASSIGNED_STATUSES, isFreshFix, mergeRide } from '../utils/rideState';

const Context = createContext(null);
const TOKEN_KEY = 'indanggo.session';

export function AppProvider({ children }) {
  const [token, setToken] = useState(null), [user, setUser] = useState(null), [ride, setRide] = useState(null), [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [connected, setConnected] = useState(false), [syncing, setSyncing] = useState(false);
  const [config, setConfig] = useState(null), [serverOffset, setServerOffset] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const tokenRef = useRef(null), socketRef = useRef(null), refreshSequence = useRef(0), current = useRef(null);
  const sessionGeneration = useRef(0), configRef = useRef(null);
  const activeRide = ride && ACTIVE_STATUSES.includes(ride.status), assignedRide = ride && ASSIGNED_STATUSES.includes(ride.status);
  // Passengers track GPS whenever the app is open; drivers while online or on a trip.
  const gps = useLiveLocation(Boolean(user) && foreground && (user.role === 'driver' ? (user.available || Boolean(activeRide)) : true));
  current.current = { user, ride, token, foreground, gps, connected };

  const clearSession = useCallback(async () => {
    sessionGeneration.current += 1; tokenRef.current = null; configRef.current = null; refreshSequence.current += 1; socketRef.current?.disconnect();
    setToken(null); setUser(null); setRide(null); setOffer(null); setConfig(null); setConnected(false);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);
  const request = useCallback(async (path, body, method) => {
    const requestToken = tokenRef.current;
    try { return await requestApi(path, { token: requestToken, body, method }); }
    catch (failure) {
      if (failure.status === 401 && tokenRef.current === requestToken) await clearSession();
      throw failure;
    }
  }, [clearSession]);
  const applyState = useCallback((state) => {
    setUser(state.user); setOffer(state.offer);
    setServerOffset(state.serverTime - Date.now());
    setRide((previous) => mergeRide(previous, state.ride || (previous?.id === state.lastRide?.id ? state.lastRide : null)));
  }, []);
  const refresh = useCallback(async () => {
    if (!tokenRef.current) return;
    const requestToken = tokenRef.current, sequence = ++refreshSequence.current;
    setSyncing(true);
    try {
      const [state, settings] = await Promise.all([request('/state'), configRef.current || request('/config')]);
      if (requestToken === tokenRef.current && sequence === refreshSequence.current) {
        configRef.current = settings; setConfig(settings); applyState(state); setError(null);
      }
      return state;
    } catch (failure) { if (requestToken === tokenRef.current) setError(failure.message); }
    finally { if (sequence === refreshSequence.current) setSyncing(false); }
  }, [request, applyState]);
  const restore = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!saved) return;
      tokenRef.current = saved;
      const [state, settings] = await Promise.all([request('/state'), request('/config')]);
      if (tokenRef.current !== saved) return;
      configRef.current = settings; applyState(state); setConfig(settings); setToken(saved);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [request, applyState]);
  useEffect(() => { restore(); }, [restore]);
  const signIn = useCallback(async (phone, password) => {
    const generation = ++sessionGeneration.current;
    const result = await requestApi('/login', { body: { phone, password } });
    if (generation !== sessionGeneration.current) return;
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
    if (generation !== sessionGeneration.current) return;
    configRef.current = null;
    tokenRef.current = result.token; setToken(result.token); setUser(result.user); setError(null);
    await refresh();
  }, [refresh]);
  const signOut = useCallback(async () => {
    const previousToken = tokenRef.current;
    await clearSession(); setError(null);
    if (previousToken) await requestApi('/logout', { token: previousToken, body: {} });
  }, [clearSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active'; setForeground(active);
      if (!active) {
        if (current.current.user?.role === 'driver') request('/driver/availability', { available: false }).catch(() => {});
        socketRef.current?.disconnect(); setConnected(false);
      }
    });
    return () => subscription.remove();
  }, [request]);
  useEffect(() => {
    if (!token || !foreground) return undefined;
    const socket = io(API_BASE_URL, { auth: { token }, transports: ['websocket'], reconnectionDelayMax: 5000 });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); refresh(); });
    socket.on('disconnect', (reason) => { setConnected(false); if (reason === 'io server disconnect') refresh(); });
    socket.on('connect_error', () => { setConnected(false); refresh(); });
    socket.on('state:changed', refresh);
    socket.on('driver:location', ({ rideId, location, connected: driverConnected }) => {
      setRide((previous) => previous?.id === rideId && ACTIVE_STATUSES.includes(previous.status) && (previous.driverLocation?.timestamp ?? 0) <= location.timestamp
        ? { ...previous, driverLocation: location, driverConnected, driverLocationAvailable: true } : previous);
    });
    socket.on('passenger:location', ({ rideId, location }) => {
      setRide((previous) => previous?.id === rideId && ASSIGNED_STATUSES.includes(previous.status) && (previous.passengerLocation?.timestamp ?? 0) <= location.timestamp
        ? { ...previous, passengerLocation: location } : previous);
    });
    const timer = setInterval(refresh, 15000);
    return () => { clearInterval(timer); socket.removeAllListeners(); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [token, foreground, refresh]);

  // Drivers publish GPS while online or on a trip; passengers only to the driver
  // holding their ride.
  const lastPublish = useRef({ timestamp: 0, wall: 0 });
  const driver = user?.role === 'driver';
  const publishing = Boolean(user) && foreground && connected && (driver ? (user.available || Boolean(activeRide)) : Boolean(assignedRide));
  useEffect(() => {
    if (!publishing || gps.status !== 'ready' || !isFreshFix(gps.fix)) return;
    const interval = activeRide ? 2000 : 5000;
    if (gps.fix.timestamp <= lastPublish.current.timestamp || Date.now() - lastPublish.current.wall < interval) return;
    lastPublish.current = { timestamp: gps.fix.timestamp, wall: Date.now() };
    const generation = sessionGeneration.current;
    request(driver ? '/driver/location' : '/passenger/location', gps.fix).catch((failure) => { if (generation === sessionGeneration.current) setError(failure.message); });
  }, [gps.fix, gps.status, publishing, driver, activeRide, request]);

  useEffect(() => {
    if (user?.role !== 'driver' || !foreground || !connected || (!user.available && !activeRide) || !['inaccurate', 'stale', 'denied', 'disabled', 'unavailable'].includes(gps.status)) return;
    const generation = sessionGeneration.current;
    request('/driver/location/unavailable', { reason: gps.status }).then(() => {
      if (generation === sessionGeneration.current) refresh();
    }).catch((failure) => { if (generation === sessionGeneration.current) setError(failure.message); });
  }, [gps.status, user?.role, user?.available, foreground, connected, Boolean(activeRide), request, refresh]);

  const setAvailable = useCallback(async (available) => {
    const generation = sessionGeneration.current;
    if (available) {
      if (!current.current.connected || !current.current.foreground) throw new Error('Connect to live updates before going online.');
      const fix = await current.current.gps.getCurrentFix();
      if (generation !== sessionGeneration.current) return;
      if (!current.current.foreground) throw new Error('Keep the app open to go online.');
      await request('/driver/location', fix);
    }
    if (generation !== sessionGeneration.current) return;
    const state = await request('/driver/availability', { available });
    if (generation !== sessionGeneration.current) return;
    refreshSequence.current += 1; applyState(state); setSyncing(false);
  }, [request, applyState]);
  const bookRide = useCallback(async (payload) => {
    const generation = sessionGeneration.current;
    try {
      const { trip, passengers, note, idempotencyKey } = payload;
      const result = await request('/rides', { trip, passengers, note, idempotencyKey });
      if (generation !== sessionGeneration.current) return;
      refreshSequence.current += 1;
      setRide((previous) => mergeRide(previous, result.ride)); await refresh(); return result.ride;
    } catch (failure) { if (generation === sessionGeneration.current) await refresh(); throw failure; }
  }, [request, refresh]);
  const rideAction = useCallback(async (id, action, body = {}) => {
    const generation = sessionGeneration.current;
    try {
      const result = await request(`/rides/${id}/${action}`, body);
      if (generation !== sessionGeneration.current) return;
      refreshSequence.current += 1;
      if (result.ride) setRide((previous) => mergeRide(previous, result.ride));
      await refresh(); return result;
    } catch (failure) { if (generation === sessionGeneration.current) await refresh(); throw failure; }
  }, [request, refresh]);
  const dismissRide = useCallback(() => setRide((previous) => previous && ACTIVE_STATUSES.includes(previous.status) ? previous : null), []);

  return <Context.Provider value={{ user, ride, offer, token, loading, error, connected, syncing, config, gps, foreground, serverOffset,
    request, refresh, restore, signIn, signOut, setAvailable, bookRide, rideAction, dismissRide, clearError: () => setError(null) }}>{children}</Context.Provider>;
}
export const useApp = () => useContext(Context);
