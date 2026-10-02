import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Divider, ListRow } from './ui/Surfaces';
import { COLORS, ELEVATION, HIT_SLOP, RADIUS, SPACE, TYPE } from '../theme';
import { SERVICE_AREA_EITHER, SERVICE_AREA_NAME } from '../data/indangMap';

const ENDPOINT_NAMES = { pickup: 'pickup', destination: 'destination' };
const SCHOOL_KINDS = new Set(['school', 'university', 'college', 'kindergarten']);

function formatKind(kind) {
  if (!kind) return 'Place';
  const words = kind.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// One icon per map category (utils/placeCategories.js), so a result looks like
// its dot on the map.
const CATEGORY_ICONS = {
  road: 'road-variant', food: 'silverware-fork-knife', shopping: 'shopping-outline', education: 'school-outline',
  health: 'hospital-box-outline', worship: 'church', government: 'office-building-outline', transport: 'bus',
  leisure: 'tree-outline', lodging: 'bed-outline', landmark: 'star-outline', services: 'store-outline', area: 'home-group',
};

function getPlaceIcon({ kind, category }) {
  if (CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  if (kind === 'road') return 'road-variant';
  if (SCHOOL_KINDS.has(kind)) return 'school-outline';
  return 'map-marker-outline';
}

// Search overlay for the endpoint being edited. It only reports choices;
// BookingScreen decides what a selection or a map tap does.
export default function LocationSearchPanel({
  activeEndpoint,
  query,
  results,
  onQueryChange,
  onSelect,
  onClose,
  onUseCurrentLocation,
  onChooseOnMap,
}) {
  const endpointName = ENDPOINT_NAMES[activeEndpoint] ?? 'stop';
  const hasQuery = query.trim() !== '';

  return (
    <View style={styles.panel}>
      <View style={styles.inputRow}>
        <MaterialCommunityIcons name="magnify" size={20} color={COLORS.inkSecondary} />
        <TextInput
          style={[TYPE.body, styles.input]}
          value={query}
          onChangeText={onQueryChange}
          placeholder={`Search ${endpointName} in ${SERVICE_AREA_EITHER}`}
          placeholderTextColor={COLORS.inkMuted}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={`Search for a ${endpointName}`}
        />
        {hasQuery ? (
          <Pressable
            onPress={() => onQueryChange('')}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.inkMuted} />
          </Pressable>
        ) : (
          <Pressable onPress={onClose} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Close search">
            <Text style={[TYPE.captionStrong, styles.cancel]}>Cancel</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {!hasQuery && (
          <View style={styles.actions}>
            {activeEndpoint === 'pickup' && onUseCurrentLocation && (
              <ListRow
                icon="crosshairs-gps"
                title="Use my current location"
                onPress={onUseCurrentLocation}
                chevron={false}
                style={styles.actionRow}
              />
            )}
            {onChooseOnMap && (
              <>
                {activeEndpoint === 'pickup' && onUseCurrentLocation && <Divider inset={SPACE.lg + 40} />}
                <ListRow
                  icon="map-marker-radius-outline"
                  title="Choose on map"
                  subtitle={`Tap anywhere to drop the ${endpointName}`}
                  onPress={onChooseOnMap}
                  chevron={false}
                  style={styles.actionRow}
                />
              </>
            )}
          </View>
        )}

        {!hasQuery && (
          <Text style={[TYPE.caption, styles.hint]}>
            Or type a place or road name to search {SERVICE_AREA_NAME} offline.
          </Text>
        )}

        {hasQuery && results.length === 0 && (
          <Text style={[TYPE.caption, styles.hint]}>No matching places in the offline {SERVICE_AREA_NAME} map.</Text>
        )}

        {hasQuery && results.map((place, index) => (
          <View key={place.id ?? place.name}>
            {index > 0 && <Divider inset={SPACE.lg + 40} />}
            <ListRow
              icon={getPlaceIcon(place)}
              iconTone="neutral"
              title={place.name}
              subtitle={place.town ? `${formatKind(place.kind)} · ${place.town}` : formatKind(place.kind)}
              onPress={() => onSelect(place)}
              chevron={false}
              style={styles.resultRow}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: SPACE.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    overflow: 'hidden', ...ELEVATION.floating,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.lg, height: 56,
    borderBottomWidth: 1, borderBottomColor: COLORS.line,
  },
  input: { flex: 1, marginHorizontal: SPACE.md, paddingVertical: 0 },
  cancel: { color: COLORS.brand },

  results: { maxHeight: 340 },
  actions: { paddingHorizontal: SPACE.lg },
  actionRow: { paddingVertical: SPACE.sm },
  resultRow: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  hint: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg },
});
