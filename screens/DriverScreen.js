import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BleedScreen } from '../components/ui/Screen';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { Money } from '../components/ui/Surfaces';
import RouteMap from '../components/RouteMap';
import TodaZoneLayer from '../components/TodaZoneLayer';
import BottomNav from '../components/BottomNav';
import StatusPill from '../components/StatusPill';
import TripStops from '../components/TripStops';
import { FloatingCard, MapBottom, MapTop } from '../components/map/MapChrome';
import { useConnectionStatus, useGpsStatus } from '../hooks/useMapStatus';
import useReducedMotion from '../hooks/useReducedMotion';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { fareSummary } from '../i18n/messages';
import useAccountHistory from '../hooks/useAccountHistory';
import { ACTIVE_STATUSES, formatPeso, isFreshFix } from '../utils/rideState';
import { getMunicipalityAt } from '../data/indangMap';
import { findToda, getBarangayAt, getTodaZoneShape } from '../data/todaZones';
import { tapFeedback } from '../utils/feedback';
import { COLORS, ELEVATION, FONTS, RADIUS, SPACE, TYPE } from '../theme';

// How long the server holds an offer for one driver (dispatch.js offerMs).
const OFFER_SECONDS = 20;

// The yellow bar that drains across the top of an offer while it lasts.
function OfferCountdown({ offerId, seconds }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(Math.min(1, seconds / OFFER_SECONDS))).current;
  useEffect(() => {
    if (reduced) return undefined;
    progress.setValue(Math.min(1, seconds / OFFER_SECONDS));
    const animation = Animated.timing(progress, { toValue: 0, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
    // Restarts only for a new offer; the per-second tick must not restart it.
  }, [offerId, reduced]);
  useEffect(() => { if (reduced) progress.setValue(Math.min(1, seconds / OFFER_SECONDS)); }, [reduced, seconds, progress]);
  return (
    <View style={styles.countdownTrack}>
      <Animated.View style={[styles.countdownBar, { transform: [{ scaleX: progress }] }]} />
    </View>
  );
}

export default function DriverScreen({ navigation }) {
  const { user, ride, offer, setAvailable, rideAction, gps, connected, serverOffset } = useApp();
  const { t } = useI18n();
  const { stats } = useAccountHistory();
  const connection = useConnectionStatus();
  const gpsStatus = useGpsStatus();
  const mapRef = useRef(null);
  const [busy, setBusy] = useState(false), [bottomHeight, setBottomHeight] = useState(0), [now, setNow] = useState(Date.now());
  const [zoneOpen, setZoneOpen] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = ride && ACTIVE_STATUSES.includes(ride.status);
  const seconds = offer ? Math.max(0, Math.ceil((new Date(offer.offerExpiresAt).getTime() - now - serverOffset) / 1000)) : 0;
  const fresh = gps.status === 'ready' && isFreshFix(gps.fix, now), available = user.available && connected && fresh;
  // Location is still shared outside the service area; requests stay inside it.
  const outside = fresh && gps.inServiceArea === false;
  // An Indang TODA's drivers get requests only inside its barangays, which
  // their map shows; drivers of other TODAs keep the town-wide area.
  const toda = findToda(user.toda);
  const todaZone = useMemo(() => (toda ? getTodaZoneShape(toda) : null), [toda?.name]);
  const fixLatitude = fresh ? gps.fix.latitude : undefined, fixLongitude = fresh ? gps.fix.longitude : undefined;
  const barangay = useMemo(() => (Number.isFinite(fixLatitude) ? getBarangayAt({ latitude: fixLatitude, longitude: fixLongitude }) : null), [fixLatitude, fixLongitude]);
  const town = useMemo(() => (Number.isFinite(fixLatitude) ? getMunicipalityAt({ latitude: fixLatitude, longitude: fixLongitude })?.name : null), [fixLatitude, fixLongitude]);
  const outsideToda = Boolean(toda && fresh && !outside && !toda.barangays.includes(barangay));
  const perform = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (failure) { Alert.alert(t('driver.unableToUpdate'), failure.message); }
    finally { setBusy(false); }
  };
  const respond = (action) => perform(async () => {
    await rideAction(offer.id, action, { offerId: offer.offerId });
    if (action === 'accept') navigation.navigate('ActiveRide');
  });

  // The pill: connection first, then GPS, then where the driver is relative
  // to the areas their requests come from.
  const status = connection ?? (outside ? { tone: 'alert', icon: 'map-marker-alert-outline', label: t('driver.outsideArea') }
    : gpsStatus.tone !== 'live' ? gpsStatus
    : outsideToda ? { tone: 'alert', icon: 'map-marker-alert-outline', label: barangay ? t('driver.outsideTodaIn', { toda: toda.name, barangay }) : t('driver.outsideToda', { toda: toda.name }) }
    : { tone: 'live', icon: 'crosshairs-gps', label: [barangay, town].filter(Boolean).join(', ') || t('status.live') });

  // The card's coloured band: green when requests can reach the driver.
  const band = active ? { tone: 'live', title: t('driver.onTrip') }
    : !user.available ? { tone: 'off', title: t('driver.offline') }
    : !connected || !fresh ? { tone: 'wait', title: t('driver.waitingGps') }
    : outside ? { tone: 'alert', title: t('driver.outsideArea') }
    : { tone: 'live', title: t('driver.online') };
  const bandColors = { live: [COLORS.brand, COLORS.onBrand], off: [COLORS.ink, '#FFFFFF'], wait: [COLORS.accent, COLORS.onAccent], alert: [COLORS.danger, '#FFFFFF'] }[band.tone];
  const subtitle = active ? t('driver.onTripHint') : !user.available ? t('driver.offlineHint')
    : !connected || !fresh ? t(`gps.${gps.status}`) : outside ? t('driver.outsideAreaHint') : t('driver.onlineHint');

  return <BleedScreen>
    <View style={styles.mapArea}>
      <RouteMap ref={mapRef} pickup={offer?.trip.pickup} destination={offer?.trip.dropoff} route={offer?.route}
        currentLocation={fresh ? gps.fix : null} bottomInset={bottomHeight}>
        {todaZone && <TodaZoneLayer shape={todaZone} />}
        {/* MapLibre draws a marker into a bitmap on every layout and crashes on a
            zero-width one, which a bare icon (text) can briefly have; the
            fixed-size frame never does. */}
        {fresh && <ViewAnnotation lngLat={[gps.fix.longitude, gps.fix.latitude]} title={t('map.yourLocation')} anchor="center">
          <View style={styles.gpsFrame}>
            <View style={styles.gpsMarker}><MaterialCommunityIcons name="rickshaw" size={24} color={COLORS.onBrand} /></View>
          </View>
        </ViewAnnotation>}
      </RouteMap>

      <MapTop><StatusPill {...status} /></MapTop>

      <MapBottom edge={false} onHeight={setBottomHeight}
        rail={fresh && !offer ? <IconButton icon="crosshairs-gps" label={t('map.recenter')} onPress={() => mapRef.current?.fit()} /> : null}>
        {offer && !active ? (
          <FloatingCard style={styles.offerCard}>
            <OfferCountdown offerId={offer.offerId} seconds={seconds} />
            <View style={styles.offerBody}>
              <View style={styles.offerHeader} accessibilityLiveRegion="polite">
                <Text style={[TYPE.heading, styles.flex]}>{t('driver.newRequest')}</Text>
                <Text style={[TYPE.metric, styles.seconds]} accessibilityLabel={t('driver.secondsLeft', { seconds })}>{seconds}s</Text>
              </View>
              <TripStops pickup={offer.trip.pickup.name} dropoff={offer.trip.dropoff.name} lines={2} style={styles.offerStops} />
              {offer.note ? <View style={styles.offerNote}>
                <MaterialCommunityIcons name="message-reply-text-outline" size={18} color={COLORS.inkSecondary} />
                <Text style={[TYPE.body, styles.flex]}>{offer.note}</Text>
              </View> : null}
              <View style={styles.offerFacts}>
                <Text style={[TYPE.caption, styles.flex]}>
                  {[offer.route?.durationLabel, offer.route?.distanceLabel, t('trip.riders', { count: offer.passengers })].filter(Boolean).join(' · ')}
                </Text>
                <Money amount={offer.fare} size={26} color={COLORS.brand} />
              </View>
              {offer.fareDetails ? <Text style={[TYPE.caption, styles.offerFare]}>{fareSummary(t, offer.fareDetails)}</Text> : null}
              <View style={styles.offerActions}>
                <Button label={t('driver.decline')} variant="outline" disabled={busy || !connected} onPress={() => respond('decline')} style={styles.decline} />
                <Button label={t('driver.accept')} variant="hire" loading={busy} disabled={!connected || seconds === 0 || !fresh}
                  onPress={() => respond('accept')} style={styles.accept} />
              </View>
            </View>
          </FloatingCard>
        ) : (
          <FloatingCard style={styles.homeCard}>
            <View style={[styles.band, { backgroundColor: bandColors[0] }]}>
              <View style={[styles.bandDot, { backgroundColor: bandColors[1] }]} />
              <Text style={[TYPE.heading, { color: bandColors[1] }]} accessibilityRole="header" accessibilityLiveRegion="polite">{band.title}</Text>
            </View>
            <View style={styles.homeBody}>
              <Text style={TYPE.body}>{subtitle}</Text>
              {!active && <View style={styles.today}>
                <Text style={[TYPE.caption, styles.todayLabel]}>{t('driver.today')}</Text>
                <Text style={styles.todayValue}>{stats?.todayTrips ?? '—'}</Text>
                <Text style={[TYPE.caption, styles.todayUnit]}>{t('driver.tripsUnit')}</Text>
                <Text style={styles.todayValue}>{stats ? formatPeso(stats.todayFare) : '—'}</Text>
                <Text style={[TYPE.caption, styles.todayUnit]}>{t('driver.cashUnit')}</Text>
              </View>}
              {toda && !active && <>
                <Pressable onPress={() => { tapFeedback(); setZoneOpen((value) => !value); }} accessibilityRole="button" accessibilityState={{ expanded: zoneOpen }}
                  style={({ pressed }) => [styles.zone, pressed && styles.pressed]}>
                  <View style={styles.zoneSwatch} />
                  <Text style={[TYPE.label, styles.flex]} numberOfLines={1}>{t('driver.zone', { toda: toda.name, count: toda.barangays.length })}</Text>
                  <MaterialCommunityIcons name={zoneOpen ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.inkSecondary} />
                </Pressable>
                {zoneOpen && <Text style={[TYPE.caption, styles.zoneList]}>{t('driver.zoneList', { barangays: toda.barangays.join(', ') })}</Text>}
              </>}
              {active ? <Button label={t('driver.returnToTrip')} variant="brand" onPress={() => navigation.navigate('ActiveRide')} style={styles.mainAction} />
                : <View style={styles.homeActions}>
                  {user.available && !fresh && <Button label={t('common.retryGps')} variant="tonal" size="md" onPress={gps.retry} style={styles.flex} />}
                  <Button label={t(user.available ? 'driver.goOffline' : 'driver.goOnline')} variant={user.available ? 'outline' : 'brand'}
                    size={user.available ? 'md' : 'lg'} loading={busy} disabled={!connected}
                    onPress={() => perform(() => setAvailable(!user.available))} style={styles.flex} />
                </View>}
            </View>
          </FloatingCard>
        )}
      </MapBottom>
    </View>
    <BottomNav active="home" navigation={navigation} />
  </BleedScreen>;
}

