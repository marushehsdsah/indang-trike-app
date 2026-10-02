import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapAttribution from '../MapAttribution';
import { COLORS, ELEVATION, RADIUS, SPACE } from '../../theme';

// The pieces every map screen is built from. Nothing here drags or scrolls
// with the map: a card floats 12 dp off the screen edges, the map buttons
// stack in a rail directly above it, and the map credit sits beside them, so
// buttons, credit, and card can never overlap.

// The floating card: one per trip stage.
export function FloatingCard({ children, style, onLayout }) {
  return <View style={[styles.card, style]} onLayout={onLayout}>{children}</View>;
}

// Overlays along the top of the map, below the status bar when `edge` is set.
export function MapTop({ children, edge = true, onHeight, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.top, { paddingTop: (edge ? insets.top : 0) + SPACE.sm }, style]}
      pointerEvents="box-none"
      onLayout={onHeight ? ({ nativeEvent }) => onHeight(Math.round(nativeEvent.layout.height)) : undefined}
    >
      {children}
    </View>
  );
}

// The bottom stack: the rail (map credit on the left, buttons on the right),
// then the card. `edge` adds the system navigation inset for screens whose map
// reaches the bottom of the screen. onHeight reports the stack's height, which
// the map uses to keep the route clear of it.
export function MapBottom({ rail, children, edge = true, onHeight, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bottom, { paddingBottom: (edge ? insets.bottom : 0) + SPACE.md }, style]}
      pointerEvents="box-none"
      onLayout={onHeight ? ({ nativeEvent }) => onHeight(Math.round(nativeEvent.layout.height)) : undefined}
    >
      <View style={styles.rail} pointerEvents="box-none">
        <MapAttribution />
        <View style={styles.buttons} pointerEvents="box-none">{rail}</View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    padding: SPACE.lg, ...ELEVATION.floating,
  },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: SPACE.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.md },
  rail: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: SPACE.md },
  buttons: { alignItems: 'flex-end', gap: SPACE.md },
});
