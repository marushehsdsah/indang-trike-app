import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './ui/Button';
import { Sheet } from './ui/Surfaces';
import { MAX_PASSENGERS, MIN_PASSENGERS } from '../utils/bookingRoute';
import { COLORS, HIT_SLOP, RADIUS, SPACE, TYPE } from '../theme';
import { selectionFeedback } from '../utils/feedback';

const NO_METRIC = '—';

function StepperButton({ icon, onPress, disabled, label }) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        selectionFeedback();
        onPress();
      }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.stepperButton, pressed && !disabled && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={disabled ? COLORS.inkMuted : COLORS.ink} />
    </Pressable>
  );
}

// Route summary and booking controls. `state` comes from getBookingState, so
// the sheet shows metrics only for a route that can actually be booked.
export default function BookingSheet({
  state,
  calculating = false,
  submitting = false,
  passengers,
  note,
  fare,
  onPassengersChange,
  onNoteChange,
  onConfirm,
  onPreviewRoute,
  bottomPadding = 0,
  onLayout,
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const canDecrease = passengers > MIN_PASSENGERS;
  const canIncrease = passengers < MAX_PASSENGERS;
  const hasRoute = state.canConfirm;

  return (
    <Sheet style={[styles.sheet, { paddingBottom: bottomPadding + SPACE.lg }]} onLayout={onLayout}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryText}>
          <Text style={TYPE.metric}>{state.durationLabel}</Text>
          <Text style={[TYPE.caption, styles.distance]}>
            {state.distanceLabel === NO_METRIC ? 'Road distance —' : `${state.distanceLabel} · fastest road route`}
          </Text>
        </View>
        {onPreviewRoute && (
          <Pressable
            onPress={onPreviewRoute}
            disabled={!hasRoute}
            accessibilityRole="button"
            accessibilityLabel="Preview the route in the 3D route guide"
            accessibilityState={{ disabled: !hasRoute }}
            style={({ pressed }) => [styles.preview, !hasRoute && styles.previewDisabled, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="navigation-variant" size={15} color={COLORS.route} />
            <Text style={[TYPE.captionStrong, styles.previewText]}>GPS guide</Text>
          </Pressable>
        )}
      </View>

      {state.message && (
        <View style={styles.status} accessibilityLiveRegion="polite">
          {calculating
            ? <ActivityIndicator size="small" color={COLORS.brand} style={styles.statusIcon} />
            : <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} style={styles.statusIcon} />}
          <Text style={[TYPE.caption, !calculating && styles.statusError]}>{state.message}</Text>
        </View>
      )}

      <View style={styles.rideOption}>
        <View style={styles.rideIcon}>
          <MaterialCommunityIcons name="rickshaw" size={26} color={COLORS.brand} />
        </View>
        <View style={styles.rideText}>
          <Text style={TYPE.subheading}>Standard Trike</Text>
          <Text style={[TYPE.caption, styles.rideSub]}>Direct ride · up to {MAX_PASSENGERS} passengers</Text>
        </View>
        <View style={styles.fareBlock}>
          <Text style={TYPE.subheading}>{fare}</Text>
          <Text style={[TYPE.overline, styles.fareLabel]}>FLAT</Text>
        </View>
      </View>

      <View style={styles.controlRow}>
        <Text style={TYPE.body}>Passengers</Text>
        <View style={styles.stepper}>
          <StepperButton icon="minus" onPress={() => onPassengersChange(passengers - 1)} disabled={!canDecrease} label="Fewer passengers" />
          <Text style={[TYPE.subheading, styles.stepperValue]} accessibilityLabel={`${passengers} passengers`}>
            {passengers}
          </Text>
          <StepperButton icon="plus" onPress={() => onPassengersChange(passengers + 1)} disabled={!canIncrease} label="More passengers" />
        </View>
      </View>

      {noteOpen ? (
        <TextInput
          style={[TYPE.body, styles.noteInput]}
          value={note}
          onChangeText={onNoteChange}
          placeholder="Note for the driver, e.g. wait near the green gate"
          placeholderTextColor={COLORS.inkMuted}
          maxLength={200}
          multiline
        />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.noteToggle, pressed && styles.pressed]}
          onPress={() => setNoteOpen(true)}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="note-plus-outline" size={16} color={COLORS.brand} />
          <Text style={[TYPE.captionStrong, styles.noteToggleText]}>Add a note for the driver</Text>
        </Pressable>
      )}

      <Button
        label={hasRoute ? `Book trike · ${fare}` : 'Book trike'}
        onPress={onConfirm}
        disabled={!hasRoute}
        loading={submitting}
        trailingIcon="arrow-right"
        accessibilityLabel="Confirm and book tricycle"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  summaryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  summaryText: { flex: 1 },
  distance: { marginTop: 2 },
  preview: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.routeTint, borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md, height: 34,
  },
  previewDisabled: { opacity: 0.4 },
  previewText: { color: COLORS.route, marginLeft: SPACE.xs + 2 },
  pressed: { opacity: 0.7 },

  status: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  statusIcon: { marginRight: SPACE.sm },
  statusError: { color: COLORS.danger },

  rideOption: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACE.lg,
    backgroundColor: COLORS.brandTint, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.brand,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.md,
  },
  rideIcon: {
    width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  rideText: { flex: 1, marginLeft: SPACE.md },
  rideSub: { marginTop: 2 },
  fareBlock: { alignItems: 'flex-end' },
  fareLabel: { marginTop: 2 },

  controlRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACE.lg,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.pill, padding: 4,
  },
  stepperButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 28, textAlign: 'center' },

  noteToggle: { flexDirection: 'row', alignItems: 'center', paddingBottom: SPACE.lg },
  noteToggleText: { color: COLORS.brand, marginLeft: SPACE.sm },
  noteInput: {
    borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
    minHeight: 48, maxHeight: 92, textAlignVertical: 'top', marginBottom: SPACE.lg,
  },
});
