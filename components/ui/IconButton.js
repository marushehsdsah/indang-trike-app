import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, ELEVATION, RADIUS } from '../../theme';
import { tapFeedback } from '../../utils/feedback';

const TONES = {
  surface: { background: COLORS.surface, icon: COLORS.ink },
  brand: { background: COLORS.brand, icon: COLORS.onBrand },
  route: { background: COLORS.route, icon: '#FFFFFF' },
  tint: { background: COLORS.brandTint, icon: COLORS.brand },
  danger: { background: COLORS.danger, icon: '#FFFFFF' },
};

// Round tap target for map controls and compact actions.
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
      accessibilityRole="button"
      accessibilityLabel={label}
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
        : <MaterialCommunityIcons name={icon} size={iconSize ?? Math.round(size * 0.46)} color={colors.icon} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  inactive: { opacity: 0.5 },
});
