import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RouteMap from '../components/RouteMap';
import LocationSearchPanel from '../components/LocationSearchPanel';
import BookingSheet from '../components/BookingSheet';
import MapPickBar from '../components/MapPickBar';
import LiveLocationMarker from '../components/LiveLocationMarker';
import { BleedScreen } from '../components/ui/Screen';
import IconButton from '../components/ui/IconButton';
import { Divider } from '../components/ui/Surfaces';
import useCurrentPickup from '../hooks/useCurrentPickup';
import { SERVICE_AREA_EITHER, SERVICE_AREA_NAME, getMunicipalityAt, isInIndangServiceArea } from '../data/indangMap';
import { useApp } from '../context/AppContext';
import { ACTIVE_STATUSES, formatFare } from '../utils/rideState';
import { getRoadGraph, getSearchablePlaces } from '../data/roadNetwork';
import { createBookingPayload, getBookingState, resolveBookingRoute } from '../utils/bookingRoute';
import { findNearestRoadNode, getRoadNameAtNode } from '../utils/roadGraph';
import { searchPlaces } from '../utils/placeSearch';
import { COLORS, ELEVATION, HIT_SLOP, RADIUS, SPACE, TYPE } from '../theme';

// Lets the "calculating" state paint before A* occupies the JS thread.
const ROUTE_CALCULATION_DELAY_MS = 30;
const OUTSIDE_SERVICE_AREA_NOTICE = `That point is outside ${SERVICE_AREA_NAME}. Choose a point inside ${SERVICE_AREA_EITHER}.`;
// The free backend sleeps when idle and needs up to a minute to wake.
const WAITING_FOR_SERVER = 'Connecting to IndangGO… If the server was asleep this takes up to a minute.';
const OFFLINE_BOOKING_MESSAGE = 'No internet connection. You can still search, preview the route and use the GPS guide; booking needs internet.';
const RIDER_OUTSIDE_MESSAGE = `You are outside ${SERVICE_AREA_NAME}. Tricycle rides can only be booked inside ${SERVICE_AREA_EITHER}.`;

