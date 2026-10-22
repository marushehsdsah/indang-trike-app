import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';

// Largest ring radius, in screen points, so the pulse is the same size at
// every zoom.
const MAX_RADIUS = 75;
const MIN_RADIUS = 9;
const RINGS = 3;
const DURATION_MS = 3200;
const FRAME_MS = 33;

// Ring `index` of RINGS at `elapsed` ms. Rings are evenly spaced around one
// lap, so one is always leaving.
function ringPaint(elapsed, index) {
  const progress = (elapsed / DURATION_MS + index / RINGS) % 1;
  // Eases out: fast at first, slowing as the ring fades.
  const eased = 1 - (1 - progress) ** 2;
  const fade = progress < 0.1 ? progress / 0.1 : 1 - (progress - 0.1) / 0.9;
  return {
    'circle-radius': MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * eased,
    'circle-color': COLORS.route,
    'circle-opacity': 0.35 * fade,
    'circle-stroke-color': COLORS.route,
    'circle-stroke-width': 1.5,
    'circle-stroke-opacity': 0.6 * fade,
  };
}

// Rings that spread out from the passenger's position and fade while their
// request is offered to drivers. They are map circle layers, which MapLibre
// redraws every frame; animated marker views stay frozen on Android. Markers
// such as the location dot are drawn above map layers, so they stay on top.
// With Reduce Motion on, nothing is drawn.
export default function SearchPulse({ coordinate }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), FRAME_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const longitude = coordinate?.longitude, latitude = coordinate?.latitude;
  const point = useMemo(() => (Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [longitude, latitude] } }
    : null), [latitude, longitude]);

  if (reduceMotion || !point) return null;
  return (
    <GeoJSONSource id="search-pulse" data={point}>
      {Array.from({ length: RINGS }, (_, index) => (
        <Layer key={index} id={`search-pulse-${index}`} type="circle" paint={ringPaint(elapsed, index)} />
      ))}
    </GeoJSONSource>
  );
}
