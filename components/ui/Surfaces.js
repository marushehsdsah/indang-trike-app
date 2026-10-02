import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, ELEVATION, FONTS, HIT_SLOP, RADIUS, SPACE, TYPE } from '../../theme';
import { selectionFeedback, tapFeedback } from '../../utils/feedback';

// The system face, for the peso sign Fredoka lacks.
const SYSTEM_FACE = Platform.select({ android: 'sans-serif', default: 'System' });

// A white block on the canvas, for the screens without a map.
export function Card({ children, style, padded = true }) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function Divider({ style, inset = 0 }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

// A fare in pesos, set large in the rounded face: "₱45", or "₱45.50" when the
// amount has centavos.
export function Money({ amount, size = 30, color = COLORS.ink, style }) {
  const value = Number(amount ?? 0);
  const digits = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return (
    <Text style={[{ fontFamily: FONTS.bold, fontSize: size, lineHeight: Math.round(size * 1.15), color }, style]}
      accessibilityLabel={`₱${digits}`}>
      <Text style={{ fontFamily: SYSTEM_FACE, fontWeight: '700', fontSize: Math.round(size * 0.82) }}>₱</Text>{digits}
    </Text>
  );
}

// Selectable or tappable chip. `tone="map"` is the filled chip used on map
// cards; the default is outlined, for forms.
export function Chip({ label, selected = false, onPress, icon, tone = 'outline', style, accessibilityLabel }) {
  const filled = tone === 'map';
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress?.();
      }}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        filled ? styles.chipMap : styles.chipOutline,
        selected && styles.chipSelected,
        pressed && styles.pressed,
        style,
      ]}
    >
      {(icon || selected) && (
        <MaterialCommunityIcons
          name={selected && !filled ? 'check' : icon}
          size={18}
          color={selected ? COLORS.brandDark : COLORS.inkSecondary}
          style={styles.chipIcon}
        />
      )}
      <Text style={[TYPE.label, selected && styles.chipTextSelected]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({ name, size = 48, style }) {
  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {initials
        ? <Text style={{ fontFamily: FONTS.semibold, color: COLORS.onBrand, fontSize: Math.round(size * 0.4) }}>{initials}</Text>
        : <MaterialCommunityIcons name="account" size={size * 0.55} color={COLORS.onBrand} />}
    </View>
  );
}

export function EmptyState({ icon = 'map-search-outline', title, message, style }) {
  return (
    <View style={[styles.empty, style]}>
      <MaterialCommunityIcons name={icon} size={40} color={COLORS.inkMuted} />
      <Text style={[TYPE.heading, styles.emptyTitle]}>{title}</Text>
      {message ? <Text style={[TYPE.bodyMuted, styles.emptyMessage]}>{message}</Text> : null}
    </View>
  );
}

// Material segmented buttons: two or three exclusive options in one outlined
// pill; the chosen one fills with the brand tint and gains a check.
export function SegmentedControl({ options, value, onChange, style, tone = 'light' }) {
  const onBrand = tone === 'onBrand';
  return (
    <View style={[styles.segmented, onBrand && styles.segmentedOnBrand, style]} accessibilityRole="radiogroup">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              selectionFeedback();
              onChange(option.value);
            }}
            hitSlop={HIT_SLOP}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            style={[
              styles.segment,
              index > 0 && (onBrand ? styles.segmentDividerOnBrand : styles.segmentDivider),
              selected && (onBrand ? styles.segmentSelectedOnBrand : styles.segmentSelected),
            ]}
          >
            {selected && <MaterialCommunityIcons name="check" size={16} color={onBrand ? COLORS.brandDark : COLORS.brandDark} style={styles.segmentCheck} />}
            {!selected && option.dot && <View style={[styles.segmentDot, { backgroundColor: option.dot }]} />}
            <Text
              style={[TYPE.label, onBrand && !selected && styles.segmentTextOnBrand, selected && styles.segmentTextSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.card, ...ELEVATION.card },
  cardPadded: { padding: SPACE.lg },
  pressed: { opacity: 0.8 },

  divider: { height: 1, backgroundColor: COLORS.line },

  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.md + 2, minHeight: 40, borderRadius: RADIUS.pill,
  },
  chipOutline: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.lineStrong },
  chipMap: { backgroundColor: COLORS.surfaceAlt },
  chipSelected: { backgroundColor: COLORS.brandTint, borderColor: COLORS.brandTint },
  chipIcon: { marginRight: SPACE.xs + 2 },
  chipTextSelected: { color: COLORS.brandDark },

  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brand },

  empty: { alignItems: 'center', paddingVertical: SPACE.xxxl, paddingHorizontal: SPACE.xl },
  emptyTitle: { textAlign: 'center', marginTop: SPACE.md },
  emptyMessage: { textAlign: 'center', marginTop: SPACE.xs },

  segmented: {
    flexDirection: 'row', borderWidth: 1, borderColor: COLORS.lineStrong,
    borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: COLORS.surface,
  },
  segmentedOnBrand: { borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'transparent' },
  segment: {
    flex: 1, minHeight: 44, paddingHorizontal: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.lineStrong },
  segmentDividerOnBrand: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.55)' },
  segmentSelected: { backgroundColor: COLORS.brandTint },
  segmentSelectedOnBrand: { backgroundColor: COLORS.accent },
  segmentCheck: { marginRight: SPACE.xs },
  segmentDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACE.sm },
  segmentTextSelected: { color: COLORS.brandDark },
  segmentTextOnBrand: { color: '#FFFFFF' },
});
