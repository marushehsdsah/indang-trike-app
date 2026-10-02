import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS } from '../theme';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from './mapStyles';
import { useI18n } from '../i18n';

function openCopyright() {
  Linking.openURL(MAP_ATTRIBUTION_URL).catch(() => {});
}

// Map data credit. It sits in the map rail beside the buttons, so it stays
// visible above whatever card the screen shows.
export default function MapAttribution({ style }) {
  const { t } = useI18n();
  return (
    <Pressable
      style={({ pressed }) => [styles.attribution, pressed && styles.pressed, style]}
      onPress={openCopyright}
      accessibilityRole="link"
      accessibilityLabel={t('map.copyright')}
    >
      <Text style={styles.text}>{MAP_ATTRIBUTION}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attribution: {
    alignSelf: 'flex-end', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  text: { fontSize: 10, color: COLORS.ink },
  pressed: { opacity: 0.8 },
});
