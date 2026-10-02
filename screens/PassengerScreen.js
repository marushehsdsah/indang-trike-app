import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RouteMap from '../components/RouteMap';
import LocationSearch from '../components/LocationSearch';
import LiveLocationMarker from '../components/LiveLocationMarker';
import StatusPill from '../components/StatusPill';
import TripStops from '../components/TripStops';
import BottomNav from '../components/BottomNav';
import { FloatingCard, MapBottom, MapTop } from '../components/map/MapChrome';
import { BleedScreen } from '../components/ui/Screen';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import Snackbar from '../components/ui/Snackbar';
import { Chip, Divider, Money, SegmentedControl } from '../components/ui/Surfaces';
import useCurrentPickup from '../hooks/useCurrentPickup';
import useAccountHistory from '../hooks/useAccountHistory';
import useMapStatus from '../hooks/useMapStatus';
import useStableCoordinate from '../hooks/useStableCoordinate';
import { MUNICIPALITIES, getMunicipalityAt, isInIndangServiceArea } from '../data/indangMap';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { placeName, routeMessage } from '../i18n/messages';
import { ACTIVE_STATUSES, formatPeso } from '../utils/rideState';
import { SPECIAL_RULES, fareTotal, quoteTrip } from '../data/fares';
import { getRoadGraph, getSearchablePlaces } from '../data/roadNetwork';
import { MAX_PASSENGERS, MIN_PASSENGERS, createBookingPayload, getBookingState, resolveBookingRoute } from '../utils/bookingRoute';
import { findNearestRoadNode, getRoadNameAtNode } from '../utils/roadGraph';
import { searchPlaces } from '../utils/placeSearch';
import { selectionFeedback, tapFeedback } from '../utils/feedback';
import { COLORS, ELEVATION, HIT_SLOP, RADIUS, SPACE, TYPE } from '../theme';

// Lets the "calculating" state paint before A* occupies the JS thread.
const ROUTE_CALCULATION_DELAY_MS = 30;
const NOTICE_MS = 6000;

// Tapping one opens search already filled in, so the rider never types a whole
// place name. Each town has its own; search lists the rider's town first.
const SHORTCUTS = {
  'General Trias': [
    { label: 'shortcut.cvsuGentri', icon: 'school-outline', query: 'Cavite State University' },
    { label: 'shortcut.market', icon: 'storefront-outline', query: 'Market' },
    { label: 'shortcut.cityHall', icon: 'office-building-outline', query: 'City Hall' },
  ],
  Indang: [
    { label: 'shortcut.cvsuMain', icon: 'school-outline', query: 'Cavite State University' },
    { label: 'shortcut.market', icon: 'storefront-outline', query: 'Indang Public Market' },
    { label: 'shortcut.municipalHall', icon: 'office-building-outline', query: 'Municipal Hall' },
  ],
};

