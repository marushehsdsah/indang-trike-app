import React, { useMemo, useState, useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RouteMap from '../components/RouteMap';
import { BleedScreen } from '../components/ui/Screen';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { Sheet } from '../components/ui/Surfaces';
import RideDetails from '../components/RideDetails';
import ConnectionBanner from '../components/ConnectionBanner';
import LiveLocationMarker from '../components/LiveLocationMarker';
import { useApp } from '../context/AppContext';
import { getRoadGraph } from '../data/roadNetwork';
import { isInIndangServiceArea } from '../data/indangMap';
import { resolveBookingRoute } from '../utils/bookingRoute';
import { ACTIVE_STATUSES, STATUS_LABELS, getDriverAction, isFreshFix } from '../utils/rideState';
import { COLORS, ELEVATION, SPACE, TYPE } from '../theme';

export default function ActiveRideScreen({ navigation }) {
  const { user, ride, gps, rideAction, connected, dismissRide } = useApp();
  const insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(350), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const driver = user.role === 'driver', home = driver ? 'Driver' : 'Passenger';
  const position = driver ? gps.fix : ride?.driverLocation;
  const fresh = isFreshFix(position, now) && (driver ? connected && gps.status === 'ready' : connected && ride?.driverConnected && ride?.driverLocationAvailable !== false);
  const toPickup = ride && ['accepted', 'arrived'].includes(ride.status);
  // Each side also sees the passenger: the driver on the way to pickup (from the
  // passenger's shared GPS), the passenger themselves from their own device.
  const passengerPosition = driver ? (toPickup ? ride?.passengerLocation : null) : (gps.status === 'ready' ? gps.fix : null);
  const passengerFresh = isFreshFix(passengerPosition, now);
  const leg = useMemo(() => {
    if (!ride) return null;
    if (!toPickup) return { trip: ride.trip, route: ride.route };
    if (!fresh) return { trip: { pickup: null, dropoff: ride.trip.pickup }, route: null };
    const pickup = { name: 'Driver location', coordinate: position };
    const result = resolveBookingRoute({ roadGraph: getRoadGraph(), pickup, destination: ride.trip.pickup, isInServiceArea: isInIndangServiceArea });
    return { trip: { pickup, dropoff: ride.trip.pickup }, route: result.status === 'ok' ? result.details : null };
  }, [ride?.id, ride?.status, position?.latitude, position?.longitude, fresh]);
  const perform = async (action) => {
    if (busy || !ride) return;
    setBusy(true);
    try { await rideAction(ride.id, action, action === 'cancel' ? { reason: 'Cancelled before pickup' } : {}); }
    catch (failure) { Alert.alert('Unable to update trip', failure.message); }
    finally { setBusy(false); }
  };
  const confirmAction = (action, title) => Alert.alert(title,
    action === 'start' ? 'Confirm that your passenger is on board.' : action === 'complete' ? 'Confirm the passenger has reached their stop. Collect the displayed cash fare.' : 'This will end the booking for both participants.',
    [{ text: 'Keep trip', style: 'cancel' }, { text: 'Confirm', onPress: () => perform(action) }]);
  const action = ride ? getDriverAction(ride.status) : null;
  const terminal = !ride || !ACTIVE_STATUSES.includes(ride.status);
  return <BleedScreen>
    <RouteMap pickup={toPickup ? null : ride?.trip.pickup} destination={toPickup ? ride?.trip.pickup : ride?.trip.dropoff}
      route={leg?.route} bottomInset={sheetHeight}>
      {position && !terminal && <ViewAnnotation lngLat={[position.longitude, position.latitude]} title={fresh ? 'Live driver location' : 'Last known driver location'} anchor="center">
        <View style={[styles.marker, !fresh && { opacity: 0.5 }]}><MaterialCommunityIcons name="rickshaw" size={24} color="#FFF" /></View>
      </ViewAnnotation>}
      {passengerPosition && !terminal && <LiveLocationMarker coordinate={passengerPosition} stale={!passengerFresh}
        title={driver ? (passengerFresh ? 'Passenger live location' : 'Passenger last known location') : 'Your location'} />}
    </RouteMap>
    <View style={[styles.top, { paddingTop: insets.top + SPACE.md }]}>
      <IconButton icon="arrow-left" label="Return home" size={44} onPress={() => navigation.navigate(home)} />
      <ConnectionBanner />
    </View>
    <Sheet style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.lg, maxHeight: height * 0.66 }]} onLayout={({ nativeEvent }) => setSheetHeight(nativeEvent.layout.height)}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={TYPE.heading}>{STATUS_LABELS[ride?.status] || 'No active ride'}</Text>
        {!terminal && <Text style={[TYPE.caption, { color: fresh ? COLORS.brand : COLORS.danger, marginTop: SPACE.sm }]}>
          {fresh ? toPickup ? (leg?.route ? 'Estimated pickup: ' + leg.route.durationLabel : 'Live driver GPS · pickup route unavailable') : 'Live driver GPS'
            : position ? 'Location update paused · last fix ' + Math.max(0, Math.floor((now - position.timestamp) / 1000)) + 's ago' : 'Waiting for a real driver GPS fix'}
        </Text>}
        {!terminal && (driver ? toPickup : !passengerFresh) && <Text style={[TYPE.caption, { marginTop: SPACE.xs }]}>
          {!driver ? 'Your GPS: ' + gps.message : passengerFresh ? 'Passenger GPS is live'
            : passengerPosition ? 'Passenger GPS paused · last fix ' + Math.max(0, Math.floor((now - passengerPosition.timestamp) / 1000)) + 's ago' : 'Waiting for the passenger\'s GPS'}
        </Text>}
        {!terminal && !(driver ? fresh : passengerFresh) && <Button label="Retry GPS" variant="ghost" size="sm" onPress={gps.retry} />}
        {ride && <RideDetails ride={ride} driver={driver} />}
        {ride?.cancellationReason && <Text style={[TYPE.caption, { marginBottom: SPACE.md }]}>{ride.cancellationReason}</Text>}
        {!terminal && driver && leg?.route && fresh && <Button label={toPickup ? 'Navigate to pickup' : 'Navigate to destination'} icon="navigation-variant" variant="secondary"
          onPress={() => navigation.navigate('Navigation', { ...leg, rideId: ride.id })} style={styles.button} />}
        {driver && action && <Button label={action.label} loading={busy} disabled={!connected}
          onPress={() => action.action === 'arrive' ? perform(action.action) : confirmAction(action.action, action.label + '?')} style={styles.button} />}
        {!terminal && ['accepted', 'arrived', 'searching'].includes(ride.status) &&
          <Button label="Cancel ride" variant="danger" disabled={busy || !connected} onPress={() => confirmAction('cancel', 'Cancel this ride?')} />}
        {terminal && <Button label="View trip history" onPress={() => { dismissRide(); navigation.navigate('History'); }} />}
      </ScrollView>
    </Sheet>
  </BleedScreen>;
}
const styles = StyleSheet.create({
  top: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, top: 0, gap: SPACE.sm },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 }, button: { marginBottom: SPACE.sm },
  marker: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.route, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', ...ELEVATION.floating },
});