const styles = StyleSheet.create({
  mapArea: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  gpsFrame: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  gpsMarker: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand, borderWidth: 3, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', ...ELEVATION.floating,
  },

  homeCard: { padding: 0, overflow: 'hidden' },
  band: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  bandDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACE.sm },
  homeBody: { padding: SPACE.lg },
  today: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: SPACE.md },
  todayLabel: { marginRight: SPACE.sm },
  todayValue: { fontFamily: FONTS.bold, fontSize: 22, lineHeight: 26, color: COLORS.ink },
  todayUnit: { marginLeft: SPACE.xs, marginRight: SPACE.lg },
  zone: {
    flexDirection: 'row', alignItems: 'center', minHeight: 48, marginTop: SPACE.md,
    borderTopWidth: 1, borderTopColor: COLORS.line,
  },
  zoneSwatch: { width: 14, height: 14, borderRadius: 4, backgroundColor: 'rgba(9, 92, 55, 0.25)', borderWidth: 2, borderColor: COLORS.brand, marginRight: SPACE.sm },
  zoneList: { marginBottom: SPACE.xs },
  homeActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  mainAction: { marginTop: SPACE.lg },

  offerCard: { padding: 0, overflow: 'hidden' },
  countdownTrack: { height: 8, backgroundColor: COLORS.accentTint },
  countdownBar: { height: 8, backgroundColor: COLORS.accent, transformOrigin: 'left' },
  offerBody: { padding: SPACE.lg },
  offerHeader: { flexDirection: 'row', alignItems: 'center' },
  seconds: { color: COLORS.accentDark },
  offerStops: { marginTop: SPACE.md },
  offerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, marginTop: SPACE.md },
  offerFacts: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  offerFare: { marginTop: SPACE.xs },
  offerActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  decline: { flex: 1 },
  accept: { flex: 2 },
});
