import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RouteMap from '../components/RouteMap';
import StatusPill from '../components/StatusPill';
import Plate from '../components/Plate';
import LiveLocationMarker from '../components/LiveLocationMarker';
import { PersonRow, TripFacts } from '../components/RideDetails';
import { FloatingCard, MapBottom, MapTop } from '../components/map/MapChrome';
import { BleedScreen } from '../components/ui/Screen';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { Divider, Money } from '../components/ui/Surfaces';
import { useConnectionStatus, useGpsStatus } from '../hooks/useMapStatus';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { getRoadGraph } from '../data/roadNetwork';
import { isInIndangServiceArea } from '../data/indangMap';
import { resolveBookingRoute } from '../utils/bookingRoute';
import { formatDistance, formatDuration } from '../utils/routeDirections';
import { distanceToStop, hasReachedStop, remainingRoute } from '../utils/tripProgress';
import { ACTIVE_STATUSES, getDriverAction, isFreshFix } from '../utils/rideState';
import { tapFeedback } from '../utils/feedback';
import { COLORS, ELEVATION, RADIUS, SPACE, TYPE } from '../theme';

const secondsSince = (fix, now) => Math.max(0, Math.floor((now - fix.timestamp) / 1000));

export default function ActiveRideScreen({ navigation }) {
  const { user, ride, gps, rideAction, connected, dismissRide } = useApp();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const connection = useConnectionStatus();
  const ownGps = useGpsStatus();
  const [bottomHeight, setBottomHeight] = useState(0), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false), [reachedStage, setReachedStage] = useState(null);
  const mapRef = useRef(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const driver = user.role === 'driver', home = driver ? 'Driver' : 'Passenger';
  const position = driver ? gps.fix : ride?.driverLocation;
  const fresh = isFreshFix(position, now) && (driver ? connected && gps.status === 'ready' : connected && ride?.driverConnected && ride?.driverLocationAvailable !== false);
  const toPickup = ride && ['accepted', 'arrived'].includes(ride.status);
  // Each side also sees the passenger: the driver on the way to pickup (from the
  // passenger's shared GPS), the passenger themselves from their own device.
  const passengerPosition = driver ? (toPickup ? ride?.passengerLocation : null) : (gps.status === 'ready' ? gps.fix : null);
  const passengerFresh = isFreshFix(passengerPosition, now);
  const riding = ride?.status === 'in_progress';
  // Where the trike is: the driver's live GPS or, for a passenger riding in
  // it, their own.
  const vehicle = fresh ? position : (!driver && riding && passengerFresh ? passengerPosition : null);
  // The line on the map. To pickup: the road route from the driver. While
  // riding: only the road still ahead of the trike, routed again from where it
  // is if it leaves the planned route. `live` marks a line that follows the trike.
  const leg = useMemo(() => {
    if (!ride) return null;
    if (toPickup) {
      if (!fresh) return { trip: { pickup: null, dropoff: ride.trip.pickup }, route: null };
      const pickup = { name: 'Driver location', coordinate: position };
      const result = resolveBookingRoute({ roadGraph: getRoadGraph(), pickup, destination: ride.trip.pickup, isInServiceArea: isInIndangServiceArea });
      return { trip: { pickup, dropoff: ride.trip.pickup }, route: result.status === 'ok' ? result.details : null, live: true };
    }
    if (riding && vehicle) {
      const remaining = remainingRoute(ride.route, vehicle);
      if (remaining) {
        return { trip: ride.trip, live: true, route: { ...ride.route, coordinates: remaining.coordinates,
          distanceLabel: formatDistance(remaining.remainingMeters), durationLabel: formatDuration(remaining.remainingSeconds) } };
      }
      const result = resolveBookingRoute({ roadGraph: getRoadGraph(), pickup: { coordinate: vehicle }, destination: ride.trip.dropoff, isInServiceArea: isInIndangServiceArea });
      if (result.status === 'ok') return { trip: { pickup: { name: 'Trike location', coordinate: vehicle }, dropoff: ride.trip.dropoff }, route: result.details, live: true };
    }
    return { trip: ride.trip, route: ride.route };
  }, [ride?.id, ride?.status, position?.latitude, position?.longitude, fresh, vehicle?.latitude, vehicle?.longitude]);
  // The guide gets whole routes: it follows the trike along them itself.
  const guideLeg = toPickup ? leg : ride ? { trip: ride.trip, route: ride.route } : null;
  const perform = async (action) => {
    if (busy || !ride) return;
    setBusy(true);
    try { await rideAction(ride.id, action, action === 'cancel' ? { reason: 'Cancelled before pickup' } : {}); }
    catch (failure) { Alert.alert(t('active.unableToUpdate'), failure.message); }
    finally { setBusy(false); }
  };
  const confirmAction = (action) => Alert.alert(t(`active.confirm.${action}.title`), t(`active.confirm.${action}.message`),
    [{ text: t('active.keepTrip'), style: 'cancel' }, { text: t('common.confirm'), onPress: () => perform(action) }]);
  const action = ride ? getDriverAction(ride.status) : null;
  // "Arrived at pickup" and "Complete trip" appear only once the driver's own
  // live GPS is at that stop; until then the card says how far it is. Once
  // reached, the button stays for that stage, so GPS jitter at the edge of the
  // radius cannot make it flicker.
  const ownFix = driver && gps.status === 'ready' && isFreshFix(gps.fix, now) ? gps.fix : null;
  const target = action?.action === 'arrive' ? { stop: ride.trip.pickup.coordinate, route: leg?.route, name: 'arrive' }
    : action?.action === 'complete' ? { stop: ride.trip.dropoff.coordinate, route: ride.route, name: 'complete' } : null;
  const stageKey = ride ? `${ride.id}:${ride.status}` : null;
  const nearStop = Boolean(target) && hasReachedStop(ownFix, target.stop, target.route);
  useEffect(() => { if (nearStop) setReachedStage(stageKey); }, [nearStop, stageKey]);
  const atStop = !target || nearStop || reachedStage === stageKey;
  const terminal = !ride || !ACTIVE_STATUSES.includes(ride.status);
  const cancellable = !terminal && ['accepted', 'arrived', 'searching'].includes(ride.status);

  // The pill says whether the position the user is watching is live: the
  // driver's own GPS, or for a passenger, the driver's.
  const driverLocationStatus = fresh ? { tone: 'live', icon: 'rickshaw', label: t('active.driverLive') }
    : position ? { tone: 'wait', icon: 'rickshaw', label: t('active.driverPaused', { seconds: secondsSince(position, now) }) }
    : { tone: 'wait', icon: 'rickshaw', label: t('active.driverWaiting') };
  const status = connection ?? (driver ? ownGps : driverLocationStatus);
  // The other side's GPS, when it matters: the passenger's while the driver
  // heads to pickup, or the passenger's own when it is not live.
  const sideNote = terminal ? null : driver
    ? (toPickup ? (passengerFresh ? t('active.passengerLive')
      : passengerPosition ? t('active.passengerPaused', { seconds: secondsSince(passengerPosition, now) }) : t('active.passengerWaiting')) : null)
    : (!passengerFresh ? t('active.yourGps', { message: t(`gps.${gps.status}`) }) : null);
  const eta = leg?.route?.durationLabel ?? null;

  const finish = (route) => { dismissRide(); navigation.navigate(route); };
  const person = driver ? ride?.passenger : ride?.driver;

  return <BleedScreen>
    {/* The camera frames each stage once (and when its route first appears),
        so the live line can shrink behind the trike without moving the map. */}
    <RouteMap ref={mapRef} pickup={toPickup || leg?.live ? null : ride?.trip.pickup} destination={toPickup ? ride?.trip.pickup : ride?.trip.dropoff}
      route={terminal ? null : leg?.route} fitKey={ride ? `${ride.id}:${ride.status}:${leg?.route ? 'route' : 'none'}` : undefined}
      bottomInset={bottomHeight}>
      {/* A fixed-size frame: MapLibre draws markers into bitmaps and crashes on a zero-width one. */}
      {position && !terminal && <ViewAnnotation lngLat={[position.longitude, position.latitude]}
        title={t(fresh ? 'active.driverLocationLive' : 'active.driverLocationLast')} anchor="center">
        <View style={styles.markerFrame}>
          <View style={[styles.marker, !fresh && styles.markerStale]}><MaterialCommunityIcons name="rickshaw" size={24} color="#FFF" /></View>
        </View>
      </ViewAnnotation>}
      {passengerPosition && !terminal && <LiveLocationMarker coordinate={passengerPosition} stale={!passengerFresh}
        title={driver ? t(passengerFresh ? 'active.passengerLocationLive' : 'active.passengerLocationLast') : t('map.yourLocation')} />}
    </RouteMap>

    <MapTop>
      <View style={styles.topRow}>
        <IconButton icon="arrow-left" label={t('common.home')} onPress={() => navigation.navigate(home)} />
        {!terminal && <StatusPill {...status} style={styles.topStatus} />}
      </View>
    </MapTop>

    {/* While details are open the camera keeps the collapsed card's inset,
        so opening them never moves the map. */}
    <MapBottom
      onHeight={(value) => { if (!expanded) setBottomHeight(value); }}
      rail={terminal ? null : <>
        {leg?.route && <IconButton icon="map-marker-path" label={t('active.fitRoute')} onPress={() => mapRef.current?.fit()} />}
        {driver && guideLeg?.route && fresh && <Button label={t('active.navigate')} icon="navigation-variant" variant="route" size="md" full={false}
          onPress={() => navigation.navigate('Navigation', { ...guideLeg, rideId: ride.id })} style={styles.navigate} />}
      </>}
    >
      <FloatingCard style={{ maxHeight: height * 0.72 }}>
        {terminal ? <>
          <Text style={TYPE.heading} accessibilityLiveRegion="polite">{t(`ride.status.${ride?.status ?? 'none'}`)}</Text>
          {ride?.status === 'completed' && <View style={styles.paid}>
            <Money amount={ride.fare} size={34} color={COLORS.brand} />
            <Text style={[TYPE.body, styles.paidText]}>{t(driver ? 'active.collected' : 'active.paid')}</Text>
          </View>}
          {ride?.cancellationReason ? <Text style={[TYPE.caption, styles.reason]}>{ride.cancellationReason}</Text> : null}
          <View style={styles.actions}>
            <Button label={t('active.history')} variant="outline" size="md" onPress={() => finish('History')} style={styles.action} />
            <Button label={t('common.done')} variant="brand" size="md" onPress={() => finish(home)} style={styles.action} />
          </View>
        </> : <>
          <View style={styles.header}>
            <Text style={[TYPE.heading, styles.title]} accessibilityLiveRegion="polite">{t(driver ? `active.driverStatus.${ride.status}` : `ride.status.${ride.status}`)}</Text>
            {eta && <View style={styles.eta}>
              <Text style={TYPE.metric}>{eta}</Text>
              <Text style={TYPE.caption}>{t(toPickup ? 'active.etaPickup' : leg?.live ? 'active.etaDropoff' : 'active.etaTrip')}</Text>
            </View>}
          </View>
          {sideNote && <Pressable onPress={driver ? undefined : gps.retry} disabled={driver || passengerFresh}
            style={styles.sideNote} accessibilityRole={driver ? 'text' : 'button'}>
            <Text style={TYPE.caption}>{sideNote}</Text>
          </Pressable>}

          <PersonRow person={person} style={styles.person}
            subtitle={driver ? t('trip.riders', { count: ride.passengers }) : [person?.toda, t('active.yourDriver')].filter(Boolean).join(' · ')} />
          {!driver && person && ride.status !== 'in_progress' && <View style={styles.plateRow}>
            <Plate plate={person.plate} toda={person.toda} />
            <Text style={[TYPE.caption, styles.plateHint]}>{t('active.checkPlate')}</Text>
          </View>}

          {driver && action && (atStop
            ? <Button label={t(`driver.action.${action.action}`)} variant="brand" loading={busy} disabled={!connected}
              onPress={() => (action.action === 'arrive' ? perform(action.action) : confirmAction(action.action))} style={styles.primary} />
            : <View style={styles.gate} accessibilityLiveRegion="polite">
              <MaterialCommunityIcons name={ownFix ? 'map-marker-distance' : 'crosshairs-question'} size={22} color={COLORS.inkSecondary} />
              <Text style={[TYPE.body, styles.gateText]}>
                {ownFix ? t(`active.${target.name}Hint`, { distance: formatDistance(distanceToStop(ownFix, target.stop, target.route)) })
                  : t(`active.${target.name}NoGps`)}
              </Text>
            </View>)}

          <Divider style={styles.divider} />
          <Pressable
            onPress={() => { tapFeedback(); setExpanded((value) => !value); }}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
          >
            <Text style={[TYPE.label, styles.toggleText]}>{t(expanded ? 'active.hideDetails' : 'active.showDetails')}</Text>
            <MaterialCommunityIcons name={expanded ? 'chevron-down' : 'chevron-up'} size={22} color={COLORS.brand} />
          </Pressable>
          {expanded && <ScrollView style={styles.details} showsVerticalScrollIndicator={false}>
            <TripFacts ride={ride} />
            {cancellable && <Button label={t('active.cancel')} variant="danger" size="md" disabled={busy || !connected}
              onPress={() => confirmAction('cancel')} style={styles.cancel} />}
          </ScrollView>}
        </>}
      </FloatingCard>
    </MapBottom>
  </BleedScreen>;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  topStatus: { flexShrink: 1 },
  markerFrame: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  marker: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.route, borderWidth: 3, borderColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', ...ELEVATION.floating,
  },
  markerStale: { backgroundColor: COLORS.inkMuted },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { flex: 1, marginRight: SPACE.md },
  eta: { alignItems: 'flex-end' },
  sideNote: { marginTop: SPACE.xs },
  person: { marginTop: SPACE.md },
  plateRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md, gap: SPACE.md },
  plateHint: { flex: 1 },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  primary: { marginTop: SPACE.lg },
  // Holds the button's place, so the card keeps its height when it appears.
  gate: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 56, marginTop: SPACE.lg,
    paddingHorizontal: SPACE.lg, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceAlt,
  },
  gateText: { flex: 1, color: COLORS.inkSecondary },
  navigate: { ...ELEVATION.floating },
  action: { flex: 1 },
  divider: { marginTop: SPACE.lg },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  toggleText: { color: COLORS.brand },
  pressed: { opacity: 0.7 },
  details: { flexGrow: 0, flexShrink: 1 },
  cancel: { marginTop: SPACE.lg },
  paid: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm, marginTop: SPACE.sm },
  paidText: { flex: 1 },
  reason: { marginTop: SPACE.sm },
});
