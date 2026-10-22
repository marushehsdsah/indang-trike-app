import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../components/BottomNav';
import StatusPill from '../components/StatusPill';
import ChatNotice from '../components/ChatNotice';
import Screen from '../components/ui/Screen';
import Button from '../components/ui/Button';
import { Avatar, Card, Chip, Divider } from '../components/ui/Surfaces';
import { MUNICIPALITIES, getMunicipalityAt } from '../data/indangMap';
import { MAX_PASSENGERS } from '../utils/bookingRoute';
import { tapFeedback } from '../utils/feedback';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import useAccountHistory from '../hooks/useAccountHistory';
import useMapStatus from '../hooks/useMapStatus';
import { ACTIVE_STATUSES, userName } from '../utils/rideState';
import { COLORS, ELEVATION, RADIUS, SPACE, TYPE } from '../theme';

// Tapping one opens booking with the destination search already filled in, so
// the rider never types a whole place name. Keyed by town name (see MUNICIPALITIES).
const SHORTCUTS = {
  Indang: [
    { label: 'shortcut.cvsuMain', icon: 'school-outline', query: 'Cavite State University' },
    { label: 'shortcut.market', icon: 'storefront-outline', query: 'Indang Public Market' },
    { label: 'shortcut.municipalHall', icon: 'office-building-outline', query: 'Municipal Hall' },
  ],
};

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.goodMorning';
  if (hour < 18) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

// The last few places the rider actually went, newest first, one per name.
function recentDestinations(rides) {
  const seen = new Set();
  return rides.filter((ride) => ride.status === 'completed' && ride.trip?.dropoff?.name)
    .map((ride) => ({ place: ride.trip.dropoff, distance: ride.route?.distanceLabel }))
    .filter(({ place }) => !seen.has(place.name) && seen.add(place.name))
    .slice(0, 3);
}

