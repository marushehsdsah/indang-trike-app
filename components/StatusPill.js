import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, ELEVATION, RADIUS, SPACE, TYPE } from '../theme';
import { tapFeedback } from '../utils/feedback';

// live: everything works (green); wait: something is on its way, such as GPS
// (yellow); alert: the user must act (red); offline: no internet (ink).
const TONES = {
  live: { background: COLORS.brand, text: COLORS.onBrand },
  wait: { background: COLORS.accent, text: COLORS.onAccent },
  alert: { background: COLORS.danger, text: '#FFFFFF' },
  offline: { background: COLORS.ink, text: '#FFFFFF' },
};

// The one status line at the top of a map: connection, GPS, and service area
// in a colour that reads at arm's length. Tappable when it can retry.
export default function StatusPill({ tone = 'live', icon, label, onPress, actionLabel, style }) {
  const colors = TONES[tone] ?? TONES.live;
  const content = (
    <>
      {icon && <MaterialCommunityIcons name={icon} size={18} color={colors.text} style={styles.icon} />}
      <Text style={[TYPE.label, styles.label, { color: colors.text }]} numberOfLines={2}>{label}</Text>
      {onPress && actionLabel && (
        <View style={[styles.action, { borderColor: colors.text }]}>
          <Text style={[TYPE.captionStrong, { color: colors.text }]}>{actionLabel}</Text>
        </View>
      )}
    </>
  );
  if (!onPress) {
    return <View style={[styles.pill, { backgroundColor: colors.background }, style]} accessibilityLiveRegion="polite">{content}</View>;
  }
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      accessibilityLabel={actionLabel ? `${label}. ${actionLabel}` : label}
      style={({ pressed }) => [styles.pill, { backgroundColor: colors.background }, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%',
    minHeight: 44, borderRadius: RADIUS.xl, paddingHorizontal: SPACE.md + 2, paddingVertical: SPACE.sm,
    ...ELEVATION.floating,
  },
  icon: { marginRight: SPACE.sm },
  label: { flexShrink: 1 },
  action: { marginLeft: SPACE.md, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.sm + 2, paddingVertical: 2 },
  pressed: { opacity: 0.85 },
});
