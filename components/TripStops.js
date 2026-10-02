import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACE, TYPE } from '../theme';
import { useI18n } from '../i18n';

// Pickup and drop-off as the map draws them: a green ring, a line, a yellow
// square. The marks stand in for labels, so no caps headings are needed.
export default function TripStops({ pickup, dropoff, style, lines = 1 }) {
  const { t } = useI18n();
  return (
    <View style={[styles.stops, style]}>
      <View style={styles.rail}>
        <View style={styles.pickupMark} />
        <View style={styles.connector} />
        <View style={styles.dropoffMark} />
      </View>
      <View style={styles.names}>
        <Text style={TYPE.bodyStrong} numberOfLines={lines} accessibilityLabel={t('stops.pickup', { name: pickup })}>{pickup}</Text>
        <Text style={[TYPE.bodyStrong, styles.dropoff]} numberOfLines={lines} accessibilityLabel={t('stops.dropoff', { name: dropoff })}>{dropoff}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stops: { flexDirection: 'row' },
  rail: { width: 16, alignItems: 'center', paddingTop: 5, paddingBottom: 5 },
  pickupMark: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: COLORS.brand },
  connector: { flex: 1, width: 2, minHeight: 14, backgroundColor: COLORS.lineStrong, marginVertical: 3 },
  dropoffMark: { width: 12, height: 12, borderRadius: 2, backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.accentDark },
  names: { flex: 1, marginLeft: SPACE.md, justifyContent: 'space-between' },
  dropoff: { marginTop: SPACE.md },
});
