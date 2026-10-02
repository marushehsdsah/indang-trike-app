import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, ELEVATION, HIT_SLOP, RADIUS, SPACE, TYPE } from '../../theme';
import { useI18n } from '../../i18n';

// Material snackbar: transient feedback above the map card, dismissible.
export default function Snackbar({ message, onDismiss, style }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <View style={[styles.bar, style]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={[TYPE.label, styles.text]}>{message}</Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={t('common.dismiss')}>
          <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    backgroundColor: COLORS.ink, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, marginBottom: SPACE.md,
    ...ELEVATION.floating,
  },
  text: { flex: 1, color: '#FFFFFF', fontWeight: '400' },
});
