import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { isFreshFix, ACTIVE_STATUSES } from '../utils/rideState';
import { StatusBar } from 'expo-status-bar';
import { Camera, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import IndangMapLayers from '../components/IndangMapLayers';
import PlacesLayer from '../components/PlacesLayer';
import { FloatingCard, MapBottom } from '../components/map/MapChrome';
import RouteLine from '../components/RouteLine';
import { NAVIGATION_STYLE_URL } from '../components/mapStyles';
import { getManeuverIcon } from '../components/maneuverIcons';
import { INDANG_MIN_ZOOM, isInIndangServiceArea } from '../data/indangMap';
import { getRoadGraph } from '../data/roadNetwork';
import { resolveBookingRoute } from '../utils/bookingRoute';
import { haversineDistance } from '../utils/pathfinding';
import { getLngLatBounds, toLngLat } from '../utils/geojson';
import {
  OFF_ROUTE_METERS,
  createRouteTrack,
  formatClockTime,
  formatManeuverDistance,
  getGuidance,
  getRemainingCoordinates,
  getTrackHeading,
  pointAlongTrack,
  projectOntoTrack,
} from '../utils/navigationGuide';
import { formatDistance, formatDuration } from '../utils/routeDirections';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { COLORS, ELEVATION, FONTS, RADIUS, SPACE, TYPE } from '../theme';
import { selectionFeedback } from '../utils/feedback';
import { useI18n } from '../i18n';
import { stepInstruction } from '../i18n/messages';

// MapLibre zoom levels (one lower than Google's for the same scale).
const CAMERA_VIEWS = {
  '3d': { pitch: 60, zoom: 17 },
  '2d': { pitch: 0, zoom: 16 },
};
const GPS_CAMERA_MS = 1000;
const ENGAGE_CAMERA_MS = 700;
const OVERVIEW_MS = 700;
const OFF_ROUTE_FIXES_BEFORE_REROUTE = 2;
const REROUTE_COOLDOWN_MS = 8000;
// A rider who has not moved this far since the last reroute would only get the
// same route again, so the guide waits instead of recalculating on every fix.
const REROUTE_MOVE_METERS = 40;
const NOTICE_MS = 3500;
// While following, the vehicle sits this far down the map so most of the view
// shows the road ahead.
const FOLLOW_POSITION = 0.68;
const PUCK_SIZE = 46;
const TRIM_STEP_METERS = 10;
const OVERVIEW_MARGIN = 48;
const INITIAL_PADDING = { top: 120, right: 50, bottom: 220, left: 50 };

function ManeuverBanner({ guidance, destinationName, topPadding, onLayout }) {
  const { t } = useI18n();
  const { nextStep, thenStep, arrived } = guidance;
  if (!nextStep) return null;
  const arriving = arrived || nextStep.type === 'arrive';
  const distance = formatManeuverDistance(guidance.distanceToNextMeters);
  const title = arrived ? t('guide.arrived') : distance === 'Now' ? t('guide.now') : distance;
  const instruction = arriving ? destinationName : stepInstruction(t, nextStep, destinationName);

  return (
    <View style={[styles.bannerArea, { paddingTop: topPadding + 8 }]} pointerEvents="none" onLayout={onLayout}>
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <View style={styles.bannerIcon}>
          <MaterialCommunityIcons name={getManeuverIcon(arriving ? 'arrive' : nextStep.type)} size={32} color={COLORS.onBrand} />
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.bannerDistance}>{title}</Text>
          <Text style={styles.bannerInstruction} numberOfLines={2}>{instruction}</Text>
        </View>
      </View>
      {thenStep && (
        <View style={styles.thenPill}>
          <Text style={styles.thenText}>{t('guide.then')}</Text>
          <MaterialCommunityIcons name={getManeuverIcon(thenStep.type)} size={18} color="#FFF" />
        </View>
      )}
    </View>
  );
}