// The passenger's landing page after logging in: a greeting, "Where to?", and
// shortcuts that each open the booking map (Passenger) with the trip started.
export default function HomeScreen({ navigation }) {
  const { user, ride, gps } = useApp();
  const { t } = useI18n();
  const { rides } = useAccountHistory();
  const recent = useMemo(() => recentDestinations(rides), [rides]);
  const active = ride && ACTIVE_STATUSES.includes(ride.status);
  // The town the rider is in, from measured GPS; it picks the shortcuts.
  const fixLatitude = gps.status === 'ready' ? gps.fix?.latitude : undefined, fixLongitude = gps.fix?.longitude;
  const town = useMemo(() => (Number.isFinite(fixLatitude) ? getMunicipalityAt({ latitude: fixLatitude, longitude: fixLongitude }) : null),
    [fixLatitude, fixLongitude]);
  const status = useMapStatus({ town: town?.name });
  const resume = () => navigation.navigate(ride.status === 'searching' ? 'Searching' : 'ActiveRide');

  const openBooking = (params = { focus: 'destination' }) => (!user.profileComplete ? navigation.navigate('Profile')
    : active ? resume() : navigation.navigate('Passenger', params));
  const book = () => {
    tapFeedback();
    openBooking();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar name={userName(user)} size={44} />
        <View style={styles.headerText}>
          <Text style={TYPE.caption}>{t(greetingKey())}</Text>
          <Text style={TYPE.subheading} numberOfLines={1}>{user.firstName || user.phone}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ChatNotice onOpen={() => navigation.navigate('ActiveRide', { openChat: true })} style={styles.chatNotice} />
        {active && <Button label={t(ride.status === 'searching' ? 'home.returnToRequest' : 'home.returnToRide')} variant="brand" onPress={resume} style={styles.resume} />}
        <Text style={[TYPE.title, styles.hero]}>{t('home.headedToday')}</Text>

        <Pressable onPress={book} accessibilityRole="search" accessibilityLabel={t('home.whereTo')}
          style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="magnify" size={22} color={COLORS.ink} />
          <Text style={[TYPE.subheading, styles.searchText]}>{t('home.whereTo')}</Text>
          <View style={styles.searchAction}>
            <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.onAccent} />
          </View>
        </Pressable>

        <StatusPill {...status} style={styles.status} />
        <Text style={[TYPE.caption, styles.shared]}>{t('home.locationShared')}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts} style={styles.shortcutsScroll}>
          {SHORTCUTS[(town ?? MUNICIPALITIES[0]).name].map((shortcut) => (
            <Chip key={shortcut.label} label={t(shortcut.label)} icon={shortcut.icon} style={styles.shortcut}
              onPress={() => openBooking({ focus: 'destination', query: shortcut.query })} />
          ))}
        </ScrollView>

        <Card padded={false} style={styles.rideCard}>
          <View style={styles.rideRow}>
            <View style={styles.rideIcon}>
              <MaterialCommunityIcons name="rickshaw" size={26} color={COLORS.brand} />
            </View>
            <View style={styles.rideText}>
              <Text style={TYPE.subheading}>{t('home.standardTrike')}</Text>
              <Text style={[TYPE.caption, styles.rideSub]}>{t('home.standardTrikeSub', { max: MAX_PASSENGERS })}</Text>
            </View>
          </View>
          <Divider />
          <Pressable onPress={book} accessibilityRole="button" style={({ pressed }) => [styles.rideCta, pressed && styles.pressed]}>
            <Text style={[TYPE.subheading, styles.rideCtaText]}>{t('home.bookTrike')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.brand} />
          </Pressable>
        </Card>

        <Text style={[TYPE.label, styles.sectionTitle]}>{t('home.recent')}</Text>
        <Card padded={false} style={styles.recentCard}>
          {recent.length === 0 && <Text style={[TYPE.caption, styles.recentEmpty]}>{t('home.recentEmpty')}</Text>}
          {recent.map(({ place, distance }, index) => (
            <View key={place.name}>
              {index > 0 && <Divider inset={52} />}
              <Pressable onPress={() => openBooking(place.coordinate ? { destination: place } : { focus: 'destination', query: place.name })}
                accessibilityRole="button" style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}>
                <View style={styles.recentIcon}>
                  <MaterialCommunityIcons name="history" size={20} color={COLORS.inkSecondary} />
                </View>
                <View style={styles.rideText}>
                  <Text style={TYPE.bodyStrong} numberOfLines={1}>{place.name}</Text>
                  {distance ? <Text style={TYPE.caption}>{distance}</Text> : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.inkMuted} />
              </Pressable>
            </View>
          ))}
        </Card>

        <View style={styles.safety}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.brand} />
          <Text style={[TYPE.caption, styles.safetyText]}>{t('home.safety')}</Text>
        </View>
      </ScrollView>

      <BottomNav active="home" navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md },
  headerText: { flex: 1, marginLeft: SPACE.md },

  content: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xxl },
  chatNotice: { marginBottom: SPACE.md },
  resume: { marginBottom: SPACE.lg },
  hero: { marginTop: SPACE.sm, marginBottom: SPACE.xl },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    paddingLeft: SPACE.lg, paddingRight: SPACE.sm, height: 64,
    ...ELEVATION.card,
  },
  searchText: { flex: 1, marginLeft: SPACE.md },
  searchAction: {
    width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },

  status: { marginTop: SPACE.md, alignSelf: 'flex-start' },
  shared: { marginTop: SPACE.sm, paddingHorizontal: SPACE.xs },

  shortcutsScroll: { marginTop: SPACE.md, marginHorizontal: -SPACE.xl },
  shortcuts: { paddingHorizontal: SPACE.xl },
  shortcut: { marginRight: SPACE.sm },

  rideCard: { marginTop: SPACE.xl },
  rideRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.lg },
  rideIcon: {
    width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.brandTint,
    alignItems: 'center', justifyContent: 'center',
  },
  rideText: { flex: 1, marginLeft: SPACE.md },
  rideSub: { marginTop: 2 },
  rideCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.lg },
  rideCtaText: { color: COLORS.brand },

  sectionTitle: { marginTop: SPACE.xxl, marginBottom: SPACE.sm, marginLeft: SPACE.xs, textTransform: 'uppercase', letterSpacing: 1 },
  recentCard: { paddingHorizontal: SPACE.lg },
  recentEmpty: { paddingVertical: SPACE.lg },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md },
  recentIcon: {
    width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },

  safety: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.xl, paddingHorizontal: SPACE.xs },
  safetyText: { flex: 1, marginLeft: SPACE.sm },
});
