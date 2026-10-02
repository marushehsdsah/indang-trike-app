import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';
import IndangMapLayers from './IndangMapLayers';
import PlacesLayer from './PlacesLayer';
import RouteLine from './RouteLine';
import { MAP_STYLE_URL } from './mapStyles';
import { INDANG_BOUNDS, INDANG_MIN_ZOOM } from '../data/indangMap';
import { getLngLatBounds, toLngLat } from '../utils/geojson';

const FIT_MARGIN = { top: 40, right: 50, bottom: 40, left: 50 };
const FIT_MS = 600;
// Overlay insets settle over a few layout passes, so the camera waits for them
// and moves once.
const CAMERA_SETTLE_MS = 150;
// Zoom for a single point, such as the rider's location before a route.
const POINT_ZOOM = 14.5;
const POINT_MS = 500;
const INITIAL_VIEW = { bounds: INDANG_BOUNDS, padding: { top: 24, right: 24, bottom: 24, left: 24 } };

// Changes when a stop is set, cleared, or replaced, but not when the
// current-location pickup follows GPS, so live updates never move the camera.
function stopKey(place) {
  if (!place) return '';
  return place.id ?? `${place.coordinate.latitude},${place.coordinate.longitude}`;
}

// Full-bleed map of the service area with the road route (white casing, blue
// line) and pickup/destination markers. `topInset` and `bottomInset` are the
// heights of the overlays the screen draws over the map; the camera keeps the
// route clear of them. With `autoFit` off, the camera stays where the user put
// it; turning it back on frames the route again. With no stops to frame, the
// camera centres once on `currentLocation`, which may be outside the area.
// The ref's fit() frames the route (or the current location) again on demand.
// With `fitKey`, the camera frames the route only when the key changes, not on
// every route update, so a live route that shrinks behind the vehicle never
// moves the map under the user.
// The screen draws the map buttons and credit (components/map/MapChrome.js).
const RouteMap = forwardRef(function RouteMap({
  pickup,
  destination,
  route,
  currentLocation,
  onMapPress,
  autoFit = true,
  fitKey,
  topInset = 0,
  bottomInset = 0,
  children,
  style,
}, ref) {
  const cameraRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const latestRef = useRef(null);
  latestRef.current = { pickup, destination, route, currentLocation, topInset, bottomInset };
  const routeCoordinates = route?.coordinates?.length > 1 ? route.coordinates : null;
  const pickupKey = stopKey(pickup), destinationKey = stopKey(destination), hasCurrentLocation = Boolean(currentLocation);
  const fitTrigger = fitKey ?? routeCoordinates;

  const fitCamera = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const latest = latestRef.current;
    // The markers can sit off the road the route starts from, so frame them too.
    const coordinates = [
      ...(latest.route?.coordinates?.length > 1 ? latest.route.coordinates : []),
      latest.pickup?.coordinate,
      latest.destination?.coordinate,
    ].filter(Boolean);
    if (coordinates.length === 0 && latest.currentLocation) coordinates.push(latest.currentLocation);
    if (coordinates.length === 1) {
      camera.easeTo({
        center: toLngLat(coordinates[0]),
        zoom: POINT_ZOOM,
        padding: { top: latest.topInset, right: 0, bottom: latest.bottomInset, left: 0 },
        duration: POINT_MS,
      });
      return;
    }
    if (coordinates.length < 2) return;
    camera.fitBounds(getLngLatBounds(coordinates), {
      padding: {
        top: Math.round(FIT_MARGIN.top + latest.topInset),
        right: FIT_MARGIN.right,
        bottom: Math.round(FIT_MARGIN.bottom + latest.bottomInset),
        left: FIT_MARGIN.left,
      },
      duration: FIT_MS,
    });
  }, []);

  // The camera is placed once the map has loaded, then whenever the route, a
  // stop, the arrival of a current location, or the overlay insets change.
  useEffect(() => {
    if (!mapReady || !autoFit) return undefined;
    const timer = setTimeout(fitCamera, CAMERA_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [mapReady, autoFit, fitTrigger, pickupKey, destinationKey, hasCurrentLocation, topInset, bottomInset, fitCamera]);

  useImperativeHandle(ref, () => ({ fit: fitCamera }), [fitCamera]);

  const handleMapReady = useCallback(() => setMapReady(true), []);

  const handlePress = useCallback(({ nativeEvent }) => {
    const [longitude, latitude] = nativeEvent.lngLat;
    onMapPress?.({ latitude, longitude });
  }, [onMapPress]);

  return (
    <View style={[styles.container, style]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE_URL}
        onDidFinishLoadingMap={handleMapReady}
        onPress={onMapPress ? handlePress : undefined}
        touchPitch={false}
        touchRotate={false}
        compass={false}
        attribution={false}
        logo={false}
      >
        <Camera ref={cameraRef} initialViewState={INITIAL_VIEW} minZoom={INDANG_MIN_ZOOM} />
        <IndangMapLayers />
        <PlacesLayer />
        {routeCoordinates && <RouteLine id="route" coordinates={routeCoordinates} width={6} casingWidth={10} />}
        {pickup && (
          <ViewAnnotation lngLat={toLngLat(pickup.coordinate)} title={pickup.name} anchor="center">
            <View style={styles.pickupMarker} />
          </ViewAnnotation>
        )}
        {destination && (
          <ViewAnnotation lngLat={toLngLat(destination.coordinate)} title={destination.name} anchor="center">
            <View style={styles.destinationMarker}>
              <View style={styles.destinationMarkerCore} />
            </View>
          </ViewAnnotation>
        )}
        {children}
      </Map>
    </View>
  );
});

export default RouteMap;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  // Pickup is a green ring and drop-off a yellow square, the same marks the
  // cards use beside the stop names.
  pickupMarker: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 6, borderColor: COLORS.brand,
  },
  destinationMarker: {
    width: 26, height: 26, borderRadius: 6,
    backgroundColor: COLORS.accent, borderWidth: 3, borderColor: COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  destinationMarkerCore: { width: 6, height: 6, borderRadius: 1, backgroundColor: COLORS.ink },
});
