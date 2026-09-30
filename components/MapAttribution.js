import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS } from '../theme';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from './mapStyles';

function openCopyright() {
  Linking.openURL(MAP_ATTRIBUTION_URL).catch(() => {});
}

// Map data credit, kept visible just above whatever sheet covers the map.
export default function MapAttribution({ bottom }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.attribution, { bottom }, pressed && styles.pressed]}
      onPress={openCopyright}
      accessibilityRole="link"
      accessibilityLabel="Map data copyright and licence"
    >
      <Text style={styles.text}>{MAP_ATTRIBUTION}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attribution: {
    position: 'absolute', right: 8,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  text: { fontSize: 10, color: COLORS.ink },
  pressed: { opacity: 0.8 },
});
