import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

// Every named establishment, landmark and named area (subdivisions, business
// parks) in Indang and General Trias, from the same OpenStreetMap snapshot as
// search (scripts/build-road-graph.js --places). Landmarks show from zoom 14
// (named from 14.5, where the maps first open on a location), other
// establishments from zoom 16, each as a dot in its category's colour with its
// name; overlapping names wait for a closer zoom. The God view draws the same layer (web/god-view/src/map.mjs).
const PLACES = require('../assets/places/service-area-places.json');

const rank = (value) => ['==', ['get', 'rank'], value];
const DOT_PAINT = {
  'circle-color': ['get', 'color'], 'circle-radius': ['case', rank(1), 5, 4],
  'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.5,
};
const LABEL_LAYOUT = {
  'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['case', rank(1), 12, 11],
  'text-anchor': 'top', 'text-offset': [0, 0.6], 'text-max-width': 9, 'symbol-sort-key': ['get', 'rank'],
};
const LABEL_PAINT = { 'text-color': ['get', 'color'], 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.4 };
const AREA_LAYOUT = { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-max-width': 8 };
const AREA_PAINT = { 'text-color': ['get', 'color'], 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.4, 'text-opacity': 0.85 };

// Static data: memoized so the map's per-second GPS re-renders skip it.
export default React.memo(function PlacesLayer() {
  return (
    <GeoJSONSource id="service-area-places" data={PLACES}>
      <Layer id="places-area-label" type="symbol" minzoom={13} filter={rank(0)} layout={AREA_LAYOUT} paint={AREA_PAINT} />
      <Layer id="places-landmark-dot" type="circle" minzoom={14} filter={rank(1)} paint={DOT_PAINT} />
      <Layer id="places-dot" type="circle" minzoom={16} filter={rank(2)} paint={DOT_PAINT} />
      <Layer id="places-landmark-label" type="symbol" minzoom={14.5} filter={rank(1)} layout={LABEL_LAYOUT} paint={LABEL_PAINT} />
      <Layer id="places-label" type="symbol" minzoom={16.5} filter={rank(2)} layout={LABEL_LAYOUT} paint={LABEL_PAINT} />
    </GeoJSONSource>
  );
});
