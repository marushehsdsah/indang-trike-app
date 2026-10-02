import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IconButton from './ui/IconButton';
import { Divider } from './ui/Surfaces';
import { COLORS, HIT_SLOP, RADIUS, SPACE, TYPE } from '../theme';
import { tapFeedback } from '../utils/feedback';
import { useI18n } from '../i18n';

// One icon per map category (utils/placeCategories.js), so a result looks like
// its dot on the map.
const CATEGORY_ICONS = {
  road: 'road-variant', food: 'silverware-fork-knife', shopping: 'shopping-outline', education: 'school-outline',
  health: 'hospital-box-outline', worship: 'church', government: 'office-building-outline', transport: 'bus',
  leisure: 'tree-outline', lodging: 'bed-outline', landmark: 'star-outline', services: 'store-outline', area: 'home-group',
};

function placeCategory(place) {
  if (place.kind === 'road') return 'road';
  return CATEGORY_ICONS[place.category] ? place.category : 'services';
}

function Row({ icon, iconColor = COLORS.inkSecondary, title, subtitle, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={iconColor} style={styles.rowIcon} />
      <View style={styles.rowText}>
        <Text style={TYPE.bodyStrong} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={TYPE.caption} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

// A stop in the header: the one being searched is a text field, the other a
// row that switches the search to it.
function StopField({ endpoint, place, active, query, onQueryChange, onActivate, onClear }) {
  const { t } = useI18n();
  const isPickup = endpoint === 'pickup';
  const mark = <View style={isPickup ? styles.pickupMark : styles.dropoffMark} />;
  if (!active) {
    return (
      <Pressable
        onPress={onActivate}
        accessibilityRole="button"
        accessibilityLabel={t(isPickup ? 'search.editPickup' : 'search.editDestination', { name: place?.name ?? t('search.notSet') })}
        style={({ pressed }) => [styles.stop, pressed && styles.rowPressed]}
      >
        {mark}
        <Text style={[TYPE.body, styles.stopText, !place && styles.placeholder]} numberOfLines={1}>
          {place?.name ?? t(isPickup ? 'search.pickupPlaceholder' : 'search.destinationPlaceholder')}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.stop, styles.stopActive]}>
      {mark}
      <TextInput
        style={[TYPE.body, styles.stopText, styles.input]}
        value={query}
        onChangeText={onQueryChange}
        placeholder={t(isPickup ? 'search.pickupPlaceholder' : 'search.destinationPlaceholder')}
        placeholderTextColor={COLORS.inkMuted}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={t(isPickup ? 'search.pickupLabel' : 'search.destinationLabel')}
      />
      {query ? (
        <Pressable onPress={onClear} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={t('search.clear')}>
          <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

// Full-screen place search, the way Waze and JoyRide open "Where to?": both
// stops at the top, offline results below. It only reports choices; the
// screen decides what a selection does.
export default function LocationSearch({
  activeEndpoint,
  pickup,
  destination,
  query,
  results,
  onQueryChange,
  onSelect,
  onClose,
  onSwitchEndpoint,
  onUseCurrentLocation,
  onChooseOnMap,
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const hasQuery = query.trim() !== '';
  const actions = hasQuery ? [] : [
    ...(activeEndpoint === 'pickup' ? [{ id: 'gps', icon: 'crosshairs-gps', title: t('search.useLocation'), onPress: onUseCurrentLocation }] : []),
    { id: 'map', icon: 'map-marker-radius-outline', title: t('search.chooseOnMap'), subtitle: t('search.chooseOnMapHint'), onPress: onChooseOnMap },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" label={t('search.close')} tone="quiet" raised={false} onPress={onClose} />
        <View style={styles.stops}>
          <StopField endpoint="pickup" place={pickup} active={activeEndpoint === 'pickup'} query={query}
            onQueryChange={onQueryChange} onActivate={() => onSwitchEndpoint('pickup')} onClear={() => onQueryChange('')} />
          <Divider inset={SPACE.xxl + SPACE.sm} />
          <StopField endpoint="destination" place={destination} active={activeEndpoint === 'destination'} query={query}
            onQueryChange={onQueryChange} onActivate={() => onSwitchEndpoint('destination')} onClear={() => onQueryChange('')} />
        </View>
      </View>

      <FlatList
        data={hasQuery ? results : []}
        keyExtractor={(place) => place.id ?? place.name}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xl }}
        ItemSeparatorComponent={() => <Divider inset={SPACE.lg + 40} />}
        ListHeaderComponent={<>
          {actions.map((action) => (
            <Row key={action.id} icon={action.icon} iconColor={COLORS.brand} title={action.title} subtitle={action.subtitle} onPress={action.onPress} />
          ))}
          {!hasQuery && <Text style={[TYPE.caption, styles.hint]}>{t('search.hint')}</Text>}
          {hasQuery && results.length === 0 && <Text style={[TYPE.body, styles.hint]}>{t('search.noResults')}</Text>}
        </>}
        renderItem={({ item: place }) => {
          const category = placeCategory(place);
          const kind = t(`category.${category}`);
          return (
            <Row
              icon={CATEGORY_ICONS[category]}
              title={place.name}
              subtitle={place.town ? `${kind} · ${place.town}` : kind}
              onPress={() => onSelect(place)}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm,
    paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.line,
  },
  stops: { flex: 1, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md },
  stop: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  stopActive: {},
  stopText: { flex: 1, marginLeft: SPACE.md },
  input: { paddingVertical: SPACE.sm, fontWeight: '500' },
  placeholder: { color: COLORS.inkMuted },
  pickupMark: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: COLORS.brand },
  dropoffMark: { width: 12, height: 12, borderRadius: 2, backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.accentDark },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  rowPressed: { backgroundColor: COLORS.surfaceAlt },
  rowIcon: { width: 40 },
  rowText: { flex: 1 },
  hint: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg },
});
