import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../components/BottomNav';
import Screen from '../components/ui/Screen';
import IconButton from '../components/ui/IconButton';
import { Avatar, Card, Chip, Divider, ListRow } from '../components/ui/Surfaces';
import { preloadRoadGraph } from '../data/roadNetwork';
import { SERVICE_AREA_NAME } from '../data/indangMap';
import { COLORS, ELEVATION, RADIUS, SPACE, TYPE } from '../theme';
import { tapFeedback } from '../utils/feedback';
import { useApp } from '../context/AppContext';
import useAccountHistory from '../hooks/useAccountHistory';
import ConnectionBanner from '../components/ConnectionBanner';
import Button from '../components/ui/Button';
import { ACTIVE_STATUSES, formatFare, userName } from '../utils/rideState';

// Tapping any of these opens booking with the destination search already
// filled in, so the rider never types a whole place name.
const SHORTCUTS = [
  { label: 'CvSU Gentri', icon: 'school-outline', query: 'Cavite State University' },
  { label: 'Public market', icon: 'storefront-outline', query: 'Market' },
  { label: 'City hall', icon: 'office-building-outline', query: 'City Hall' },
];

const GPS_RETRY_STATUSES = ['denied', 'approximate', 'disabled', 'unavailable', 'inaccurate', 'stale'];

// Passenger GPS runs whenever the app is open; this line shows whether it is
// live and whether the rider is somewhere a tricycle can be booked.
function GpsStatus({ gps }) {
  const ready = gps.status === 'ready', outside = ready && gps.inServiceArea === false;
  const retryable = GPS_RETRY_STATUSES.includes(gps.status);
  const message = outside ? `Live GPS · You are outside ${SERVICE_AREA_NAME}. Tricycle rides can only be booked inside ${SERVICE_AREA_NAME}.`
    : ready ? `Live GPS · You are in ${SERVICE_AREA_NAME}.` : gps.message + (retryable ? ' Tap to retry.' : '');
  const color = outside ? COLORS.danger : ready ? COLORS.brand : COLORS.inkMuted;
  return (
    <Pressable
      onPress={gps.retry}
      disabled={!retryable}
      accessibilityRole={retryable ? 'button' : 'text'}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [styles.gpsRow, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={outside ? 'map-marker-alert-outline' : ready ? 'crosshairs-gps' : 'crosshairs-question'} size={18} color={color} />
      <Text style={[TYPE.caption, styles.gpsText, { color }]}>{message}</Text>
    </Pressable>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function PassengerScreen({ navigation }) {
  const { user, ride, config, gps } = useApp();
  const { rides } = useAccountHistory();
  const recent = rides.filter((item) => item.status === 'completed').slice(0, 3).map((item) => ({ id: item.id, title: item.trip.dropoff.name, subtitle: item.route.distanceLabel, query: item.trip.dropoff.name }));
  const active = ride && ACTIVE_STATUSES.includes(ride.status);
  const resume = () => navigation.navigate(ride.status === 'searching' ? 'Searching' : 'ActiveRide');
  // Loads the offline road graph while the rider is idle here, so booking
  // shows its first route without waiting for the one-time load.
  useEffect(() => {
    const handle = requestIdleCallback(preloadRoadGraph);
    return () => cancelIdleCallback(handle);
  }, []);

  const openBooking = (query) => !user.profileComplete ? navigation.navigate('Profile') : active ? resume() : navigation.navigate('Booking', { focus: 'destination', query });

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar name={userName(user)} size={44} />
        <View style={styles.headerText}>
          <Text style={TYPE.caption}>{greeting()}</Text>
          <Text style={TYPE.subheading} numberOfLines={1}>{user.firstName || user.phone}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ConnectionBanner />
        {active && <Button label={ride.status === 'searching' ? 'Return to your request' : 'Return to your ride'} variant="brand" onPress={resume} style={{ marginBottom: SPACE.lg }} />}
        <Text style={[TYPE.title, styles.hero]}>Where are you{'\n'}headed today?</Text>

        <Pressable
          onPress={() => {
            tapFeedback();
            openBooking();
          }}
          accessibilityRole="button"
          accessibilityLabel="Search for a destination"
          style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="magnify" size={22} color={COLORS.ink} />
          <Text style={[TYPE.subheading, styles.searchText]}>Where to?</Text>
          <View style={styles.searchAction}>
            <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.onAccent} />
          </View>
        </Pressable>

        <GpsStatus gps={gps} />
        <Text style={[TYPE.caption, { marginTop: SPACE.xs }]}>Your live location is shared with pilot admins while this app is open.</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shortcuts}
          style={styles.shortcutsScroll}
        >
          {SHORTCUTS.map((shortcut) => (
            <Chip
              key={shortcut.label}
              label={shortcut.label}
              icon={shortcut.icon}
              onPress={() => openBooking(shortcut.query)}
              style={styles.shortcut}
            />
          ))}
        </ScrollView>

        <Card padded={false} style={styles.rideCard}>
          <View style={styles.rideRow}>
            <View style={styles.rideIcon}>
              <MaterialCommunityIcons name="rickshaw" size={26} color={COLORS.brand} />
            </View>
            <View style={styles.rideText}>
              <Text style={TYPE.subheading}>Standard Trike</Text>
              <Text style={[TYPE.caption, styles.rideSub]}>Up to 4 passengers{config ? ` · ${formatFare(config.fare)} flat fare` : ''}</Text>
            </View>
          </View>
          <Divider />
          <Pressable
            onPress={() => {
              tapFeedback();
              openBooking();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.rideCta, pressed && styles.pressed]}
          >
            <Text style={[TYPE.subheading, styles.rideCtaText]}>Book a tricycle</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.brand} />
          </Pressable>
        </Card>

        <Text style={[TYPE.overline, styles.sectionTitle]}>RECENT</Text>
        <Card padded={false} style={styles.recentCard}>
          {recent.length === 0 && <Text style={[TYPE.caption, { padding: SPACE.lg }]}>Your completed rides will appear here.</Text>}
          {recent.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <Divider inset={SPACE.lg + 52} />}
              <ListRow
                icon="history"
                iconTone="neutral"
                title={item.title}
                subtitle={item.subtitle}
                onPress={() => openBooking(item.query)}
                style={styles.recentRow}
              />
            </View>
          ))}
        </Card>

        <View style={styles.safety}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.brand} />
          <Text style={[TYPE.caption, styles.safetyText]}>
            Check the plate and TODA number before you board.
          </Text>
        </View>
      </ScrollView>

      <BottomNav active="home" navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md },
  headerText: { flex: 1, marginLeft: SPACE.md },
  bell: { borderWidth: 1, borderColor: COLORS.line },

  content: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xxl },
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

  sectionTitle: { marginTop: SPACE.xxl, marginBottom: SPACE.sm, marginLeft: SPACE.xs },
  recentCard: { paddingHorizontal: SPACE.lg },
  recentRow: { paddingVertical: SPACE.md },

  gpsRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md, paddingHorizontal: SPACE.xs },
  gpsText: { flex: 1, marginLeft: SPACE.sm },

  safety: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.xl, paddingHorizontal: SPACE.xs },
  safetyText: { flex: 1, marginLeft: SPACE.sm },
});