function createPinnedPlace(t, coordinate) {
  const graph = getRoadGraph();
  const snap = graph.status === 'ready' ? findNearestRoadNode(graph.graph, coordinate) : null;
  const roadName = snap && getRoadNameAtNode(graph.graph, snap.nodeId);
  return {
    id: `pin/${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
    name: roadName ? t('pin.near', { road: roadName }) : t('pin.pinned'),
    kind: 'pin',
    coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
  };
}

// "Alulod · School / Petron" reads "School / Petron" on a chip that already
// sits under "Which part of Alulod?".
const areaName = (label) => (label.includes(' · ') ? label.split(' · ').slice(1).join(' · ') : label);

// The last few places the rider actually went, newest first, one per name.
function recentDestinations(rides) {
  const seen = new Set();
  return rides.filter((ride) => ride.status === 'completed' && ride.trip?.dropoff?.name)
    .map((ride) => ride.trip.dropoff)
    .filter((place) => !seen.has(place.name) && seen.add(place.name))
    .slice(0, 3);
}

function Stepper({ value, onChange, min, max, icon, label, fewerLabel, moreLabel }) {
  const step = (delta, enabled) => () => {
    if (!enabled) return;
    selectionFeedback();
    onChange(value + delta);
  };
  const canDecrease = value > min, canIncrease = value < max;
  return (
    <View style={styles.stepper} accessibilityLabel={label}>
      <Pressable onPress={step(-1, canDecrease)} disabled={!canDecrease} hitSlop={HIT_SLOP} accessibilityRole="button"
        accessibilityLabel={fewerLabel} style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="minus" size={20} color={canDecrease ? COLORS.ink : COLORS.lineStrong} />
      </Pressable>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.inkSecondary} />
      <Text style={[TYPE.subheading, styles.stepperValue]}>{value}</Text>
      <Pressable onPress={step(1, canIncrease)} disabled={!canIncrease} hitSlop={HIT_SLOP} accessibilityRole="button"
        accessibilityLabel={moreLabel} style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="plus" size={20} color={canIncrease ? COLORS.ink : COLORS.lineStrong} />
      </Pressable>
    </View>
  );
}

// The passenger's home is the booking map: "Where to?" over the map, then the
// route and fare on one card, then the yellow Book button. Search opens over
// the whole screen; setting a stop on the map uses a tap.
export default function PassengerScreen({ navigation, route: screenRoute }) {
  const params = screenRoute?.params;
  const { user, bookRide, ride, config, connected, online } = useApp();
  const { t } = useI18n();
  const { rides } = useAccountHistory();
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const bookingKeyRef = useRef(null);
  const [activeEndpoint, setActiveEndpoint] = useState(null);
  // Map-pick mode: which stop the next map tap sets. Setting pickup moves
  // straight on to destination, so both take one tap each.
  const [pickTarget, setPickTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [routeResult, setRouteResult] = useState({ status: 'missing-endpoints' });
  const [passengers, setPassengers] = useState(1);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  // The fare: a special trip (whole trike) or a regular one (per passenger,
  // where the taripa lists it), riders with a discount ID, and which listed
  // area a stop is in when its barangay has several.
  const [fareType, setFareType] = useState('special');
  const [discounted, setDiscounted] = useState(0);
  const [fareAreas, setFareAreas] = useState({});
  // Day and night fares change at 9 PM and 4 AM, so the quote is redone each minute.
  const [fareClock, setFareClock] = useState(Date.now);
  const [notice, setNotice] = useState(null);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const mapRef = useRef(null);
  const location = useCurrentPickup();
  // Device location drives pickup until the rider picks one themselves.
  const followLocationRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeRide = ride && ACTIVE_STATUSES.includes(ride.status) ? ride : null;


  // Rebook from history arrives with a destination; older links with a
  // search to open.
  useEffect(() => {
    if (params?.destination && isInIndangServiceArea(params.destination.coordinate)) setDestination(params.destination);
  }, [params?.destination]);
  useEffect(() => {
    if (!params?.focus) return;
    setActiveEndpoint(params.focus);
    setQuery(params.query ?? '');
  }, [params?.focus, params?.query]);

  useEffect(() => {
    if (!followLocationRef.current || submitting) return;
    // A lookup that is only starting keeps the current pickup.
    if (location.status === 'loading') return;
    setPickup(location.pickup);
  }, [location.pickup, location.status, submitting]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!destination) return undefined;
    const timer = setInterval(() => setFareClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [destination]);
  // A new stop may be in another barangay, so its area is chosen again. The
  // GPS pickup keeps its choice while it follows the rider.
  const destinationKey = destination ? destination.id ?? `${destination.coordinate.latitude},${destination.coordinate.longitude}` : null;
  const pickupKey = pickup && pickup.kind !== 'current-location' ? pickup.id ?? `${pickup.coordinate.latitude},${pickup.coordinate.longitude}` : 'gps';
  useEffect(() => { setFareAreas((areas) => ({ ...areas, dropoff: undefined })); }, [destinationKey]);
  useEffect(() => { setFareAreas((areas) => ({ ...areas, pickup: undefined })); }, [pickupKey]);
  useEffect(() => { setDiscounted((count) => Math.min(count, passengers)); }, [passengers]);

  // The GPS pickup moves with every fix; the route is searched again only
  // once it has moved 25 m, so standing still costs no searches.
  const routePickup = useStableCoordinate(pickup?.coordinate, pickup?.kind === 'current-location' ? 25 : 0);
  const pickupLatitude = routePickup?.latitude, pickupLongitude = routePickup?.longitude;
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
      // A newer stop change supersedes this result.
      if (requestIdRef.current === requestId) setRouteResult(result);
    }, ROUTE_CALCULATION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pickupLatitude, pickupLongitude, destinationLatitude, destinationLongitude]);

  const routeState = getBookingState(routeResult, routeResult.details);
  const route = routeResult.status === 'ok' ? routeResult.details : null;
  const calculating = routeResult.status === 'calculating';
  // Live GPS keeps working outside the towns, but booking does not, even for a
  // pickup chosen inside: no driver should wait for an absent rider.
  const blockedReason = !online ? t('trip.blockedOffline') : !connected || !config ? t('trip.blockedConnecting')
    : location.outsideServiceArea ? t('trip.blockedOutside') : null;
  const quote = useMemo(() => (pickup && destination && routeState.canConfirm
    ? quoteTrip({ pickup: routePickup, dropoff: destination.coordinate, at: fareClock, areas: fareAreas }) : null),
  [pickupLatitude, pickupLongitude, destinationLatitude, destinationLongitude, routeState.canConfirm, fareClock, fareAreas]);
  const tripType = quote?.regular ? fareType : quote?.flat !== null && quote?.flat !== undefined ? 'flat' : 'special';
  const total = quote && !quote.choose ? fareTotal(quote, { type: tripType, passengers, discounted }) : null;
  const canBook = routeState.canConfirm && !blockedReason && total !== null;
  const fare = total !== null ? formatPeso(total) : null;

  // Search lists the rider's own town first: the pickup's, or where GPS puts them.
  const townLatitude = pickupLatitude ?? location.pickup?.coordinate.latitude;
  const townLongitude = pickupLongitude ?? location.pickup?.coordinate.longitude;
  const town = useMemo(() => (Number.isFinite(townLatitude)
    ? getMunicipalityAt({ latitude: townLatitude, longitude: townLongitude })?.name : undefined), [townLatitude, townLongitude]);
  const results = useMemo(
    () => (activeEndpoint ? searchPlaces(getSearchablePlaces(), query, undefined, { preferTown: town }) : []),
    [activeEndpoint, query, town],
  );
  const recents = useMemo(() => recentDestinations(rides), [rides]);
  const status = useMapStatus({ town });

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setActiveEndpoint(null);
    setQuery('');
  }, []);
  const closeMapPick = useCallback(() => setPickTarget(null), []);
  const clearTrip = useCallback(() => {
    setDestination(null);
    setNoteOpen(false);
    setNotice(null);
  }, []);

  const selecting = activeEndpoint !== null;
  const picking = pickTarget !== null;
  const stage = selecting ? 'search' : picking ? 'pick' : activeRide ? 'resume' : destination ? 'trip' : 'home';

  // Hardware back steps out of search, map-pick, the note, then the trip,
  // before it leaves the app.
  useEffect(() => {
    if (stage === 'home' || stage === 'resume') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stage === 'search') closeSearch();
      else if (stage === 'pick') closeMapPick();
      else if (noteOpen) setNoteOpen(false);
      else clearTrip();
      return true;
    });
    return () => subscription.remove();
  }, [stage, noteOpen, closeSearch, closeMapPick, clearTrip]);

  const openSearch = (endpoint, initialQuery = '') => {
    if (!user.profileComplete) { navigation.navigate('Profile'); return; }
    setNotice(null);
    setQuery(initialQuery);
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
      setNotice(t('notice.outsidePoint'));
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

  // Choosing a pickup with no destination yet moves the search on to it.
  const applyPlace = (place) => {
    if (!setEndpoint(activeEndpoint, place)) return;
    if (activeEndpoint === 'pickup' && !destination) {
      setQuery('');
      setActiveEndpoint('destination');
    } else closeSearch();
  };

  const handleMapPress = (coordinate) => {
    if (!pickTarget) return;
    if (!isInIndangServiceArea(coordinate)) {
      setNotice(t('notice.outsidePoint'));
      return;
    }
    setEndpoint(pickTarget, createPinnedPlace(t, coordinate));
    setPickTarget(pickTarget === 'pickup' ? 'destination' : null);
  };

  const handleUseCurrentLocation = () => {
    followLocationRef.current = true;
    setNotice(null);
    if (activeEndpoint === 'pickup') {
      if (destination) closeSearch();
      else { setQuery(''); setActiveEndpoint('destination'); }
    }
    location.retry();
    mapRef.current?.fit();
  };

  // A GPS pickup is booked under the road it is nearest, so the driver (and
  // the rider's history) read a place rather than "Current location".
  const createPayload = () => createBookingPayload({
    trip: { pickup: pickup?.kind === 'current-location' ? { ...createPinnedPlace(t, pickup.coordinate), kind: 'gps' } : pickup, dropoff: destination },
    route: routeResult.details,
    passengers,
    note,
  });

  const handleConfirm = async () => {
    if (!canBook || submitting) return;
    setSubmitting(true);
    if (!bookingKeyRef.current) bookingKeyRef.current = `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await bookRide({ ...createPayload(), idempotencyKey: bookingKeyRef.current,
        fareType: tripType === 'regular' ? 'regular' : 'special', discounted: tripType === 'regular' ? discounted : 0, fareAreas });
      // The booking is made: the next one is a new request with a new key.
      bookingKeyRef.current = null;
      followLocationRef.current = true;
      setDestination(null); setNote(''); setPassengers(1); setNoteOpen(false); setFareType('special'); setDiscounted(0);
      navigation.navigate('Searching');
    } catch (failure) { Alert.alert(t('trip.unableToBook'), failure.message); }
    finally { setSubmitting(false); }
  };

  const handlePreviewRoute = () => {
    if (!routeState.canConfirm) return;
    const { trip, route: previewRoute } = createPayload();
    navigation.navigate('Navigation', { trip, route: previewRoute });
  };

  const resume = () => navigation.navigate(activeRide.status === 'searching' ? 'Searching' : 'ActiveRide');
  const message = routeMessage(t, routeResult);
  const locateButton = (
    <IconButton icon="crosshairs-gps" label={t(stage === 'home' ? 'map.recenter' : 'map.usePickupHere')}
      onPress={handleUseCurrentLocation} loading={location.status === 'loading' && followLocationRef.current} />
  );

  return (
    <BleedScreen>
      <View style={styles.mapArea}>
        <RouteMap
          ref={mapRef}
          pickup={pickup}
          destination={stage === 'resume' ? null : destination}
          route={stage === 'resume' ? null : route}
          onMapPress={picking ? handleMapPress : undefined}
          // Picking holds the camera still, so the next tap lands where the
          // rider is looking; leaving map-pick mode frames the new route.
          autoFit={!picking}
          topInset={topHeight}
          bottomInset={bottomHeight}
        >
          {location.pickup && pickup?.kind !== 'current-location' && (
            <LiveLocationMarker coordinate={location.pickup.coordinate} title={t('map.yourLocation')} />
          )}
        </RouteMap>

        <MapTop>
          {stage === 'trip' || stage === 'pick' ? (
            <View style={styles.tripTop} onLayout={({ nativeEvent }) => setTopHeight(Math.round(nativeEvent.layout.y + nativeEvent.layout.height))}>
              <IconButton icon="arrow-left" label={t(stage === 'pick' ? 'pick.stop' : 'trip.clear')} onPress={stage === 'pick' ? closeMapPick : clearTrip} />
              <View style={styles.stopsCard}>
                <Pressable onPress={() => openSearch('pickup')} accessibilityRole="button"
                  accessibilityLabel={t('search.editPickup', { name: placeName(t, pickup) ?? t('search.notSet') })}
                  style={({ pressed }) => [styles.stopRow, (pickTarget === 'pickup') && styles.stopRowActive, pressed && styles.pressed]}>
                  <View style={styles.pickupMark} />
                  <Text style={[TYPE.bodyStrong, styles.stopName, !pickup && styles.muted]} numberOfLines={1}>{placeName(t, pickup) ?? t('search.pickupPlaceholder')}</Text>
                </Pressable>
                <Divider inset={SPACE.xxl + SPACE.xs} />
                <Pressable onPress={() => openSearch('destination')} accessibilityRole="button"
                  accessibilityLabel={t('search.editDestination', { name: placeName(t, destination) ?? t('search.notSet') })}
                  style={({ pressed }) => [styles.stopRow, (pickTarget === 'destination') && styles.stopRowActive, pressed && styles.pressed]}>
                  <View style={styles.dropoffMark} />
                  <Text style={[TYPE.bodyStrong, styles.stopName, !destination && styles.muted]} numberOfLines={1}>{placeName(t, destination) ?? t('search.destinationPlaceholder')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View onLayout={({ nativeEvent }) => setTopHeight(Math.round(nativeEvent.layout.y + nativeEvent.layout.height))}>
              <StatusPill {...status} />
            </View>
          )}
          {(stage === 'trip' || stage === 'pick') && status.tone !== 'live' && <StatusPill {...status} style={styles.tripStatus} />}
        </MapTop>

        {notice && <View style={[styles.snackbar, { bottom: bottomHeight }]} pointerEvents="box-none">
          <Snackbar message={notice} onDismiss={() => setNotice(null)} />
        </View>}

        {stage !== 'search' && (
          <MapBottom
            edge={false}
            onHeight={setBottomHeight}
            rail={stage === 'trip' ? <>
              <IconButton icon="navigation-variant" tone="route" label={t('trip.previewGuide')} onPress={handlePreviewRoute} disabled={!routeState.canConfirm} />
              {locateButton}
            </> : stage === 'resume' ? null : locateButton}
          >
            {stage === 'home' && (
              <FloatingCard>
                <Pressable
                  onPress={() => {
                    tapFeedback();
                    openSearch('destination');
                  }}
                  accessibilityRole="search"
                  accessibilityLabel={t('home.whereTo')}
                  style={({ pressed }) => [styles.whereTo, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="magnify" size={26} color={COLORS.ink} />
                  <Text style={[TYPE.heading, styles.whereToText]}>{t('home.whereTo')}</Text>
                </Pressable>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  style={styles.chipScroll} contentContainerStyle={styles.chips}>
                  {recents.map((place) => (
                    <Chip key={`recent-${place.name}`} tone="map" icon="history" label={place.name}
                      onPress={() => (place.coordinate && isInIndangServiceArea(place.coordinate) ? setEndpoint('destination', place) : openSearch('destination', place.name))} />
                  ))}
                  {SHORTCUTS[town ?? MUNICIPALITIES[0].name].map((shortcut) => (
                    <Chip key={shortcut.label} tone="map" icon={shortcut.icon} label={t(shortcut.label)} onPress={() => openSearch('destination', shortcut.query)} />
                  ))}
                </ScrollView>
                <View style={styles.fareLine}>
                  <MaterialCommunityIcons name="rickshaw" size={20} color={COLORS.brand} />
                  <Text style={[TYPE.caption, styles.fareLineText]} numberOfLines={2}>
                    {town === 'Indang' ? t('home.fareLineIndang', { max: MAX_PASSENGERS })
                      : config ? t('home.fareLine', { fare: formatPeso(config.fare), max: MAX_PASSENGERS }) : t('home.fareLineNoFare', { max: MAX_PASSENGERS })}
                  </Text>
                </View>
              </FloatingCard>
            )}

            {stage === 'resume' && (
              <FloatingCard>
                <Text style={TYPE.heading}>{t(`ride.status.${activeRide.status}`)}</Text>
                <TripStops pickup={activeRide.trip.pickup.name} dropoff={activeRide.trip.dropoff.name} style={styles.resumeStops} />
                <Button label={t(activeRide.status === 'searching' ? 'home.returnToRequest' : 'home.returnToRide')} variant="brand" onPress={resume} />
              </FloatingCard>
            )}

            {stage === 'pick' && (
              <FloatingCard>
                <SegmentedControl
                  value={pickTarget}
                  onChange={setPickTarget}
                  options={[
                    { value: 'pickup', label: t('pick.pickup'), dot: COLORS.brand },
                    { value: 'destination', label: t('pick.destination'), dot: COLORS.accent },
                  ]}
                />
                <Text style={[TYPE.heading, styles.pickTitle]} accessibilityLiveRegion="polite">
                  {t(pickTarget === 'pickup' ? 'pick.tapPickup' : 'pick.tapDestination')}
                </Text>
                <View style={styles.pickSummary}>
                  {calculating && <ActivityIndicator size="small" color={COLORS.brand} style={styles.spinner} />}
                  <Text style={[TYPE.caption, !routeState.canConfirm && !calculating && styles.danger]} numberOfLines={2}>
                    {routeState.canConfirm ? t('trip.summary', { duration: routeState.durationLabel, distance: routeState.distanceLabel }) : message}
                  </Text>
                </View>
                <Button label={t('common.done')} variant="brand" size="md" onPress={closeMapPick} />
              </FloatingCard>
            )}

            {stage === 'trip' && (noteOpen ? (
              <FloatingCard>
                <Text style={TYPE.heading}>{t('trip.noteTitle')}</Text>
                <TextInput
                  style={[TYPE.body, styles.noteInput]}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('trip.notePlaceholder')}
                  placeholderTextColor={COLORS.inkMuted}
                  maxLength={200}
                  multiline
                  autoFocus
                  accessibilityLabel={t('trip.noteTitle')}
                />
                <Button label={t('common.done')} variant="brand" size="md" onPress={() => { Keyboard.dismiss(); setNoteOpen(false); }} />
              </FloatingCard>
            ) : (
              <FloatingCard>
                <View style={styles.tripSummary}>
                  {routeState.canConfirm ? (
                    <View style={styles.eta}>
                      <Text style={TYPE.metric} numberOfLines={1}>{routeState.durationLabel}</Text>
                      <Text style={[TYPE.caption, blockedReason && styles.danger]} numberOfLines={1}>
                        {blockedReason ?? t('trip.distance', { distance: routeState.distanceLabel })}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.routeMessage} accessibilityLiveRegion="polite">
                      {calculating
                        ? <ActivityIndicator size="small" color={COLORS.brand} />
                        : <MaterialCommunityIcons name="alert-circle-outline" size={22} color={COLORS.danger} />}
                      <Text style={[TYPE.body, styles.routeMessageText, !calculating && styles.danger]} numberOfLines={2}>{message}</Text>
                    </View>
                  )}
                  <View style={styles.fareBox} accessibilityLiveRegion="polite">
                    {total !== null ? <Money amount={total} size={28} /> : <Text style={TYPE.metric}>—</Text>}
                    <Text style={TYPE.caption} numberOfLines={1}>
                      {t(tripType === 'flat' ? 'trip.flatFare' : tripType === 'regular' ? 'fare.regularShort' : 'fare.specialShort')}
                      {quote?.night && tripType !== 'flat' ? ` · ${t('fare.night')}` : ''}
                    </Text>
                  </View>
                </View>
                {quote?.regular && (
                  <SegmentedControl value={tripType} onChange={setFareType} style={styles.fareType} options={[
                    { value: 'special', label: t('fare.special'), accessibilityLabel: t('fare.specialA11y') },
                    { value: 'regular', label: t('fare.regular'), accessibilityLabel: t('fare.regularA11y') },
                  ]} />
                )}
                {quote?.choice && (
                  <View style={styles.areaChoice}>
                    <Text style={[TYPE.label, quote.choose && styles.areaPrompt]}>
                      {t(quote.choice.endpoint === 'pickup' ? 'fare.chooseAreaPickup' : 'fare.chooseArea', { barangay: quote.choice.barangay })}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
                      {quote.choice.options.map((option) => (
                        <Chip key={option.id} tone="map" label={areaName(option.label)} selected={quote.choice.selected === option.id}
                          onPress={() => setFareAreas((areas) => ({ ...areas, [quote.choice.endpoint]: option.id }))} />
                      ))}
                    </ScrollView>
                  </View>
                )}
                <View style={styles.options}>
                  <Stepper value={passengers} onChange={setPassengers} min={MIN_PASSENGERS} max={MAX_PASSENGERS} icon="account"
                    label={t('trip.ridersLabel', { count: passengers })} fewerLabel={t('trip.fewerRiders')} moreLabel={t('trip.moreRiders')} />
                  <Chip tone="map" icon="message-reply-text-outline" label={note || t('trip.addNote')} onPress={() => setNoteOpen(true)}
                    accessibilityLabel={note ? t('trip.editNote', { note }) : t('trip.addNote')} style={styles.noteChip} />
                </View>
                {tripType === 'regular' && (
                  <View style={styles.idRow}>
                    <Text style={[TYPE.label, styles.flex]}>{t('fare.withId')}</Text>
                    <Stepper value={discounted} onChange={setDiscounted} min={0} max={passengers} icon="card-account-details-outline"
                      label={t('fare.withIdA11y', { count: discounted })} fewerLabel={t('fare.fewerId')} moreLabel={t('fare.moreId')} />
                  </View>
                )}
                {tripType !== 'flat' && quote && (
                  <Text style={[TYPE.caption, styles.fareRule]}>
                    {tripType === 'regular' ? t('fare.regularRule') : t('fare.specialRule', { extra: formatPeso(SPECIAL_RULES.extraPassenger) })}
                    {' '}{t('fare.kidsFree')}
                  </Text>
                )}
                <Button
                  label={canBook && fare ? t('trip.book', { fare }) : t('trip.bookPlain')}
                  onPress={handleConfirm}
                  disabled={!canBook}
                  loading={submitting}
                  trailingIcon="arrow-right"
                  accessibilityLabel={t('trip.bookA11y')}
                />
              </FloatingCard>
            ))}
          </MapBottom>
        )}

        {stage === 'search' && (
          <LocationSearch
            activeEndpoint={activeEndpoint}
            pickup={pickup && { ...pickup, name: placeName(t, pickup) }}
            destination={destination}
            query={query}
            results={results}
            onQueryChange={setQuery}
            onSelect={applyPlace}
            onClose={closeSearch}
            onSwitchEndpoint={(endpoint) => { setQuery(''); setActiveEndpoint(endpoint); }}
            onUseCurrentLocation={handleUseCurrentLocation}
            onChooseOnMap={() => startMapPick(activeEndpoint)}
          />
        )}
      </View>
      {stage !== 'search' && <BottomNav active="home" navigation={navigation} />}
    </BleedScreen>
  );
}

