import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';

// A person's measured GPS position: a blue dot, grey when it is only the last
// known fix.
export default function LiveLocationMarker({ coordinate, title, stale = false }) {
  return (
    <ViewAnnotation lngLat={[coordinate.longitude, coordinate.latitude]} title={title} anchor="center">
      <View style={[styles.dot, stale && styles.stale]} accessibilityLabel={title} />
    </ViewAnnotation>
  );
}

const styles = StyleSheet.create({
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.route, borderWidth: 3, borderColor: '#FFFFFF' },
  stale: { backgroundColor: COLORS.inkMuted },
});
