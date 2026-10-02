import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADIUS, SPACE, TYPE } from '../theme';
import { useI18n } from '../i18n';

// A tricycle's plate, drawn the way for-hire plates look in the Philippines:
// yellow with black characters, the TODA lettered across the top. Passengers
// match this against the trike before they board.
export default function Plate({ plate, toda, size = 'lg', style }) {
  const { t } = useI18n();
  const large = size === 'lg';
  return (
    <View style={[styles.plate, large ? styles.plateLarge : styles.plateSmall, style]}
      accessibilityLabel={t('plate.label', { plate: plate || t('plate.none'), toda: toda || '' })}>
      {toda ? <Text style={[styles.toda, !large && styles.todaSmall]} numberOfLines={1}>{toda.toUpperCase()}</Text> : null}
      <Text style={[styles.number, { fontSize: large ? 24 : 17, lineHeight: large ? 28 : 21 }]} numberOfLines={1}>
        {plate ? plate.toUpperCase() : t('plate.none')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: COLORS.accent, borderColor: COLORS.ink, borderWidth: 2,
    borderRadius: RADIUS.sm, alignItems: 'center', alignSelf: 'flex-start',
  },
  plateLarge: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs + 2, minWidth: 128 },
  plateSmall: { paddingHorizontal: SPACE.sm, paddingVertical: 2, minWidth: 92 },
  toda: { ...TYPE.captionStrong, fontSize: 10, lineHeight: 13, letterSpacing: 0.6, color: COLORS.ink },
  todaSmall: { fontSize: 9, lineHeight: 11 },
  number: { fontFamily: FONTS.bold, color: COLORS.ink, letterSpacing: 1.5 },
});
