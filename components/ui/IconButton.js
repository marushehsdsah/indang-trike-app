import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, ELEVATION, HIT_SLOP, RADIUS } from '../../theme';
import { tapFeedback } from '../../utils/feedback';

const TONES = {
  surface: { background: COLORS.surface, icon: COLORS.ink },
  brand: { background: COLORS.brand, icon: COLORS.onBrand },
  route: { background: COLORS.route, icon: '#FFFFFF' },
  routeTint: { background: COLORS.routeTint, icon: COLORS.route },
  tint: { background: COLORS.brandTint, icon: COLORS.brandDark },
  quiet: { background: COLORS.surfaceAlt, icon: COLORS.ink },
  danger: { background: COLORS.dangerTint, icon: COLORS.danger },
};

// Round tap target: the map's floating buttons (raised) and compact actions
// inside cards (flat). Anything under 48 dp keeps a 48 dp touch area.
export default function IconButton({
  icon,
  onPress,
  label,
  tone = 'surface',
  size = 48,
  iconSize,
  raised = true,
  loading = false,
  disabled = false,
  style,
}) {
  const colors = TONES[tone] ?? TONES.surface;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        tapFeedback();
        onPress?.();
      }}
      disabled={inactive}
      hitSlop={size < 48 ? HIT_SLOP : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        raised && ELEVATION.floating,
        { width: size, height: size, borderRadius: RADIUS.pill, backgroundColor: colors.background },
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={colors.icon} />
        : <MaterialCommunityIcons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={colors.icon} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  inactive: { opacity: 0.45 },
});
