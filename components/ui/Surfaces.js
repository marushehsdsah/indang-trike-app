import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, ELEVATION, RADIUS, SPACE, TYPE } from '../../theme';
import { tapFeedback } from '../../utils/feedback';

// A plain white block with the app's corner radius and shadow.
export function Card({ children, style, padded = true, onPress, accessibilityLabel }) {
  const content = <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

// The panel that sits over a map. Carries the grabber so every sheet in the
// app reads as the same object.
export function Sheet({ children, style, grabber = true, ...rest }) {
  return (
    <View style={[styles.sheet, style]} {...rest}>
      {grabber && <View style={styles.grabber} />}
      {children}
    </View>
  );
}

export function Divider({ style, inset = 0 }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

export function Badge({ label, tone = 'success', style }) {
  const tones = {
    success: { background: COLORS.successTint, text: COLORS.success },
    warning: { background: COLORS.warningTint, text: COLORS.warning },
    danger: { background: COLORS.dangerTint, text: COLORS.danger },
    neutral: { background: COLORS.surfaceAlt, text: COLORS.inkSecondary },
    route: { background: COLORS.routeTint, text: COLORS.route },
  };
  const colors = tones[tone] ?? tones.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }, style]}>
      <Text style={[TYPE.overline, { color: colors.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, selected = false, onPress, icon, style }) {
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={15}
          color={selected ? COLORS.onBrand : COLORS.inkSecondary}
          style={styles.chipIcon}
        />
      )}
      <Text style={[TYPE.captionStrong, selected ? styles.chipTextSelected : styles.chipText]}>{label}</Text>
    </Pressable>
  );
}

// Icon + title + optional subtitle, with anything you like on the right.
export function ListRow({ icon, iconTone = 'tint', title, subtitle, right, onPress, chevron, style }) {
  const tones = {
    tint: { background: COLORS.brandTint, icon: COLORS.brand },
    neutral: { background: COLORS.surfaceAlt, icon: COLORS.inkSecondary },
    route: { background: COLORS.routeTint, icon: COLORS.route },
    danger: { background: COLORS.dangerTint, icon: COLORS.danger },
  };
  const tone = tones[iconTone] ?? tones.tint;

  const body = (
    <View style={[styles.row, style]}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: tone.background }]}>
          <MaterialCommunityIcons name={icon} size={20} color={tone.icon} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={TYPE.body} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[TYPE.caption, styles.rowSubtitle]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
      {(chevron ?? (Boolean(onPress) && !right)) && (
        <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.inkMuted} />
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

export function Avatar({ name, icon = 'account', size = 48, tone = 'brand', style }) {
  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  const background = tone === 'brand' ? COLORS.brand : COLORS.surfaceAlt;
  const foreground = tone === 'brand' ? COLORS.onBrand : COLORS.inkSecondary;

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }, style]}>
      {initials
        ? <Text style={{ ...TYPE.subheading, color: foreground, fontSize: size * 0.36 }}>{initials}</Text>
        : <MaterialCommunityIcons name={icon} size={size * 0.5} color={foreground} />}
    </View>
  );
}

export function EmptyState({ icon = 'map-search-outline', title, message, style }) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={28} color={COLORS.inkMuted} />
      </View>
      <Text style={[TYPE.subheading, styles.emptyTitle]}>{title}</Text>
      {message ? <Text style={[TYPE.caption, styles.emptyMessage]}>{message}</Text> : null}
    </View>
  );
}

// Two or three mutually exclusive options; the selected one lifts to white.
export function SegmentedControl({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              tapFeedback();
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            {option.dot && <View style={[styles.segmentDot, { backgroundColor: option.dot }]} />}
            <Text style={[TYPE.captionStrong, selected ? styles.segmentTextSelected : styles.segmentText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, ...ELEVATION.card },
  cardPadded: { padding: SPACE.lg },
  pressed: { opacity: 0.85 },

  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACE.xl, paddingTop: SPACE.md,
    ...ELEVATION.sheet,
  },
  grabber: {
    width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.lineStrong,
    alignSelf: 'center', marginBottom: SPACE.md,
  },

  divider: { height: 1, backgroundColor: COLORS.line },

  badge: { paddingHorizontal: SPACE.sm, paddingVertical: 4, borderRadius: RADIUS.sm },

  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.lg, height: 38, borderRadius: RADIUS.pill,
  },
  chipIdle: { backgroundColor: COLORS.surfaceAlt },
  chipSelected: { backgroundColor: COLORS.brand },
  chipIcon: { marginRight: SPACE.xs + 2 },
  chipText: { color: COLORS.inkSecondary },
  chipTextSelected: { color: COLORS.onBrand },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, minHeight: 60 },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginRight: SPACE.md },
  rowText: { flex: 1, marginRight: SPACE.md },
  rowSubtitle: { marginTop: 2 },

  avatar: { alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: SPACE.xxxl, paddingHorizontal: SPACE.xl },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg,
  },
  emptyTitle: { textAlign: 'center' },
  emptyMessage: { textAlign: 'center', marginTop: SPACE.xs },

  segmented: { flexDirection: 'row', backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md, padding: 3 },
  segment: {
    flex: 1, height: 38, borderRadius: RADIUS.sm + 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: COLORS.surface, ...ELEVATION.card },
  segmentDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACE.sm },
  segmentText: { color: COLORS.inkSecondary },
  segmentTextSelected: { color: COLORS.ink },
});
