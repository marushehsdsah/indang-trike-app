import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';

// The driver's TODA area on their map: its barangays tinted, outlined and
// named, drawn under the places layer so establishment names stay on top.
const FILL_PAINT = { 'fill-color': COLORS.brand, 'fill-opacity': 0.07 };
const LINE_PAINT = { 'line-color': COLORS.brand, 'line-width': 2, 'line-opacity': 0.8 };
const LABEL_LAYOUT = { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 };
const LABEL_PAINT = { 'text-color': COLORS.brand, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5, 'text-opacity': 0.75 };

export default function TodaZoneLayer({ shape }) {
  return (
    <GeoJSONSource id="toda-zone" data={shape}>
      <Layer id="toda-zone-fill" type="fill" beforeId="places-area-label" paint={FILL_PAINT} />
      <Layer id="toda-zone-line" type="line" beforeId="places-area-label" paint={LINE_PAINT} />
      <Layer id="toda-zone-label" type="symbol" beforeId="places-area-label" maxzoom={15.5} layout={LABEL_LAYOUT} paint={LABEL_PAINT} />
    </GeoJSONSource>
  );
}
