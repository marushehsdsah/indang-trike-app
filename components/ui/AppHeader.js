import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import IconButton from './IconButton';
import { SPACE, TYPE } from '../../theme';
import { useI18n } from '../../i18n';

// Top app bar for the screens without a map: an optional back button, then
// the screen's title, large and left-aligned, with one optional action.
export default function AppHeader({ title, subtitle, onBack, action, style }) {
  const { t } = useI18n();
  return (
    <View style={[styles.header, style]}>
      {onBack && <IconButton icon="arrow-left" label={t('common.back')} tone="quiet" raised={false} onPress={onBack} style={styles.back} />}
      <View style={styles.titleBlock}>
        <Text style={TYPE.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[TYPE.caption, styles.subtitle]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.md, minHeight: 64 },
  back: { marginRight: SPACE.md },
  titleBlock: { flex: 1 },
  subtitle: { marginTop: 2 },
});
