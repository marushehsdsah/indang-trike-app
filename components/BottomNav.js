import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACE, TYPE } from '../theme';
import { selectionFeedback } from '../utils/feedback';
import { useApp } from '../context/AppContext';

const TABS = [
  { key: 'home', label: 'Home', icon: 'home', route: 'Passenger' },
  { key: 'book', label: 'Book', icon: 'navigation', route: 'Booking' },
  { key: 'history', label: 'History', icon: 'clock', route: 'History' },
  { key: 'profile', label: 'Profile', icon: 'user', route: 'Profile' },
];

export default function BottomNav({ active, navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const tabs = user?.role === 'driver' ? [
    { key: 'home', label: 'Home', icon: 'home', route: 'Driver' },
    { key: 'history', label: 'Trips', icon: 'clock', route: 'History' },
    { key: 'profile', label: 'Profile', icon: 'user', route: 'Profile' },
  ] : TABS;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, SPACE.sm) }]}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            onPress={() => {
              if (selected) return;
              selectionFeedback();
              navigation.navigate(tab.route);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
          >
            <Feather name={tab.icon} size={22} color={selected ? COLORS.brand : COLORS.inkMuted} />
            <Text style={[TYPE.overline, styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
            <View style={[styles.indicator, selected && styles.indicatorSelected]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.line,
    paddingTop: SPACE.sm + 2,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: SPACE.xs },
  pressed: { opacity: 0.7 },
  label: { marginTop: SPACE.xs + 2, letterSpacing: 0.2, fontSize: 11, color: COLORS.inkMuted },
  labelSelected: { color: COLORS.brand },
  // Reserved height keeps labels from shifting when the dot appears.
  indicator: { width: 4, height: 4, borderRadius: 2, marginTop: SPACE.xs, backgroundColor: 'transparent' },
  indicatorSelected: { backgroundColor: COLORS.brand },
});
