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
      <StatusBarStyle style={statusBarStyle} />
      {children}
    </SafeAreaView>
  );
}

// Full-bleed screens (maps) draw under the status bar and handle insets themselves.
export function BleedScreen({ children, statusBarStyle = 'dark', background = COLORS.canvas, style }) {
  return (
    <View style={[styles.screen, { backgroundColor: background }, style]}>
      <StatusBarStyle style={statusBarStyle} />
      {children}
    </View>
  );
}

// The status bar is set again only when its style changes; re-rendering it
// with every GPS update sends the same style to Android each time.
const StatusBarStyle = React.memo(function StatusBarStyle({ style }) {
  return <StatusBar style={style} />;
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
