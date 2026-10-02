import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

export const OFFLINE_MESSAGE = 'You are offline. Saved maps, search, routes and the GPS guide still work; booking and live trips need internet.';

export default function ConnectionBanner() {
  const { connected, error, online, refresh, syncing } = useApp();
  if (!online) return <View accessibilityRole="alert" style={{ backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm }}>
    <Text style={[TYPE.caption, { color: COLORS.inkSecondary }]}>{OFFLINE_MESSAGE}</Text>
  </View>;
  if (connected && !error) return null;
  return <Pressable accessibilityRole="button" onPress={refresh} style={{ backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm }}>
    <Text style={[TYPE.caption, { color: COLORS.danger }]}>{error || (syncing ? 'Connecting to IndangGO…' : 'Not connected to IndangGO. Tap to retry; a sleeping server takes up to a minute to wake.')}</Text>
  </Pressable>;
}
