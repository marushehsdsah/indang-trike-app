import React, { useMemo } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';
import { toLineFeature } from '../utils/geojson';

const LINE_LAYOUT = { 'line-cap': 'round', 'line-join': 'round' };

// A road route from the offline road graph: a blue line on a white casing.
// `id` names the map source, so each route on one map needs its own.
export default function RouteLine({ id, coordinates, width, casingWidth }) {
  const shape = useMemo(() => toLineFeature(coordinates), [coordinates]);
  const casingPaint = useMemo(() => ({ 'line-color': '#FFFFFF', 'line-width': casingWidth }), [casingWidth]);
  const linePaint = useMemo(() => ({ 'line-color': COLORS.route, 'line-width': width }), [width]);
  return (
    <GeoJSONSource id={id} data={shape}>
      <Layer id={`${id}-casing`} type="line" layout={LINE_LAYOUT} paint={casingPaint} />
      <Layer id={`${id}-line`} type="line" layout={LINE_LAYOUT} paint={linePaint} />
    </GeoJSONSource>
  );
}
