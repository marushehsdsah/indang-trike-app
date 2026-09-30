import React from 'react';
import { Pressable, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

export default function ConnectionBanner() {
  const { connected, error, refresh, syncing } = useApp();
  if (connected && !error) return null;
  return <Pressable accessibilityRole="button" onPress={refresh} style={{ backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm }}>
    <Text style={[TYPE.caption, { color: COLORS.danger }]}>{error || (syncing ? 'Reconnecting and restoring your trip…' : 'Live connection lost. Tap to refresh.')}</Text>
  </Pressable>;
}
