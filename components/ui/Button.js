import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACE, TYPE } from '../../theme';
import { tapFeedback } from '../../utils/feedback';

const VARIANTS = {
  primary: { background: COLORS.accent, label: COLORS.onAccent, border: 'transparent' },
  brand: { background: COLORS.brand, label: COLORS.onBrand, border: 'transparent' },
  dark: { background: COLORS.ink, label: '#FFFFFF', border: 'transparent' },
  secondary: { background: COLORS.surface, label: COLORS.ink, border: COLORS.lineStrong },
  // For dark backgrounds, where ink-on-transparent would disappear.
  outlineLight: { background: 'transparent', label: '#FFFFFF', border: 'rgba(255,255,255,0.5)' },
  ghost: { background: 'transparent', label: COLORS.brand, border: 'transparent' },
  danger: { background: COLORS.surface, label: COLORS.danger, border: COLORS.danger },
};

const SIZES = {
  lg: { height: 56, font: 16, radius: RADIUS.lg, padding: SPACE.xxl },
  md: { height: 48, font: 15, radius: RADIUS.md, padding: SPACE.xl },
  sm: { height: 38, font: 13, radius: RADIUS.md, padding: SPACE.lg },
};

// The app's one button. Pressing dims it and fires a light haptic, so every
// action in the app answers the same way.
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  trailingIcon,
  disabled = false,
  loading = false,
  full = true,
  style,
  accessibilityLabel,
}) {
  const tone = VARIANTS[variant] ?? VARIANTS.primary;
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
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.button,
        {
          height: metrics.height,
          borderRadius: metrics.radius,
          paddingHorizontal: metrics.padding,
          backgroundColor: tone.background,
          borderColor: tone.border,
          borderWidth: tone.border === 'transparent' ? 0 : 1.5,
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
          {icon && <MaterialCommunityIcons name={icon} size={metrics.font + 5} color={tone.label} style={styles.leading} />}
          <Text style={[TYPE.subheading, { fontSize: metrics.font, color: tone.label }]} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon && (
            <MaterialCommunityIcons name={trailingIcon} size={metrics.font + 5} color={tone.label} style={styles.trailing} />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center' },
  leading: { marginRight: SPACE.sm },
  trailing: { marginLeft: SPACE.sm },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  inactive: { opacity: 0.4 },
});
