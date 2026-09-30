import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './ui/Button';
import { SegmentedControl, Sheet } from './ui/Surfaces';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

const ENDPOINTS = [
  { value: 'pickup', label: 'Pickup', dot: COLORS.brand },
  { value: 'destination', label: 'Destination', dot: COLORS.accent },
];

// Bottom bar for map-pick mode: which stop the next map tap sets (switchable),
// and the route to the stops chosen so far, updated as the rider taps.
export default function MapPickBar({ target, state, calculating, onTargetChange, onDone, bottomPadding = 0 }) {
  const routeSummary = state.canConfirm ? `${state.durationLabel} · ${state.distanceLabel}` : state.message;

  return (
    <Sheet style={[styles.bar, { paddingBottom: bottomPadding + SPACE.lg }]}>
      <SegmentedControl options={ENDPOINTS} value={target} onChange={onTargetChange} />

      <View style={styles.hintRow} accessibilityLiveRegion="polite">
        <View style={styles.hintIcon}>
          <MaterialCommunityIcons name="gesture-tap" size={22} color={COLORS.brand} />
        </View>
        <View style={styles.hintText}>
          <Text style={TYPE.body} numberOfLines={1}>Tap to set {target}</Text>
          <View style={styles.summaryRow}>
            {calculating && <ActivityIndicator size="small" color={COLORS.brand} style={styles.spinner} />}
            <Text
              style={[TYPE.caption, !state.canConfirm && !calculating && styles.summaryError]}
              numberOfLines={2}
            >
              {routeSummary}
            </Text>
          </View>
        </View>
        <Button label="Done" size="md" full={false} onPress={onDone} style={styles.done} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.lg },
  hintIcon: {
    width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.brandTint,
    alignItems: 'center', justifyContent: 'center',
  },
  hintText: { flex: 1, marginHorizontal: SPACE.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  spinner: { marginRight: SPACE.sm },
  summaryError: { color: COLORS.danger },
  done: { paddingHorizontal: SPACE.xl },
});