function createPinnedPlace(coordinate) {
  const graph = getRoadGraph();
  const snap = graph.status === 'ready' ? findNearestRoadNode(graph.graph, coordinate) : null;
  const roadName = snap && getRoadNameAtNode(graph.graph, snap.nodeId);
  return {
    id: `pin/${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
    name: roadName ? `Pin near ${roadName}` : 'Pinned location',
    kind: 'pin',
    coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
  };
}

function LocationRow({ label, place, active, isPickup, onPress, onPinPress }) {
  return (
    <View style={[styles.locationRow, active && styles.locationRowActive]}>
      <Pressable
        style={styles.locationMain}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${place?.name || 'Not selected'}. Search for a ${label.toLowerCase()}`}
      >
        <View style={isPickup ? styles.pickupDot : styles.destinationSquare} />
        <View style={styles.locationText}>
          <Text style={TYPE.overline}>{label.toUpperCase()}</Text>
          <Text style={[TYPE.body, styles.locationName]} numberOfLines={1}>{place?.name || `Choose ${label.toLowerCase()}`}</Text>
        </View>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
        onPress={onPinPress}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Set ${label.toLowerCase()} on the map`}
      >
        <MaterialCommunityIcons
          name="map-marker-radius-outline"
          size={22}
          color={active ? COLORS.brand : COLORS.inkSecondary}
        />
      </Pressable>
    </View>
  );
}

export default function BookingScreen({ navigation, route: screenRoute }) {
  const params = screenRoute?.params;
  const { bookRide, ride: activeRide, config, connected, online, error: connectionError } = useApp();
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const bookingKeyRef = useRef(null);
  const [activeEndpoint, setActiveEndpoint] = useState(null);
  // Map-pick mode: which endpoint the next map tap sets. Picking pickup moves
  // straight on to destination, so both take one tap each.
  const [pickTarget, setPickTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [routeResult, setRouteResult] = useState({ status: 'calculating' });
  const [passengers, setPassengers] = useState(1);
  const [note, setNote] = useState('');
  // Transient, non-blocking messages (location fallback, outside-area taps).
  const [notice, setNotice] = useState(null);

  const insets = useSafeAreaInsets();
  const [topHeight, setTopHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const location = useCurrentPickup();
  // Device location drives pickup until the rider picks one themselves.
  const followLocationRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (params?.destination && isInIndangServiceArea(params.destination.coordinate)) setDestination(params.destination);
  }, [params?.destination]);
  useEffect(() => {
    if (activeRide && ACTIVE_STATUSES.includes(activeRide.status)) navigation.replace(activeRide.status === 'searching' ? 'Searching' : 'ActiveRide');
  }, [activeRide?.id, activeRide?.status, navigation]);

  // Arriving from "Where to?" or a recent ride: open that endpoint's search,
  // already filled in.
  useEffect(() => {
    if (!params?.focus) return;
    setActiveEndpoint(params.focus);
    setQuery(params.query ?? '');
  }, [params?.focus, params?.query]);

  useEffect(() => {
    if (!followLocationRef.current || submitting) return;
    // A lookup that is only starting keeps the current pickup; a last-known
    // fix or a finished lookup (current fix or fallback) replaces it.
    if (location.status === 'loading') return;
    setPickup(location.pickup);
    if (location.message) setNotice(location.message);
  }, [location.pickup, location.status, location.source, location.message, submitting]);

  const pickupLatitude = pickup?.coordinate.latitude, pickupLongitude = pickup?.coordinate.longitude;
  const destinationLatitude = destination?.coordinate.latitude, destinationLongitude = destination?.coordinate.longitude;

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!pickup || !destination) { setRouteResult({ status: 'missing-endpoints' }); return undefined; }
    setRouteResult({ status: 'calculating' });
    const timer = setTimeout(() => {
      const result = resolveBookingRoute({
        roadGraph: getRoadGraph(),
        pickup: { coordinate: { latitude: pickupLatitude, longitude: pickupLongitude } },
        destination: { coordinate: { latitude: destinationLatitude, longitude: destinationLongitude } },
        isInServiceArea: isInIndangServiceArea,
        getMunicipalityAt,
      });
      // A newer endpoint change supersedes this result.
      if (requestIdRef.current === requestId) setRouteResult(result);
    }, ROUTE_CALCULATION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pickupLatitude, pickupLongitude, destinationLatitude, destinationLongitude]);

  const routeState = getBookingState(routeResult, routeResult.details);
  // Live GPS keeps working outside Indang, but booking does not, even for a
  // pickup chosen inside Indang: no driver should wait for an absent rider.
  const bookingState = !online ? { ...routeState, canConfirm: false, message: OFFLINE_BOOKING_MESSAGE }
    : !connected || !config ? { ...routeState, canConfirm: false, message: connectionError || WAITING_FOR_SERVER }
    : location.outsideServiceArea ? { ...routeState, canConfirm: false, message: RIDER_OUTSIDE_MESSAGE } : routeState;
  const route = routeResult.status === 'ok' ? routeResult.details : null;
  // Search lists the rider's own town first: the pickup's, or where GPS puts them.
  const townLatitude = pickupLatitude ?? location.pickup?.coordinate.latitude;
  const townLongitude = pickupLongitude ?? location.pickup?.coordinate.longitude;
  const searchTown = useMemo(() => (Number.isFinite(townLatitude)
    ? getMunicipalityAt({ latitude: townLatitude, longitude: townLongitude })?.name : undefined), [townLatitude, townLongitude]);
  const results = useMemo(
    () => (activeEndpoint ? searchPlaces(getSearchablePlaces(), query, undefined, { preferTown: searchTown }) : []),
    [activeEndpoint, query, searchTown],
  );

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setActiveEndpoint(null);
    setQuery('');
  }, []);

  const closeMapPick = useCallback(() => setPickTarget(null), []);

  // Hardware back leaves search or map-pick mode before it leaves the screen.
  useEffect(() => {
    if (!activeEndpoint && !pickTarget) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      closeMapPick();
      return true;
    });
    return () => subscription.remove();
  }, [activeEndpoint, pickTarget, closeSearch, closeMapPick]);

  const openSearch = (endpoint) => {
    setNotice(null);
    setQuery('');
    closeMapPick();
    setActiveEndpoint(endpoint);
  };

  const startMapPick = (endpoint) => {
    closeSearch();
    setNotice(null);
    setPickTarget(endpoint);
  };

  // Returns false, with a notice, for a place outside the service area.
  const setEndpoint = (endpoint, place) => {
    if (!isInIndangServiceArea(place.coordinate)) {
      setNotice(OUTSIDE_SERVICE_AREA_NOTICE);
      return false;
    }
    if (endpoint === 'pickup') {
      followLocationRef.current = false;
      setPickup(place);
    } else {
      setDestination(place);
    }
    setNotice(null);
    return true;
  };

  const applyPlace = (endpoint, place) => {
    if (setEndpoint(endpoint, place)) closeSearch();
  };

  const handleMapPress = (coordinate) => {
    const endpoint = pickTarget ?? activeEndpoint;
    if (!endpoint) return;
    if (!isInIndangServiceArea(coordinate)) {
      setNotice(OUTSIDE_SERVICE_AREA_NOTICE);
      return;
    }
    setEndpoint(endpoint, createPinnedPlace(coordinate));
    if (!pickTarget) closeSearch();
    else setPickTarget(endpoint === 'pickup' ? 'destination' : null);
  };

  const handleUseCurrentLocation = () => {
    followLocationRef.current = true;
    setNotice(null);
    if (activeEndpoint === 'pickup') closeSearch();
    location.retry();
  };

  const createPayload = () => createBookingPayload({
    trip: { pickup, dropoff: destination },
    route: routeResult.details,
    passengers,
    note,
  });

  const handleConfirm = async () => {
    if (!bookingState.canConfirm || submitting) return;
    setSubmitting(true);
    if (!bookingKeyRef.current) bookingKeyRef.current = `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await bookRide({ ...createPayload(), idempotencyKey: bookingKeyRef.current });
    } catch (failure) { Alert.alert('Unable to book', failure.message); }
    finally { setSubmitting(false); }
  };

  const handlePreviewRoute = () => {
    if (!routeState.canConfirm) return;
    const { trip, route: previewRoute } = createPayload();
    navigation.navigate('Navigation', { trip, route: previewRoute });
  };

  const selecting = activeEndpoint !== null;
  const picking = pickTarget !== null;

  return (
    <BleedScreen>
      <RouteMap
        pickup={pickup}
        destination={destination}
        route={route}
        onMapPress={handleMapPress}
        onUseCurrentLocation={handleUseCurrentLocation}
        locating={location.status === 'loading'}
        // Picking holds the camera still, so the next tap lands where the rider
        // is looking; leaving map-pick mode frames the new route.
        autoFit={!picking}
        topInset={topHeight}
        // Kept while search or map-pick mode hides the sheet, so neither moves the camera.
        bottomInset={sheetHeight}
      >
        {/* The rider's live position, when the pickup marker is somewhere else. */}
        {location.pickup && pickup?.kind !== 'current-location' && (
          <LiveLocationMarker coordinate={location.pickup.coordinate} title="Your location" />
        )}
      </RouteMap>

      <View style={[styles.top, { paddingTop: insets.top + SPACE.md }]} pointerEvents="box-none">
        {/* The card and any notice under it are framed around; the search
            panel is not, so opening search never moves the camera. */}
        <View
          pointerEvents="box-none"
          onLayout={({ nativeEvent }) => setTopHeight(nativeEvent.layout.y + nativeEvent.layout.height)}
        >
          <View style={styles.topRow} pointerEvents="box-none">
            <IconButton
              icon="arrow-left"
              size={44}
              label={selecting ? 'Close search' : picking ? 'Stop setting points on the map' : 'Go back'}
              onPress={() => {
                if (selecting) closeSearch();
                else if (picking) closeMapPick();
                else navigation.goBack();
              }}
            />
          </View>

          <View style={styles.card}>
            <LocationRow
              label="Pickup"
              place={pickup}
              isPickup
              active={activeEndpoint === 'pickup' || pickTarget === 'pickup'}
              onPress={() => openSearch('pickup')}
              onPinPress={() => startMapPick('pickup')}
            />
            <Divider inset={SPACE.xxl + SPACE.sm} />
            <LocationRow
              label="Destination"
              place={destination}
              active={activeEndpoint === 'destination' || pickTarget === 'destination'}
              onPress={() => openSearch('destination')}
              onPinPress={() => startMapPick('destination')}
            />
          </View>

          {notice && (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.brand} />
              <Text style={[TYPE.caption, styles.noticeText]}>{notice}</Text>
              <Pressable
                onPress={() => setNotice(null)}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Dismiss message"
              >
                <MaterialCommunityIcons name="close" size={18} color={COLORS.inkMuted} />
              </Pressable>
            </View>
          )}
        </View>

        {selecting && (
          <LocationSearchPanel
            activeEndpoint={activeEndpoint}
            query={query}
            results={results}
            onQueryChange={setQuery}
            onSelect={(place) => applyPlace(activeEndpoint, place)}
            onClose={closeSearch}
            onUseCurrentLocation={handleUseCurrentLocation}
            onChooseOnMap={() => startMapPick(activeEndpoint)}
          />
        )}
      </View>

      {picking && (
        <MapPickBar
          target={pickTarget}
          state={bookingState}
          calculating={routeResult.status === 'calculating'}
          onTargetChange={setPickTarget}
          onDone={closeMapPick}
          bottomPadding={insets.bottom}
        />
      )}

      {!selecting && !picking && (
        <BookingSheet
          state={bookingState}
          calculating={routeResult.status === 'calculating'}
          passengers={passengers}
          note={note}
          fare={config ? formatFare(config.fare) : '—'}
          submitting={submitting}
          onPassengersChange={setPassengers}
          onNoteChange={setNote}
          onConfirm={handleConfirm}
          onPreviewRoute={handlePreviewRoute}
          routeReady={routeState.canConfirm}
          bottomPadding={insets.bottom}
          onLayout={({ nativeEvent }) => setSheetHeight(nativeEvent.layout.height)}
        />
      )}
    </BleedScreen>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: SPACE.lg },
  topRow: { flexDirection: 'row', marginBottom: SPACE.md },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    paddingHorizontal: SPACE.lg, ...ELEVATION.floating,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderRadius: RADIUS.md },
  locationRowActive: { backgroundColor: COLORS.brandTint },
  locationMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingLeft: SPACE.xs },
  pickupDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3.5, borderColor: COLORS.brand },
  destinationSquare: {
    width: 12, height: 12, borderRadius: 3,
    backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.accentDark,
  },
  locationText: { flex: 1, marginLeft: SPACE.md },
  locationName: { marginTop: 1 },
  pinButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },

  notice: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACE.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, ...ELEVATION.card,
  },
  noticeText: { flex: 1, marginHorizontal: SPACE.sm },
});
