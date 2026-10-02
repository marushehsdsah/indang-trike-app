import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { selectionFeedback } from '../utils/feedback';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';

const PASSENGER_TABS = [
  { key: 'home', label: 'nav.home', icon: 'map-marker-radius', route: 'Passenger' },
  { key: 'history', label: 'nav.rides', icon: 'history', route: 'History' },
  { key: 'profile', label: 'nav.profile', icon: 'account-circle', route: 'Profile' },
];
const DRIVER_TABS = [
  { key: 'home', label: 'nav.drive', icon: 'steering', route: 'Driver' },
  { key: 'history', label: 'nav.trips', icon: 'history', route: 'History' },
  { key: 'profile', label: 'nav.profile', icon: 'account-circle', route: 'Profile' },
];

// Material navigation bar: the chosen destination's icon sits in a tinted pill.
export default function BottomNav({ active, navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { t } = useI18n();
  const tabs = user?.role === 'driver' ? DRIVER_TABS : PASSENGER_TABS;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, SPACE.sm) }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              if (selected) return;
              selectionFeedback();
              navigation.navigate(tab.route);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t(tab.label)}
          >
            {({ pressed }) => <>
              <View style={[styles.indicator, selected && styles.indicatorSelected, pressed && !selected && styles.indicatorPressed]}>
                <MaterialCommunityIcons name={tab.icon} size={24} color={selected ? COLORS.brandDark : COLORS.inkSecondary} />
              </View>
              <Text style={[TYPE.label, styles.label, selected && styles.labelSelected]} numberOfLines={1}>{t(tab.label)}</Text>
            </>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: SPACE.md,
  },
  tab: { flex: 1, alignItems: 'center', minHeight: 56 },
  indicator: { width: 64, height: 32, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  indicatorSelected: { backgroundColor: COLORS.brandTint },
  indicatorPressed: { backgroundColor: COLORS.surfaceAlt },
  label: { marginTop: SPACE.xs, fontSize: 12, lineHeight: 16, color: COLORS.inkSecondary },
  labelSelected: { color: COLORS.brandDark, fontWeight: '700' },
});
