import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../../theme';

// Every screen's outer shell: the safe area it keeps clear, its background, and
// the status bar style that suits it. `edges` follows react-native-safe-area-
// context, so a screen with its own bottom sheet can opt out of the bottom inset.
export default function Screen({
  children,
  background = COLORS.canvas,
  statusBarStyle = 'dark',
  edges = ['top'],
  style,
}) {
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background }, style]} edges={edges}>
      <StatusBar style={statusBarStyle} />
      {children}
    </SafeAreaView>
  );
}

// Full-bleed screens (maps) draw under the status bar and handle insets themselves.
export function BleedScreen({ children, statusBarStyle = 'dark', background = COLORS.canvas, style }) {
  return (
    <View style={[styles.screen, { backgroundColor: background }, style]}>
      <StatusBar style={statusBarStyle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
