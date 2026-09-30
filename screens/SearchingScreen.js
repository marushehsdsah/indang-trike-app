import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RouteMap from '../components/RouteMap';
import { BleedScreen } from '../components/ui/Screen';
import Button from '../components/ui/Button';
import { Sheet } from '../components/ui/Surfaces';
import ConnectionBanner from '../components/ConnectionBanner';
import RideDetails from '../components/RideDetails';
import LiveLocationMarker from '../components/LiveLocationMarker';
import { useApp } from '../context/AppContext';
import { COLORS, SPACE, TYPE } from '../theme';

export default function SearchingScreen({ navigation }) {
  const { ride, rideAction, dismissRide, connected, gps } = useApp();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(340), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ride && ['accepted', 'arrived', 'in_progress', 'completed'].includes(ride.status)) navigation.replace('ActiveRide');
  }, [ride?.status, navigation]);
  // Leaving this screen does not silently cancel a persisted booking.
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.navigate('Passenger'); return true;
    });
    return () => handler.remove();
  }, [navigation]);
  const cancel = async () => {
    if (busy || !ride) return;
    setBusy(true);
    try { await rideAction(ride.id, 'cancel', { reason: 'Passenger cancelled the request' }); }
    catch (failure) { Alert.alert('Unable to cancel', failure.message); }
    finally { setBusy(false); }
  };
  const searching = ride?.status === 'searching';
  return <BleedScreen>
    <RouteMap pickup={ride?.trip.pickup} destination={ride?.trip.dropoff} route={ride?.route} bottomInset={height}>
      {gps.status === 'ready' && gps.fix && <LiveLocationMarker coordinate={gps.fix} title="Your location" />}
    </RouteMap>
    <View style={[styles.top, { paddingTop: insets.top + SPACE.md }]}><ConnectionBanner /></View>
    <Sheet style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.lg }]} onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>
      <MaterialCommunityIcons name={searching ? 'radar' : 'information-outline'} size={32} color={COLORS.brand} />
      <Text style={[TYPE.heading, { marginTop: SPACE.sm }]}>{searching ? 'Finding a driver' : ride?.status === 'no_driver' ? 'No driver available' : 'Request cancelled'}</Text>
      <Text style={[TYPE.caption, { marginTop: SPACE.sm, marginBottom: SPACE.md }]}>{searching
        ? 'We are offering your request to nearby available drivers. Your ride starts when a driver accepts.'
        : 'You can return home or try another request.'}</Text>
      {ride && <RideDetails ride={ride} />}
      {searching ? <>
        <Button label="Cancel request" variant="danger" disabled={!connected} loading={busy} onPress={cancel} />
        <Button label="Back to home" variant="ghost" onPress={() => navigation.navigate('Passenger')} />
      </> : <Button label="Return home" onPress={() => { dismissRide(); navigation.navigate('Passenger'); }} />}
    </Sheet>
  </BleedScreen>;
}
const styles = StyleSheet.create({
  top: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, top: 0 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
