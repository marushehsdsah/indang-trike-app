import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import { Card, EmptyState, Money } from '../components/ui/Surfaces';
import BottomNav from '../components/BottomNav';
import ConnectionBanner from '../components/ConnectionBanner';
import TripStops from '../components/TripStops';
import { RatingBadge } from '../components/RatingPrompt';
import KeyboardAwareScrollView from '../components/ui/KeyboardAwareScrollView';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { formatDistance } from '../utils/routeDirections';
import { ACTIVE_STATUSES, isFreshFix } from '../utils/rideState';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

// Reloads now and then while open, so the distances follow the trike.
const RELOAD_MS = 15000;

// Every booking still looking for a driver that this driver could take, next
// to the one-at-a-time request on the Drive screen. Taking one here assigns
// it at once, even while it is being offered to another driver.
export default function BookingsScreen({ navigation }) {
  const { user, ride, gps, connected, request, rideAction, bookingsVersion } = useApp();
  const { t } = useI18n();
  const [bookings, setBookings] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const [taking, setTaking] = useState(null), [focused, setFocused] = useState(false);
  const active = ride && ACTIVE_STATUSES.includes(ride.status) && ride.status !== 'searching';
  const fresh = gps.status === 'ready' && isFreshFix(gps.fix, Date.now());
  const ready = user.available && connected && fresh && !active;

  const reload = useCallback(async () => {
    setLoading(true);
    try { setBookings((await request('/driver/bookings')).bookings); setError(null); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [request]);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    if (!focused || !ready) return undefined;
    reload();
    const timer = setInterval(reload, RELOAD_MS);
    return () => clearInterval(timer);
  }, [focused, ready, bookingsVersion, reload]);

  const take = async (booking) => {
    if (taking) return;
    setTaking(booking.id);
    try { await rideAction(booking.id, 'claim'); navigation.navigate('ActiveRide'); }
    catch (failure) { Alert.alert(t('bookings.unableToTake'), failure.message); reload(); }
    finally { setTaking(null); }
  };

  // Why the list cannot be used yet, if it cannot.
  const blocked = active ? { icon: 'rickshaw', title: t('driver.onTrip'), message: t('bookings.onTrip'), action: t('driver.returnToTrip'), onPress: () => navigation.navigate('ActiveRide') }
    : !user.available ? { icon: 'power-plug-off-outline', title: t('driver.offline'), message: t('bookings.offline'), action: t('bookings.toDrive'), onPress: () => navigation.navigate('Driver') }
    : !connected || !fresh ? { icon: 'crosshairs-question', title: t('driver.waitingGps'), message: t('bookings.waitingGps'), action: t('common.retryGps'), onPress: gps.retry }
    : null;

  return <Screen>
    <AppHeader title={t('bookings.title')} subtitle={ready && !loading ? t('bookings.count', { count: bookings.length }) : null} />
    <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={ready && loading} onRefresh={ready ? reload : undefined} enabled={ready} colors={[COLORS.brand]} />}>
      <ConnectionBanner />
      {blocked ? <View style={styles.blocked}>
        <EmptyState icon={blocked.icon} title={blocked.title} message={blocked.message} />
        <Button label={blocked.action} variant="brand" size="md" onPress={blocked.onPress} />
      </View>
        : error ? <View style={styles.blocked}>
          <Text style={[TYPE.body, styles.errorText]}>{error}</Text>
          <Button label={t('common.retry')} variant="brand" size="md" onPress={reload} />
        </View>
        : !loading && bookings.length === 0 ? <EmptyState icon="clipboard-text-search-outline" title={t('bookings.emptyTitle')} message={t('bookings.emptyMessage')} />
        : bookings.map((booking) => <Card key={booking.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={[TYPE.bodyStrong, styles.shrink]} numberOfLines={1}>{booking.passenger?.firstName || t('rating.your.passenger')}</Text>
            {booking.passenger && <RatingBadge rating={booking.passenger.rating} />}
            <View style={styles.flex} />
            {booking.offerId && <View style={styles.offered}><Text style={[TYPE.captionStrong, styles.offeredText]}>{t('bookings.offeredToYou')}</Text></View>}
          </View>
          <View style={[styles.row, styles.away]}>
            <MaterialCommunityIcons name="map-marker-distance" size={18} color={COLORS.inkSecondary} />
            <Text style={TYPE.caption}>{t('bookings.away', { distance: formatDistance(booking.distanceMeters) })}</Text>
          </View>
          <TripStops pickup={booking.trip.pickup.name} dropoff={booking.trip.dropoff.name} lines={2} style={styles.stops} />
          {booking.note ? <View style={[styles.row, styles.note]}>
            <MaterialCommunityIcons name="message-reply-text-outline" size={18} color={COLORS.inkSecondary} />
            <Text style={[TYPE.body, styles.flex]}>{booking.note}</Text>
          </View> : null}
          <View style={[styles.row, styles.footer]}>
            <View style={styles.flex}>
              <Money amount={booking.fare} size={22} color={COLORS.brand} />
              <Text style={TYPE.caption}>{[booking.route?.durationLabel, booking.route?.distanceLabel, t('trip.riders', { count: booking.passengers })].filter(Boolean).join(' · ')}</Text>
            </View>
            <Button label={t('bookings.take')} variant="hire" size="md" full={false} loading={taking === booking.id}
              disabled={Boolean(taking) || !connected} onPress={() => take(booking)} />
          </View>
        </Card>)}
    </KeyboardAwareScrollView>
    <BottomNav active="bookings" navigation={navigation} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xxl },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  card: { marginTop: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  away: { marginTop: SPACE.xs },
  stops: { marginTop: SPACE.md },
  note: { alignItems: 'flex-start', marginTop: SPACE.md },
  footer: { marginTop: SPACE.md },
  offered: { paddingHorizontal: SPACE.sm, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: COLORS.accentTint },
  offeredText: { color: COLORS.accentDark },
  blocked: { marginTop: SPACE.xl, gap: SPACE.md },
  errorText: { color: COLORS.danger },
});