// The 2D/3D control shows text rather than an icon, so it is its own button.
function ViewToggle({ label, onPress }) {
  const { t } = useI18n();
  return (
    <Pressable
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
      onPress={() => {
        selectionFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('guide.switchView', { view: label })}
    >
      <Text style={[TYPE.subheading, styles.roundButtonText]}>{label}</Text>
    </Pressable>
  );
}

// `floating` adds a shadow for the on-screen overlay; the map marker version
// sits in a fixed frame without one.
function VehiclePuck({ floating = false }) {
  return (
    <View style={[styles.puck, floating && styles.puckShadow]}>
      <MaterialCommunityIcons name="navigation" size={24} color="#FFF" />
    </View>
  );
}

// Waze-style turn-by-turn guide over a confirmed route: a tilted camera that
// follows the road ahead, the next maneuver, and the time and distance left.
// Position comes only from measured GPS, with projection and offline rerouting.
function NavigationGuide({ navigation, trip, initialRoute }) {
  const insets = useSafeAreaInsets();
  const { gps } = useApp();
  const { t } = useI18n();
  const hasLiveFix = gps.status === 'ready' && isFreshFix(gps.fix);
  const [hasPosition, setHasPosition] = useState(false);
  const cameraRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  // Markers are drawn upright on screen, so a rotated one needs the map's bearing.
  const [mapBearing, setMapBearing] = useState(0);
  const [route, setRoute] = useState(initialRoute);
  const track = useMemo(() => createRouteTrack(route), [route]);
  const [progress, setProgress] = useState({ distance: 0, offRoute: null });
  const [view, setView] = useState('3d');
  const [following, setFollowing] = useState(true);
  const [framing, setFraming] = useState('follow');
  const [gpsStatus, setGpsStatus] = useState(null);
  const [notice, setNotice] = useState(null);
  const [layout, setLayout] = useState({ height: 0, banner: 0, panel: 0 });

  const guidance = getGuidance(route, track, progress.distance);
  const lastHeadingRef = useRef(0);
  const vehicle = useMemo(() => {
    if (!hasLiveFix || !hasPosition) return { coordinate: null, heading: 0 };
    if (progress.offRoute) {
      return { coordinate: progress.offRoute.coordinate, heading: progress.offRoute.heading ?? lastHeadingRef.current };
    }
    return { coordinate: pointAlongTrack(track, progress.distance), heading: getTrackHeading(track, progress.distance) };
  }, [track, progress, hasLiveFix, hasPosition]);
  lastHeadingRef.current = vehicle.heading;
  // Trimmed in whole steps so the route line is re-sent to the map only every
  // TRIM_STEP_METERS rather than on every position update; the gap it leaves
  // behind the vehicle is smaller than the vehicle marker drawn over it.
  const trimDistance = Math.floor(progress.distance / TRIM_STEP_METERS) * TRIM_STEP_METERS;
  const offRoute = Boolean(progress.offRoute);
  const remainingCoordinates = useMemo(
    () => (offRoute ? track.coordinates : getRemainingCoordinates(track, trimDistance)),
    [track, trimDistance, offRoute],
  );

  const setLayoutValue = (key) => ({ nativeEvent }) => {
    const value = Math.round(nativeEvent.layout.height);
    setLayout((current) => (current[key] === value ? current : { ...current, [key]: value }));
  };

  // The camera target sits in the middle of the padded area. Following, the
  // padding puts it FOLLOW_POSITION of the way down, above the panel.
  const followPadding = useMemo(
    () => ({ top: Math.round((2 * FOLLOW_POSITION - 1) * layout.height + layout.panel), right: 0, bottom: layout.panel, left: 0 }),
    [layout.height, layout.panel],
  );

  // Live GPS: fixes are snapped onto the route; repeated off-route fixes
  // trigger an offline A* reroute from the current position.
  const gpsRef = useRef({ hasFix: false, offRouteFixes: 0, lastReroute: 0, rerouteFrom: null, rerouteFailed: false });
  const latestRef = useRef(null);
  latestRef.current = { track, progress, remainingCoordinates, layout };

  const reroute = useCallback((coordinate) => {
    const result = resolveBookingRoute({
      roadGraph: getRoadGraph(),
      pickup: { coordinate },
      destination: trip.dropoff,
      isInServiceArea: isInIndangServiceArea,
    });
    const failed = result.status !== 'ok';
    gpsRef.current = { ...gpsRef.current, lastReroute: Date.now(), rerouteFrom: coordinate, rerouteFailed: failed };
    if (failed) {
      setGpsStatus('no-route');
      return;
    }
    gpsRef.current.hasFix = false;
    gpsRef.current.offRouteFixes = 0;
    setRoute(result.details);
    setProgress({ distance: 0, offRoute: null });
    setGpsStatus('follow-route');
    setNotice(t('guide.newRoute', { duration: result.details.durationLabel }));
  }, [trip.dropoff, t]);

  const handleFix = useCallback((coords) => {
    setHasPosition(true);
    const coordinate = { latitude: coords.latitude, longitude: coords.longitude };
    const { track: currentTrack, progress: current } = latestRef.current;
    const gps = gpsRef.current;
    // The first fix may be anywhere along the route; later ones stay near progress.
    const projection = projectOntoTrack(currentTrack, coordinate, current.distance, gps.hasFix ? {} : { ahead: Infinity });
    if (projection && projection.offsetMeters <= OFF_ROUTE_METERS) {
      // Back on the route: a later detour is a fresh one to recalculate from.
      gps.hasFix = true;
      gps.offRouteFixes = 0;
      gps.rerouteFrom = null;
      gps.rerouteFailed = false;
      setGpsStatus(null);
      setProgress({ distance: projection.distanceAlong, offRoute: null });
      return;
    }
    gps.offRouteFixes += 1;
    setProgress({
      distance: current.distance,
      offRoute: { coordinate, heading: coords.heading >= 0 ? coords.heading : null },
    });
    // Routes exist only inside Indang, so outside it the guide keeps showing
    // where the rider really is and waits for them to return.
    if (!isInIndangServiceArea(coordinate)) {
      setGpsStatus('outside');
      return;
    }
    // Recalculating again from where the last route was already calculated
    // would only repeat it, so that case asks the rider to rejoin instead.
    const rerouting = gps.offRouteFixes >= OFF_ROUTE_FIXES_BEFORE_REROUTE &&
      Date.now() - gps.lastReroute > REROUTE_COOLDOWN_MS &&
      (!gps.rerouteFrom || haversineDistance(coordinate, gps.rerouteFrom) > REROUTE_MOVE_METERS);
    if (rerouting) {
      setGpsStatus('off-route');
      reroute(coordinate);
      return;
    }
    setGpsStatus(gps.rerouteFailed ? 'no-route' : gps.rerouteFrom ? 'follow-route' : 'off-route');
  }, [reroute]);

  useEffect(() => {
    if (hasLiveFix) handleFix(gps.fix);
  }, [gps.fix, hasLiveFix, handleFix]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Camera. Following, every position update glides it along over the time
  // until the next fix; a change of view, framing, or a recenter eases in.
  const cameraKeyRef = useRef(null);
  useEffect(() => {
    const camera = cameraRef.current;
    if (!mapReady || !following || !camera || !vehicle.coordinate || !layout.height) return;
    const key = `${view}|${framing}`;
    const firstMove = cameraKeyRef.current === null;
    const engaging = cameraKeyRef.current !== key;
    cameraKeyRef.current = key;
    camera.easeTo({
      center: toLngLat(vehicle.coordinate),
      bearing: vehicle.heading,
      ...CAMERA_VIEWS[view],
      padding: followPadding,
      duration: firstMove ? 0 : engaging ? ENGAGE_CAMERA_MS : GPS_CAMERA_MS,
      easing: engaging ? 'ease' : 'linear',
    });
  }, [mapReady, following, view, framing, vehicle, followPadding, layout.height]);

  // Frames what is left of the route, north up, once when overview starts; the
  // route is read from latestRef so position updates do not re-frame it.
  useEffect(() => {
    if (!mapReady || framing !== 'overview') return;
    const { remainingCoordinates: remaining, layout: current } = latestRef.current;
    const coordinates = [...remaining, trip.dropoff.coordinate];
    if (coordinates.length < 2) return;
    cameraRef.current?.fitBounds(getLngLatBounds(coordinates), {
      padding: {
        top: current.banner + OVERVIEW_MARGIN, right: OVERVIEW_MARGIN,
        bottom: current.panel + OVERVIEW_MARGIN, left: OVERVIEW_MARGIN,
      },
      bearing: 0,
      pitch: 0,
      duration: OVERVIEW_MS,
    });
  }, [mapReady, framing, trip.dropoff.coordinate]);

  const initialView = useMemo(
    () => ({ bounds: getLngLatBounds(initialRoute.coordinates), padding: INITIAL_PADDING }),
    [initialRoute],
  );
  const handleMapReady = useCallback(() => setMapReady(true), []);
  // Dragging, pinching, or rotating the map stops following the vehicle.
  const handleRegionWillChange = useCallback(({ nativeEvent }) => {
    if (nativeEvent.userInteraction) setFollowing(false);
  }, []);
  const handleRegionDidChange = useCallback(({ nativeEvent }) => {
    setMapBearing((current) => (Math.abs(current - nativeEvent.bearing) < 1 ? current : nativeEvent.bearing));
  }, []);

  const recenter = () => {
    // Makes the next camera move ease back in instead of snapping.
    if (cameraKeyRef.current !== null) cameraKeyRef.current = 'recenter';
    setFraming('follow');
    setFollowing(true);
  };

  const showOverview = () => {
    setFollowing(false);
    setFraming('overview');
  };

  const toggleView = () => {
    setView((current) => (current === '3d' ? '2d' : '3d'));
    if (!following) recenter();
  };

  const arrivalTime = formatClockTime(new Date(Date.now() + guidance.remainingSeconds * 1000));
  const nextManeuverCoordinate = !guidance.arrived && guidance.nextStep?.type !== 'arrive'
    ? guidance.nextStep?.startCoordinate
    : null;
  const statusMessage = !hasLiveFix ? t(`gps.${gps.status}`) : gpsStatus ? t(`guide.status.${gpsStatus}`) : notice;
  const puckTop = FOLLOW_POSITION * layout.height - PUCK_SIZE / 2;

  return (
    <View style={styles.screen} onLayout={setLayoutValue('height')}>
      <StatusBar style="dark" />
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={NAVIGATION_STYLE_URL}
        onDidFinishLoadingMap={handleMapReady}
        onRegionWillChange={handleRegionWillChange}
        onRegionDidChange={handleRegionDidChange}
        compass={false}
        attribution={false}
        logo={false}
      >
        <Camera ref={cameraRef} initialViewState={initialView} minZoom={INDANG_MIN_ZOOM} />
        <IndangMapLayers />
        <PlacesLayer />
        {remainingCoordinates.length > 1 && <RouteLine id="guide-route" coordinates={remainingCoordinates} width={10} casingWidth={16} />}
        {nextManeuverCoordinate && (
          <ViewAnnotation lngLat={toLngLat(nextManeuverCoordinate)} anchor="center">
            <View style={styles.maneuverDot} />
          </ViewAnnotation>
        )}
        <ViewAnnotation lngLat={toLngLat(trip.dropoff.coordinate)} title={trip.dropoff.name} anchor="center">
          <View style={styles.destinationPin}>
            <MaterialCommunityIcons name="flag-checkered" size={18} color={COLORS.ink} />
          </View>
        </ViewAnnotation>
        {!following && vehicle.coordinate && (
          <ViewAnnotation lngLat={toLngLat(vehicle.coordinate)} anchor="center">
            <View style={[styles.markerFrame, { transform: [{ rotate: `${vehicle.heading - mapBearing}deg` }] }]}>
              <VehiclePuck />
            </View>
          </ViewAnnotation>
        )}
      </Map>

      {/* Following, the vehicle is drawn over the camera target instead of as a
          marker, so it glides with the camera rather than jumping each update. */}
      {following && vehicle.coordinate && layout.height > 0 && (
        <View style={[styles.fixedPuck, { top: puckTop }]} pointerEvents="none">
          <VehiclePuck floating />
        </View>
      )}

      {hasLiveFix && hasPosition && <ManeuverBanner
        guidance={guidance}
        destinationName={trip.dropoff.name}
        topPadding={insets.top}
        onLayout={setLayoutValue('banner')}
      />}

      {statusMessage && (
        <View style={[styles.statusChip, { top: Math.max(layout.banner + 4, insets.top + 16) }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={styles.statusChipText}>{statusMessage}</Text>
        </View>
      )}

      <MapBottom
        onHeight={(value) => setLayout((current) => (current.panel === value ? current : { ...current, panel: value }))}
        rail={<>
          {!following && (
            <Pressable
              style={({ pressed }) => [styles.recenterButton, pressed && styles.pressed]}
              onPress={recenter}
              accessibilityRole="button"
              accessibilityLabel={t('guide.recenterA11y')}
            >
              <MaterialCommunityIcons name="navigation" size={18} color={COLORS.route} />
              <Text style={[TYPE.label, styles.recenterText]}>{t('guide.recenter')}</Text>
            </Pressable>
          )}
          <ViewToggle label={view === '3d' ? '2D' : '3D'} onPress={toggleView} />
          <IconButton
            icon="map-marker-path"
            label={t('guide.overview')}
            tone={framing === 'overview' && !following ? 'route' : 'surface'}
            onPress={showOverview}
          />
        </>}
      >
        <FloatingCard>
          {hasLiveFix && hasPosition && guidance.arrived ? (
            <View style={styles.etaRow}>
              <View style={styles.etaText}>
                <Text style={styles.arrivalTitle}>{t('guide.arrived')}</Text>
                <Text style={[TYPE.caption, styles.etaDetail]} numberOfLines={1}>{trip.dropoff.name}</Text>
              </View>
              <Button label={t('common.done')} variant="brand" size="md" full={false} onPress={() => navigation.goBack()} />
            </View>
          ) : (
            <View style={styles.etaRow}>
              <View style={styles.etaText}>
                <Text style={styles.etaDuration}>{hasLiveFix && hasPosition ? formatDuration(guidance.remainingSeconds) : t('guide.waitingGps')}</Text>
                <Text style={[TYPE.caption, styles.etaDetail]}>
                  {hasLiveFix && hasPosition ? t('guide.etaDetail', { distance: formatDistance(guidance.remainingMeters), time: arrivalTime }) : t('guide.savedRoute')}
                </Text>
              </View>
              <IconButton
                icon="close"
                tone="danger"
                size={56}
                raised={false}
                label={t('guide.exit')}
                onPress={() => navigation.goBack()}
              />
            </View>
          )}
          {!hasLiveFix && <Button label={t('common.retryGps')} variant="tonal" size="md" onPress={gps.retry} style={styles.retry} />}
        </FloatingCard>
      </MapBottom>
    </View>
  );
}

export default function NavigationScreen({ navigation, route: screenRoute }) {
  const { trip, route, rideId } = screenRoute.params ?? {};
  const { ride } = useApp();
  const { t } = useI18n();
  useEffect(() => {
    if (rideId && ride?.id === rideId && !ACTIVE_STATUSES.includes(ride.status)) navigation.goBack();
  }, [rideId, ride?.status, navigation]);
  if (!trip || !(route?.coordinates?.length > 1)) {
    return (
      <View style={styles.missing}>
        <Text style={[TYPE.body, styles.missingText]}>{t('guide.noRoute')}</Text>
        <Button label={t('common.back')} variant="brand" size="md" full={false} onPress={() => navigation.goBack()} />
      </View>
    );
  }
  return <NavigationGuide key={`${trip.dropoff.coordinate.latitude}:${trip.dropoff.coordinate.longitude}`} navigation={navigation} trip={trip} initialRoute={route} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },

  bannerArea: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: SPACE.md },
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.brand,
    borderRadius: RADIUS.card, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg,
    ...ELEVATION.floating,
  },
  bannerIcon: {
    width: 56, height: 56, borderRadius: RADIUS.lg, backgroundColor: COLORS.brandDark,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerText: { flex: 1, marginLeft: SPACE.lg },
  bannerDistance: { fontFamily: FONTS.bold, fontSize: 34, lineHeight: 38, color: COLORS.accent },
  bannerInstruction: { fontFamily: FONTS.semibold, fontSize: 19, lineHeight: 24, color: COLORS.onBrand, marginTop: 2 },
  thenPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginTop: SPACE.sm, marginLeft: SPACE.md,
    backgroundColor: COLORS.brandDark, borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, ...ELEVATION.floating,
  },
  thenText: { ...TYPE.label, color: COLORS.onBrand, marginRight: SPACE.sm },

  statusChip: {
    position: 'absolute', left: SPACE.md, right: SPACE.md,
    backgroundColor: COLORS.ink, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, ...ELEVATION.floating,
  },
  statusChipText: { ...TYPE.label, fontWeight: '400', color: '#FFFFFF' },

  fixedPuck: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  puck: {
    width: PUCK_SIZE, height: PUCK_SIZE, borderRadius: PUCK_SIZE / 2, backgroundColor: COLORS.route,
    borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  puckShadow: ELEVATION.floating,
  markerFrame: { width: PUCK_SIZE + 12, height: PUCK_SIZE + 12, alignItems: 'center', justifyContent: 'center' },
  maneuverDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: COLORS.route },
  destinationPin: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.accent,
    borderWidth: 3, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center',
  },

  roundButton: {
    width: 48, height: 48, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', ...ELEVATION.floating,
  },
  roundButtonText: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.ink },
  pressed: { opacity: 0.85 },

  recenterButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg, height: 48, ...ELEVATION.floating,
  },
  recenterText: { color: COLORS.route, marginLeft: SPACE.sm },

  etaRow: { flexDirection: 'row', alignItems: 'center' },
  etaText: { flex: 1, marginRight: SPACE.md },
  etaDuration: { ...TYPE.metric, fontSize: 34, lineHeight: 40, color: COLORS.brand },
  etaDetail: { marginTop: 2 },
  retry: { marginTop: SPACE.md },
  arrivalTitle: { ...TYPE.heading, color: COLORS.brand },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, backgroundColor: COLORS.canvas },
  missingText: { textAlign: 'center', marginBottom: SPACE.lg },
});
