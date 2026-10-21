import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { io } from 'socket.io-client';
import { API_BASE_URL, requestApi } from '../services/api';
import { clearSessionCache, readSessionCache, writeSessionCache } from '../services/sessionCache';
import useLiveLocation from '../hooks/useLiveLocation';
import { canOpenOffline, getSessionExpiry } from '../utils/offlineSession';
import { ACTIVE_STATUSES, ASSIGNED_STATUSES, isFreshFix, mergeRide, toServerClock } from '../utils/rideState';
import { markRead, mergeMessages, newClientId, pendingMessage } from '../utils/chatThread';

const Context = createContext(null);
const TOKEN_KEY = 'indanggo.session';
// With a saved offline copy, startup waits this long for the server before
// opening from the copy; a quick answer still opens straight onto a live ride.
const OFFLINE_START_WAIT_MS = 3000;
// The chat of one ride: its messages, including those still being sent.
const NO_CHAT = { rideId: null, messages: [], loaded: false };

export function AppProvider({ children }) {
  const [token, setToken] = useState(null), [user, setUser] = useState(null), [ride, setRide] = useState(null), [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [connected, setConnected] = useState(false), [syncing, setSyncing] = useState(false);
  const [config, setConfig] = useState(null), [serverOffset, setServerOffset] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  // Whether the phone has internet at all, as opposed to `connected`, which is
  // the live link to the IndangGO server.
  const [online, setOnline] = useState(true);
  // chatNotice is the last message that came in while its chat was closed.
  const [chat, setChat] = useState(NO_CHAT), [chatNotice, setChatNotice] = useState(null);
  const tokenRef = useRef(null), socketRef = useRef(null), refreshSequence = useRef(0), current = useRef(null);
  const sessionGeneration = useRef(0), configRef = useRef(null), expiresAtRef = useRef(null), persistedRef = useRef(null);
  // The ride whose chat is on screen; messages arriving there are read at once.
  const viewingChat = useRef(null);
  // When each ride's chat was last marked read (Infinity while that is being
  // sent). A snapshot asked for before then may still count those messages
  // as unread, so the phone's own count is kept instead.
  const chatReadAt = useRef(new Map());
  const activeRide = ride && ACTIVE_STATUSES.includes(ride.status);
  // Pilot admins can locate connected users while their app is open. Driver
  // availability remains a separate choice controlling ride requests. Admin
  // accounts do not ride, so their GPS is never tracked.
  const gps = useLiveLocation(Boolean(user) && foreground && user.role !== 'admin');
  current.current = { user, ride, token, foreground, gps, connected, serverOffset, chat };

  const clearSession = useCallback(async () => {
    sessionGeneration.current += 1; tokenRef.current = null; configRef.current = null; expiresAtRef.current = null; persistedRef.current = null;
    refreshSequence.current += 1; socketRef.current?.disconnect(); viewingChat.current = null; chatReadAt.current.clear();
    setToken(null); setUser(null); setRide(null); setOffer(null); setConfig(null); setConnected(false); setChat(NO_CHAT); setChatNotice(null);
    clearSessionCache();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);
  // Saves what the next start needs to open without internet. Called only with
  // a state the server just returned for the current token; refreshes every
  // 15 s, so the file is rewritten only when the profile or fares change.
  const persistSession = useCallback((sessionUser, settings) => {
    const signature = JSON.stringify([sessionUser, settings]);
    if (persistedRef.current === signature) return;
    persistedRef.current = signature;
    const previous = readSessionCache(), verifiedAt = Date.now();
    const sameUser = previous?.user?.id === sessionUser.id;
    expiresAtRef.current = getSessionExpiry({ loginExpiresAt: expiresAtRef.current, cachedExpiresAt: sameUser ? previous.expiresAt : undefined, verifiedAt });
    writeSessionCache({ ...(sameUser ? previous : {}), user: sessionUser, config: settings, expiresAt: expiresAtRef.current, verifiedAt });
  }, []);
  const request = useCallback(async (path, body, method) => {
    const requestToken = tokenRef.current;
    try { return await requestApi(path, { token: requestToken, body, method }); }
    catch (failure) {
      if (failure.status === 401 && tokenRef.current === requestToken) await clearSession();
      throw failure;
    }
  }, [clearSession]);
  // requestedAt is when the state was asked for, if known (see chatReadAt).
  const applyState = useCallback((state, requestedAt) => {
    setUser(state.user); setOffer(state.offer);
    setServerOffset(state.serverTime - Date.now());
    setRide((previous) => {
      const next = mergeRide(previous, state.ride || (previous?.id === state.lastRide?.id ? state.lastRide : null));
      const stale = next && previous?.id === next.id && next !== previous && (chatReadAt.current.get(next.id) ?? -Infinity) >= requestedAt;
      return stale ? { ...next, unreadMessages: previous.unreadMessages ?? 0 } : next;
    });
  }, []);
  const refresh = useCallback(async () => {
    if (!tokenRef.current) return;
    const requestToken = tokenRef.current, sequence = ++refreshSequence.current, requestedAt = Date.now();
    setSyncing(true);
    try {
      const [state, settings] = await Promise.all([request('/state'), configRef.current || request('/config')]);
      if (requestToken === tokenRef.current && sequence === refreshSequence.current) {
        configRef.current = settings; setConfig(settings); applyState(state, requestedAt); setError(null); persistSession(state.user, settings);
      }
      return state;
    } catch (failure) { if (requestToken === tokenRef.current) setError(failure.message); }
    finally { if (sequence === refreshSequence.current) setSyncing(false); }
  }, [request, applyState, persistSession]);
  const restore = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!saved) return;
      tokenRef.current = saved;
      const cached = readSessionCache(), offlineCopy = canOpenOffline(cached) ? cached : null;
      if (offlineCopy) expiresAtRef.current = offlineCopy.expiresAt;
      const verified = Promise.all([request('/state'), request('/config')]);
      let result = null, timer;
      if (offlineCopy) {
        // A failed or slow check opens from the copy; a 401 still logs out,
        // because request() clears the session whenever it arrives.
        verified.catch(() => {});
        const timeout = new Promise((resolve) => { timer = setTimeout(resolve, OFFLINE_START_WAIT_MS, null); });
        try { result = await Promise.race([verified, timeout]); } catch {} finally { clearTimeout(timer); }
      } else result = await verified;
      if (tokenRef.current !== saved) return;
      if (result) {
        const [state, settings] = result;
        configRef.current = settings; applyState(state); setConfig(settings); setToken(saved); persistSession(state.user, settings);
        return;
      }
      // configRef stays empty, so the first refresh online fetches current fares.
      setUser(offlineCopy.user); setConfig(offlineCopy.config); setToken(saved);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [request, applyState, persistSession]);
  useEffect(() => { restore(); }, [restore]);
  const signIn = useCallback(async (phone, password) => {
    const generation = ++sessionGeneration.current;
    const result = await requestApi('/login', { body: { phone, password } });
    if (generation !== sessionGeneration.current) return;
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
    if (generation !== sessionGeneration.current) return;
    configRef.current = null; expiresAtRef.current = result.expiresAt ?? null;
    tokenRef.current = result.token; setToken(result.token); setUser(result.user); setError(null);
    await refresh();
  }, [refresh]);
  const signOut = useCallback(async () => {
    const previousToken = tokenRef.current;
    await clearSession(); setError(null);
    if (previousToken) await requestApi('/logout', { token: previousToken, body: {} });
  }, [clearSession]);

  // Trip chat (utils/chat.js). Loads a ride's messages from the server,
  // keeping any still being sent.
  const loadChat = useCallback(async (rideId) => {
    const generation = sessionGeneration.current;
    const result = await request(`/rides/${rideId}/messages`);
    if (generation !== sessionGeneration.current) return;
    setChat((previous) => ({ rideId, loaded: true, messages: mergeMessages(previous.rideId === rideId ? previous.messages : [], result.messages) }));
  }, [request]);
  const markChatRead = useCallback(async (rideId) => {
    chatReadAt.current.set(rideId, Infinity);
    setRide((previous) => (previous?.id === rideId && previous.unreadMessages ? { ...previous, unreadMessages: 0 } : previous));
    setChatNotice((notice) => (notice?.rideId === rideId ? null : notice));
    try { await request(`/rides/${rideId}/messages/read`, {}); }
    finally { if (chatReadAt.current.get(rideId) === Infinity) chatReadAt.current.set(rideId, Date.now()); }
  }, [request]);
  // The chat screen calls this with its ride when it opens and null when it closes.
  const viewChat = useCallback((rideId) => {
    viewingChat.current = rideId;
    return rideId ? Promise.all([loadChat(rideId), markChatRead(rideId)]) : Promise.resolve();
  }, [loadChat, markChatRead]);
  const updateChat = useCallback((rideId, change) => setChat((previous) => (previous.rideId === rideId ? { ...previous, messages: change(previous.messages) } : previous)), []);
  // Sends a message the phone already shows as sending; it becomes the saved
  // copy, or "failed". A failure without a server answer (no internet) is
  // sent again when the live link comes back.
  const deliver = useCallback(async (rideId, message) => {
    const generation = sessionGeneration.current;
    try {
      const result = await request(`/rides/${rideId}/messages`, { clientId: message.clientId, ...(message.preset ? { preset: message.preset } : { text: message.text }) });
      if (generation === sessionGeneration.current) updateChat(rideId, (messages) => mergeMessages(messages, [result.message]));
    } catch (failure) {
      if (generation !== sessionGeneration.current) return;
      updateChat(rideId, (messages) => messages.map((item) => (item.clientId === message.clientId && !item.id
        ? { ...item, status: 'failed', error: failure.status ? failure.message : null, retry: !failure.status } : item)));
    }
  }, [request, updateChat]);
  // content is { text } or { preset }.
  const sendChat = useCallback((rideId, content) => {
    const me = current.current.user;
    const message = pendingMessage({ clientId: newClientId(), content, senderId: me.id, senderRole: me.role === 'driver' ? 'driver' : 'passenger' });
    setChat((previous) => (previous.rideId === rideId ? { ...previous, messages: [...previous.messages, message] } : { ...NO_CHAT, rideId, messages: [message] }));
    return deliver(rideId, message);
  }, [deliver]);
  const retryChat = useCallback((rideId, clientId) => {
    const { chat: shown } = current.current;
    const message = shown.rideId === rideId ? shown.messages.find((item) => item.clientId === clientId && item.status === 'failed') : null;
    if (!message) return Promise.resolve();
    updateChat(rideId, (messages) => messages.map((item) => (item.clientId === clientId && !item.id ? { ...item, status: 'sending', error: null, retry: false } : item)));
    return deliver(rideId, message);
  }, [deliver, updateChat]);
  const dismissChatNotice = useCallback(() => setChatNotice(null), []);

  useEffect(() => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)), []);
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
    // A chat on screen reloads too, for messages sent while the link was down.
    socket.on('connect', () => { setConnected(true); refresh(); if (viewingChat.current) loadChat(viewingChat.current).catch(() => {}); });
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
    // Both participants get every message, so the sender's other phones stay in step.
    socket.on('chat:message', ({ rideId, message }) => {
      updateChat(rideId, (messages) => mergeMessages(messages, [message]));
      if (message.senderId === current.current.user?.id) return;
      if (viewingChat.current === rideId) { markChatRead(rideId).catch(() => {}); return; }
      setRide((previous) => (previous?.id === rideId ? { ...previous, unreadMessages: (previous.unreadMessages ?? 0) + 1 } : previous));
      setChatNotice({ rideId, message });
    });
    socket.on('chat:read', ({ rideId, readerId, readAt }) => {
      if (readerId !== current.current.user?.id) { updateChat(rideId, (messages) => markRead(messages, readerId, readAt)); return; }
      // Read on another of this person's phones.
      chatReadAt.current.set(rideId, Date.now());
      setRide((previous) => (previous?.id === rideId && previous.unreadMessages ? { ...previous, unreadMessages: 0 } : previous));
      setChatNotice((notice) => (notice?.rideId === rideId ? null : notice));
    });
    const timer = setInterval(refresh, 15000);
    return () => { clearInterval(timer); socket.removeAllListeners(); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [token, foreground, refresh, loadChat, markChatRead, updateChat]);
  // Messages that failed for want of internet go out again once the link is back.
  useEffect(() => {
    if (!connected) return;
    const { rideId, messages } = current.current.chat;
    for (const message of messages) if (message.status === 'failed' && message.retry) retryChat(rideId, message.clientId);
  }, [connected, retryChat]);

  // The backend exposes these fixes to authorized pilot admins; private ride
  // events still reach only the assigned counterpart.
  const lastPublish = useRef({ timestamp: 0, wall: 0 });
  const driver = user?.role === 'driver';
  const publishing = Boolean(user) && foreground && connected;
  useEffect(() => {
    if (!publishing || gps.status !== 'ready' || !isFreshFix(gps.fix)) return;
    const interval = activeRide ? 2000 : 5000;
    if (gps.fix.timestamp <= lastPublish.current.timestamp || Date.now() - lastPublish.current.wall < interval) return;
    lastPublish.current = { timestamp: gps.fix.timestamp, wall: Date.now() };
    const generation = sessionGeneration.current;
    request(driver ? '/driver/location' : '/passenger/location', toServerClock(gps.fix, serverOffset)).catch((failure) => { if (generation === sessionGeneration.current) setError(failure.message); });
  }, [gps.fix, gps.status, publishing, driver, activeRide, request, serverOffset]);

  useEffect(() => {
    if (!user || !foreground || !connected || !['inaccurate', 'stale', 'denied', 'approximate', 'disabled', 'unavailable'].includes(gps.status)) return;
    const generation = sessionGeneration.current;
    request(driver ? '/driver/location/unavailable' : '/passenger/location/unavailable', { reason: gps.status }).then(() => {
      if (driver && generation === sessionGeneration.current) refresh();
    }).catch((failure) => { if (generation === sessionGeneration.current) setError(failure.message); });
  }, [gps.status, user?.id, driver, foreground, connected, request, refresh]);

  const setAvailable = useCallback(async (available) => {
    const generation = sessionGeneration.current;
    if (available) {
      if (!current.current.connected || !current.current.foreground) throw new Error('Connect to live updates before going online.');
      const fix = await current.current.gps.getCurrentFix();
      if (generation !== sessionGeneration.current) return;
      if (!current.current.foreground) throw new Error('Keep the app open to go online.');
      await request('/driver/location', toServerClock(fix, current.current.serverOffset));
    }
    if (generation !== sessionGeneration.current) return;
    const state = await request('/driver/availability', { available });
    if (generation !== sessionGeneration.current) return;
    refreshSequence.current += 1; applyState(state); setSyncing(false);
  }, [request, applyState]);
  const bookRide = useCallback(async (payload) => {
    const generation = sessionGeneration.current;
    try {
      const { trip, passengers, note, idempotencyKey, fareType, discounted } = payload;
      const result = await request('/rides', { trip, passengers, note, idempotencyKey, fareType, discounted });
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
  // Rates the other participant of a completed ride; returns the updated ride.
  const rateRide = useCallback(async (id, rating) => {
    const result = await request(`/rides/${id}/rating`, rating);
    if (result.ride) setRide((previous) => previous?.id === result.ride.id ? mergeRide(previous, result.ride) : previous);
    return result.ride;
  }, [request]);
  const dismissRide = useCallback(() => setRide((previous) => previous && ACTIVE_STATUSES.includes(previous.status) ? previous : null), []);

  return <Context.Provider value={{ user, ride, offer, token, loading, error, connected, online, syncing, config, gps, foreground, serverOffset,
    chat, chatNotice, loadChat, viewChat, sendChat, retryChat, dismissChatNotice,
    request, refresh, restore, signIn, signOut, setAvailable, bookRide, rideAction, rateRide, dismissRide, clearError: () => setError(null) }}>{children}</Context.Provider>;
}
export const useApp = () => useContext(Context);
