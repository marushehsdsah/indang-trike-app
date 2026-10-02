import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACE, TYPE } from '../../theme';
import { tapFeedback } from '../../utils/feedback';

// hire: the yellow for-hire action that books or accepts a trip; brand: the
// green action that runs a stage; tonal, outline, and text step down from
// there; onBrand sits on green fields.
const VARIANTS = {
  hire: { background: COLORS.accent, label: COLORS.onAccent, border: null },
  brand: { background: COLORS.brand, label: COLORS.onBrand, border: null },
  route: { background: COLORS.route, label: '#FFFFFF', border: null },
  tonal: { background: COLORS.brandTint, label: COLORS.brandDark, border: null },
  outline: { background: COLORS.surface, label: COLORS.ink, border: COLORS.lineStrong },
  text: { background: 'transparent', label: COLORS.brand, border: null },
  danger: { background: COLORS.surface, label: COLORS.danger, border: COLORS.danger },
  onBrand: { background: 'transparent', label: '#FFFFFF', border: 'rgba(255,255,255,0.6)' },
};

const SIZES = {
  lg: { height: 56, font: 18, icon: 22, padding: SPACE.xxl },
  md: { height: 48, font: 16, icon: 20, padding: SPACE.xl },
  sm: { height: 40, font: 15, icon: 18, padding: SPACE.lg },
};

// The app's one button: a pill whose press dims it with a light haptic, so
// every action answers the same way. Small buttons keep a 48 dp touch area.
export default function Button({
  label,
  onPress,
  variant = 'hire',
  size = 'lg',
  icon,
  trailingIcon,
  disabled = false,
  loading = false,
  full = true,
  style,
  accessibilityLabel,
}) {
  const tone = VARIANTS[variant] ?? VARIANTS.hire;
  const metrics = SIZES[size] ?? SIZES.lg;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        tapFeedback();
        onPress?.();
      }}
      disabled={inactive}
      hitSlop={metrics.height < 48 ? { top: 4, bottom: 4 } : undefined}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: metrics.height,
          paddingHorizontal: metrics.padding,
          backgroundColor: tone.background,
          borderColor: tone.border ?? 'transparent',
          borderWidth: tone.border ? 1.5 : 0,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.label} />
      ) : (
        <View style={styles.content}>
          {icon && <MaterialCommunityIcons name={icon} size={metrics.icon} color={tone.label} style={styles.leading} />}
          <Text style={[TYPE.button, { fontSize: metrics.font, color: tone.label }]} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon && <MaterialCommunityIcons name={trailingIcon} size={metrics.icon} color={tone.label} style={styles.trailing} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill, paddingVertical: SPACE.sm },
  content: { flexDirection: 'row', alignItems: 'center' },
  leading: { marginRight: SPACE.sm },
  trailing: { marginLeft: SPACE.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  inactive: { opacity: 0.4 },
});