const styles = StyleSheet.create({
  mapArea: { flex: 1 },
  pressed: { opacity: 0.7 },
  muted: { color: COLORS.inkMuted },
  danger: { color: COLORS.danger },

  tripTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  tripStatus: { marginTop: SPACE.sm },
  stopsCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    paddingHorizontal: SPACE.md, ...ELEVATION.floating,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: RADIUS.md, paddingHorizontal: SPACE.xs },
  stopRowActive: { backgroundColor: COLORS.brandTint },
  stopName: { flex: 1, marginLeft: SPACE.md },
  pickupMark: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: COLORS.brand },
  dropoffMark: { width: 12, height: 12, borderRadius: 2, backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.accentDark },

  snackbar: { position: 'absolute', left: SPACE.md, right: SPACE.md },

  whereTo: {
    flexDirection: 'row', alignItems: 'center', minHeight: 56,
    backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.lg,
  },
  whereToText: { marginLeft: SPACE.md },
  chipScroll: { marginTop: SPACE.md, marginHorizontal: -SPACE.lg },
  chips: { paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  fareLine: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  fareLineText: { flex: 1, marginLeft: SPACE.sm },

  resumeStops: { marginVertical: SPACE.md },

  pickTitle: { marginTop: SPACE.lg },
  pickSummary: { flexDirection: 'row', alignItems: 'center', minHeight: 36, marginTop: SPACE.xs, marginBottom: SPACE.md },
  spinner: { marginRight: SPACE.sm },

  tripSummary: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  eta: { flex: 1 },
  routeMessage: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  routeMessageText: { flex: 1, marginLeft: SPACE.sm },
  fareBox: { alignItems: 'flex-end', marginLeft: SPACE.md },
  options: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.md },
  stepper: {
    flexDirection: 'row', alignItems: 'center', minHeight: 40,
    borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceAlt, paddingHorizontal: SPACE.xs,
  },
  stepperButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 20, textAlign: 'center', marginLeft: 2 },
  noteChip: { flexShrink: 1 },
  flex: { flex: 1 },
  fareType: { marginTop: SPACE.md },
  areaChoice: { marginTop: SPACE.md },
  areaPrompt: { color: COLORS.brand, fontWeight: '700' },
  idRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md },
  fareRule: { marginBottom: SPACE.md },
  noteInput: {
    borderWidth: 1.5, borderColor: COLORS.lineStrong, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
    minHeight: 64, maxHeight: 110, textAlignVertical: 'top', marginTop: SPACE.md, marginBottom: SPACE.md,
  },
});
