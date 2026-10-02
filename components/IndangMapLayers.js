import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { INDANG_BOUNDARY_SHAPE, INDANG_MASK_SHAPE } from '../data/indangMap';
import { COLORS } from '../theme';

const MASK_PAINT = { 'fill-color': 'rgba(236, 239, 237, 0.86)', 'fill-antialias': false };
const BOUNDARY_PAINT = { 'line-color': COLORS.brand, 'line-width': 2 };

// Marks the service area: everything outside the Indang boundary is washed out
// and the boundary is outlined. The camera may still leave it, so live GPS
// outside Indang stays visible. Routes are drawn by the screens from the
// offline road graph, never as a straight line between stops.
// Static data: memoized so the map's per-second GPS re-renders skip it.
export default React.memo(function IndangMapLayers() {
  return (
    <>
      <GeoJSONSource id="indang-mask" data={INDANG_MASK_SHAPE}>
        <Layer id="indang-mask-fill" type="fill" paint={MASK_PAINT} />
      </GeoJSONSource>
      <GeoJSONSource id="indang-boundary" data={INDANG_BOUNDARY_SHAPE}>
        <Layer id="indang-boundary-line" type="line" paint={BOUNDARY_PAINT} />
      </GeoJSONSource>
    </>
  );
});
