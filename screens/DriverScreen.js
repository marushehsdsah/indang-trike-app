import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Screen from '../components/ui/Screen';
import Button from '../components/ui/Button';
import { Sheet } from '../components/ui/Surfaces';
import RouteMap from '../components/RouteMap';
import BottomNav from '../components/BottomNav';
import ConnectionBanner from '../components/ConnectionBanner';
import RideDetails from '../components/RideDetails';
import { useApp } from '../context/AppContext';
import useAccountHistory from '../hooks/useAccountHistory';
import { ACTIVE_STATUSES, formatFare, isFreshFix, userName } from '../utils/rideState';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

export default function DriverScreen({ navigation }) {
  const { user, ride, offer, setAvailable, rideAction, gps, connected, serverOffset } = useApp();
  const { stats, error: statsError } = useAccountHistory();
  const [busy, setBusy] = useState(false), [sheetHeight, setSheetHeight] = useState(260), [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = ride && ACTIVE_STATUSES.includes(ride.status);
  const seconds = offer ? Math.max(0, Math.ceil((new Date(offer.offerExpiresAt).getTime() - now - serverOffset) / 1000)) : 0;
  const fresh = gps.status === 'ready' && isFreshFix(gps.fix, now), available = user.available && connected && fresh;
  // Location is still shared outside Indang, but requests only go to drivers inside it.
  const outside = fresh && gps.inServiceArea === false;
  const perform = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (failure) { Alert.alert('Unable to update', failure.message); }
    finally { setBusy(false); }
  };
  const respond = (action) => perform(async () => {
    await rideAction(offer.id, action, { offerId: offer.offerId });
    if (action === 'accept') navigation.navigate('ActiveRide');
  });
  return <Screen>
    <View style={styles.header}>
      <View style={{ flex: 1 }}><Text style={TYPE.caption}>Driver home</Text><Text style={TYPE.subheading}>{userName(user)}</Text></View>
      <View style={[styles.status, available && styles.online]}><Text style={[TYPE.captionStrong, { color: available ? COLORS.brand : COLORS.inkMuted }]}>{active ? 'On a trip' : available ? outside ? 'Outside Indang' : 'Online' : user.available ? 'Waiting for GPS' : 'Offline'}</Text></View>
    </View>
    <View style={{ flex: 1 }}>
      <RouteMap pickup={offer?.trip.pickup} destination={offer?.trip.dropoff} route={offer?.route} currentLocation={fresh ? gps.fix : null} bottomInset={sheetHeight}>
        {fresh && <ViewAnnotation lngLat={[gps.fix.longitude, gps.fix.latitude]} title="Your GPS location" anchor="center">
          <MaterialCommunityIcons name="rickshaw" size={32} color={COLORS.brand} />
        </ViewAnnotation>}
      </RouteMap>
      <View style={styles.connection}><ConnectionBanner /></View>
      <Sheet style={styles.sheet} onLayout={({ nativeEvent }) => setSheetHeight(nativeEvent.layout.height)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {active ? <>
            <Text style={TYPE.heading}>Your trip is active</Text><Text style={[TYPE.caption, styles.subtitle]}>Open the trip to navigate and update your passenger.</Text>
            <Button label="Return to trip" onPress={() => navigation.navigate('ActiveRide')} />
          </> : offer ? <>
            <View style={styles.row}><Text style={[TYPE.heading, { flex: 1 }]}>New ride request</Text><Text style={[TYPE.subheading, { color: COLORS.brand }]}>{seconds}s</Text></View>
            <RideDetails ride={offer} driver />
            <Button label="Accept ride" loading={busy} disabled={!connected || seconds === 0 || !fresh} onPress={() => respond('accept')} />
            <Button label="Decline" variant="ghost" disabled={busy || !connected} onPress={() => respond('decline')} />
          </> : <>
            <Text style={TYPE.heading}>{available ? outside ? 'You are outside Indang' : 'Ready for requests' : user.available ? 'Waiting for a fresh location' : 'Ready to drive?'}</Text>
            <Text style={[TYPE.caption, styles.subtitle]}>{!user.available ? 'Go online to receive nearby passenger requests.'
              : outside ? 'Your live location is still shared, but ride requests only reach drivers inside Indang.' : 'Keep this app open. Nearby bookings will appear here.'}</Text>
            <Text style={[TYPE.caption, { color: fresh ? COLORS.brand : COLORS.inkMuted, marginBottom: SPACE.md }]}>{gps.message}</Text>
            <View style={styles.summary}>
              <View><Text style={TYPE.overline}>TRIPS TODAY</Text><Text style={TYPE.heading}>{stats?.todayTrips ?? '—'}</Text></View>
              <View><Text style={TYPE.overline}>CASH FARES TODAY</Text><Text style={TYPE.heading}>{stats ? formatFare(stats.todayFare) : '—'}</Text></View>
            </View>
            {statsError && <Text style={[TYPE.caption, { color: COLORS.danger }]}>Trip totals are unavailable.</Text>}
            <Button label={user.available ? 'Go offline' : 'Go online'} variant={user.available ? 'secondary' : 'brand'} loading={busy} disabled={!connected} onPress={() => perform(() => setAvailable(!user.available))} />
            {user.available && !fresh && <Button label="Retry GPS" variant="ghost" onPress={gps.retry} />}
          </>}
        </ScrollView>
      </Sheet>
    </View>
    <BottomNav active="home" navigation={navigation} />
  </Screen>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACE.lg, backgroundColor: COLORS.surface },
  status: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.pill },
  online: { backgroundColor: COLORS.brandTint }, connection: { position: 'absolute', top: SPACE.md, left: SPACE.md, right: SPACE.md },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '76%', paddingBottom: SPACE.lg },
  subtitle: { marginTop: SPACE.xs, marginBottom: SPACE.lg }, row: { flexDirection: 'row', alignItems: 'center' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.lg, padding: SPACE.md, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md },
});
