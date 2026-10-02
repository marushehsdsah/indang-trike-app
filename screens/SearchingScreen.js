import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Easing, StyleSheet, Text, View } from 'react-native';
import RouteMap from '../components/RouteMap';
import StatusPill from '../components/StatusPill';
import { TripFacts } from '../components/RideDetails';
import LiveLocationMarker from '../components/LiveLocationMarker';
import { FloatingCard, MapBottom, MapTop } from '../components/map/MapChrome';
import { BleedScreen } from '../components/ui/Screen';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { useConnectionStatus } from '../hooks/useMapStatus';
import useReducedMotion from '../hooks/useReducedMotion';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { COLORS, SPACE, TYPE } from '../theme';

// A dot that keeps pulsing while the request is out to drivers.
function SearchPulse() {
  const scale = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { scale.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(scale, { toValue: 1, duration: 1600, easing: Easing.out(Easing.exp), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [scale, reduced]);
  return (
    <View style={styles.pulse}>
      <Animated.View style={[styles.pulseRing, {
        opacity: scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }) }],
      }]} />
      <View style={styles.pulseCore} />
    </View>
  );
}

export default function SearchingScreen({ navigation }) {
  const { ride, rideAction, dismissRide, connected, gps } = useApp();
  const { t } = useI18n();
  const connection = useConnectionStatus();
  const [bottomHeight, setBottomHeight] = useState(0), [busy, setBusy] = useState(false);
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
    catch (failure) { Alert.alert(t('searching.unableToCancel'), failure.message); }
    finally { setBusy(false); }
  };
  const searching = ride?.status === 'searching';
  const home = () => navigation.navigate('Passenger');
  const bookAgain = () => {
    const destination = ride?.trip.dropoff;
    dismissRide();
    navigation.navigate('Passenger', destination ? { destination } : undefined);
  };

  return <BleedScreen>
    <RouteMap pickup={ride?.trip.pickup} destination={ride?.trip.dropoff} route={ride?.route} bottomInset={bottomHeight}>
      {gps.status === 'ready' && gps.fix && <LiveLocationMarker coordinate={gps.fix} title={t('map.yourLocation')} />}
    </RouteMap>
    <MapTop>
      <View style={styles.topRow}>
        <IconButton icon="arrow-left" label={t('common.home')} onPress={home} />
        {connection && <StatusPill {...connection} style={styles.topStatus} />}
      </View>
    </MapTop>
    <MapBottom onHeight={setBottomHeight}>
      <FloatingCard>
        <View style={styles.header} accessibilityLiveRegion="polite">
          {searching && <SearchPulse />}
          <View style={styles.headerText}>
            <Text style={TYPE.heading}>{t(searching ? 'searching.title' : ride?.status === 'no_driver' ? 'ride.status.no_driver' : 'ride.status.cancelled')}</Text>
            <Text style={TYPE.caption}>{t(searching ? 'searching.subtitle' : 'searching.endedSubtitle')}</Text>
          </View>
        </View>
        {ride && <TripFacts ride={ride} style={styles.facts} />}
        {searching ? <View style={styles.actions}>
          <Button label={t('searching.cancel')} variant="danger" size="md" disabled={!connected} loading={busy} onPress={cancel} style={styles.action} />
        </View> : <View style={styles.actions}>
          <Button label={t('common.home')} variant="outline" size="md" onPress={() => { dismissRide(); home(); }} style={styles.action} />
          {ride?.status === 'no_driver' && <Button label={t('searching.bookAgain')} variant="hire" size="md" onPress={bookAgain} style={styles.action} />}
        </View>}
      </FloatingCard>
    </MapBottom>
  </BleedScreen>;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  topStatus: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1 },
  pulse: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: SPACE.md },
  pulseRing: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand },
  pulseCore: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.brand, borderWidth: 3, borderColor: '#FFFFFF' },
  facts: { marginTop: SPACE.lg },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  action: { flex: 1 },
});
