# Offline A* Booking and Route Experience Design

Date: 2026-09-22

## Purpose

Replace the current fixed booking form and straight pickup-to-destination line with a map-first booking experience. Riders can choose pickup and destination locations within Indang, see a real road-following route, review distance and estimated travel time, and carry the same route into searching and active-ride screens.

The interaction should feel as direct and restrained as a modern ride-hailing app, while route visualization and active guidance should emphasize the legibility associated with navigation apps. It will not copy proprietary visual assets, branding, or map data.

## Success Criteria

- The booking screen defaults pickup to the device's current location when permission and an Indang location are available.
- CvSU Main Campus is the deterministic fallback pickup.
- Riders can select pickup and destination by searching bundled places or tapping the map.
- Selected coordinates snap to the nearest routable road node.
- A* calculates the fastest estimated tricycle route over real OpenStreetMap road geometry.
- The displayed polyline follows roads rather than connecting endpoints with a straight line.
- Booking shows route distance, ETA, fare, and passenger count before confirmation.
- Searching and active-ride screens receive and display the same calculated route.
- The active-ride map presents a next-maneuver banner and road-following route.
- Offline routing and local place search work without a routing or geocoding API.
- OpenStreetMap attribution is visible anywhere OSM-derived data is presented.

## Scope

### Included

- Map-first redesign of `BookingScreen`.
- Reusable route presentation updates for booking, searching, and active ride.
- Bundled Indang road graph generated from an OpenStreetMap snapshot.
- Pure JavaScript A* implementation with a binary min-heap.
- Fastest-time weighting based on distance and road class, with distance as a deterministic tie-breaker.
- One-way and motor-vehicle access handling from OSM tags.
- Spatial indexing for nearest-road snapping.
- Offline search over bundled named roads and named OSM places.
- Foreground location permission and one-time current-location lookup.
- Route distance, ETA, and simple turn instruction generation.
- Loading, permission-denied, outside-service-area, no-route, and malformed-data states.
- Automated tests for routing and route-derived behavior.

### Not Included

- Live traffic, closures, incidents, or crowdsourced reports.
- Voice navigation or background location tracking.
- Server-side routing.
- Full postal-address geocoding.
- Multiple route alternatives.
- Driver dispatch, live driver movement, or production fare policy.
- Changes to the existing authentication work.

The existing fixed ₱45 fare remains a prototype business value. This change will not invent a distance-based pricing policy.

## User Experience

### Booking Layout

The map fills the screen beneath floating controls. A compact top card contains pickup and destination rows. The bottom sheet contains the route summary, ride type, passenger stepper, optional note, fare, and primary confirmation button.

The visual system uses white surfaces, near-black text, generous spacing, and the app's green brand color. The route is a high-contrast blue line with a white underlay so it remains legible over either Google or Apple map tiles. Yellow remains reserved for the primary booking action and destination accent.

### Location Selection

Tapping a location row opens selection mode for that endpoint. The rider can:

1. Type into a local search field and choose a named place or road.
2. Pan the map and tap a coordinate.
3. For pickup, choose the current-location action again.

A map tap is accepted only when it lies within the existing Indang service polygon and can snap to a routable node within 750 metres. The marker is placed at the rider's chosen coordinate while routing begins at the snapped road coordinate; this avoids visually moving a recognizable destination while keeping the route drivable.

Changing either endpoint invalidates the previous route immediately, shows a compact calculating state, and recomputes A*.

### Route Preview

When a route exists, the map fits its coordinates with padding for the top card and bottom sheet. The sheet shows:

- Estimated travel time.
- Road distance.
- Standard Trike ride type.
- Passenger count from one to four.
- Existing prototype fare.
- Confirm action.

The confirm action is disabled until two valid endpoints and a route are available.

### Searching and Active Ride

Confirmation passes a serializable trip object containing endpoint labels and coordinates plus the calculated route object. `SearchingScreen` displays that route without recomputing it.

`ActiveRideScreen` uses the same geometry. Its map adds a navigation-style maneuver banner containing the next instruction and road name, a destination marker, and a driver marker. The existing prototype ride-state control advances progress along the calculated route and advances the visible maneuver; it does not claim to be live GPS tracking.

### Errors and Recovery

- Location permission denied: retain CvSU fallback and show a non-blocking explanation.
- Location request timeout or unavailable service: use the last known in-boundary location when possible, otherwise CvSU.
- Tap outside Indang: keep the prior endpoint and show an outside-service-area message.
- No nearby routable node: keep the selected marker but disable booking and request a point nearer a road.
- A* finds no path: show `No drivable route found` and allow either endpoint to be changed.
- Road graph fails validation: fall back to the current fixed endpoints but do not draw a misleading straight route; booking stays disabled with a data-unavailable message.

## Road Data Pipeline

### Source

The source snapshot is OpenStreetMap data queried for a bounding box covering the existing Indang municipality GeoJSON. It contains:

- Highway ways and referenced nodes.
- Relevant tags: `highway`, `name`, `ref`, `oneway`, `junction`, `access`, `vehicle`, `motor_vehicle`, `maxspeed`, `surface`, and `service`.
- Named nodes and areas useful for local place search, such as schools, government facilities, healthcare, markets, transport locations, tourism locations, and named neighbourhoods.

The repository includes the reproducible query, source date, graph statistics, and licence notice in `assets/routing/README.md`.

### Build Script

`scripts/build-road-graph.js` accepts an Overpass JSON path through a required `--input` argument and reads the committed municipality polygon. The raw snapshot is a reproducible build input documented in the routing README, but is not committed because the generated graph is the app's distributable artifact. The script:

1. Validates the OSM document.
2. Keeps motor-vehicle-accessible road classes suitable for a tricycle.
3. Rejects explicitly private or motor-vehicle-prohibited ways.
4. Converts each way into directed adjacent-node edges, respecting one-way and roundabout tags.
5. Calculates edge length with the Haversine formula.
6. Assigns an estimated speed from `maxspeed` when usable, otherwise from a documented road-class table.
7. Stores estimated travel seconds as the primary edge cost.
8. Builds a grid-based spatial index for nearest-node lookup.
9. Extracts and normalizes named places for offline search.
10. Writes deterministic, compact JSON to `assets/routing/indang-road-graph.json`.

The generated graph retains only data needed by the app and is committed so app startup never depends on Overpass availability.

### Licence

The app displays `© OpenStreetMap contributors` with a link to `https://www.openstreetmap.org/copyright`. The routing README identifies the graph as an OSM-derived database under ODbL and documents the snapshot and transformation process.

## Routing Architecture

### Graph Contract

The generated JSON has five top-level sections:

```json
{
  "metadata": {
    "sourceTimestamp": "timestamp from the OSM snapshot",
    "source": "OpenStreetMap",
    "maxSpeedKph": 50,
    "bounds": [14.0, 120.0, 15.0, 121.0]
  },
  "nodes": {
    "123": [14.197805, 120.881639]
  },
  "edges": {
    "123": [["124", 72.4, 8.7, "Indang-Trece Martires Road", "way/987654", "tertiary"]]
  },
  "spatialIndex": {
    "cell-id": ["123", "124"]
  },
  "places": [
    {
      "id": "node/1",
      "name": "Cavite State University",
      "kind": "school",
      "coordinate": [14.197805, 120.881639]
    }
  ]
}
```

The edge tuple fields are destination node ID, metres, estimated seconds, display road name, OSM way ID, and highway class. The exact numeric precision may be reduced by the build script when it does not materially change routing. The source timestamp comes from the input snapshot rather than the local build clock, keeping generated output deterministic. The graph loader validates every section and exposes a stable interface so UI code never reads raw JSON structures directly.

### A* Cost and Heuristic

Each edge stores travel seconds and metres. A* minimizes total travel seconds. When two frontier candidates have equal estimated total time, accumulated distance and then node ID provide deterministic ordering.

The heuristic is straight-line distance to the goal divided by the graph's maximum allowed speed. Because this cannot overestimate travel time, it remains admissible. The result includes node IDs, route coordinates, total metres, total seconds, and traversed road names.

The implementation has no routing-library dependency. A small binary min-heap keeps frontier operations efficient.

### Coordinate Snapping

`findNearestRoadNode` starts with the selected coordinate's spatial-index cell, expands neighbouring cells until it has a valid candidate, and returns the closest node by Haversine distance. It reports both node and snap distance. Points farther than 750 metres from a routable node are rejected.

### Turn Instructions

Contiguous edges with the same normalized road name are grouped into route steps. Bearing changes between groups produce `slight left`, `left`, `sharp left`, `slight right`, `right`, `sharp right`, or `continue`; small changes remain straight. Steps include instruction type, road name, start coordinate, and distance. The final step is always arrival.

## Application Components

- `utils/pathfinding.js`: Haversine distance, min-heap, A*, and deterministic tie-breaking.
- `utils/roadGraph.js`: graph loading, validation, and endpoint snapping. Road-class speed and access rules live in `utils/roadRules.js`, which is imported by both the build script and runtime modules.
- `utils/routeDirections.js`: route metrics and turn instruction derivation.
- `utils/placeSearch.js`: normalized local search and ranked results.
- `hooks/useCurrentPickup.js`: permission request, last-known/current location flow, boundary check, and fallback.
- `components/RouteMap.js`: route underlay/overlay, markers, map fitting, and OSM attribution.
- `components/LocationSearchPanel.js`: endpoint search and results.
- `components/BookingSheet.js`: route summary and booking controls.
- `data/indangMap.js`: service boundary and default locations; it no longer defines a straight route.

Components receive data and callbacks through props. Routing, snapping, searching, and direction generation remain pure modules independently testable without React Native.

## Data Flow

1. Booking loads the validated road graph.
2. The location hook requests foreground permission and supplies current pickup or CvSU fallback.
3. The default destination remains Harasan Cuevas Compound until changed.
4. Each endpoint is checked against the service polygon and snapped to the graph.
5. A* returns a route; direction generation adds steps and summary metrics.
6. `RouteMap` renders the route and fits the camera.
7. Confirmation passes `{ trip, route, passengers, note }` to `SearchingScreen`.
8. `SearchingScreen` passes the same object to `ActiveRideScreen`.
9. Active ride derives prototype marker progress and maneuver display from route coordinates and steps.

No screen independently reconstructs a route from only the two endpoints.

## Dependencies and Configuration

- Add the Expo-SDK-compatible `expo-location` package using `npx expo install expo-location`.
- Add foreground location permission text to Expo configuration.
- Keep `react-native-maps`; no second map SDK or routing SDK is introduced.
- Do not add a bottom-sheet package. The initial sheet uses React Native layout and `Animated` only if interaction requires it.

Expo documents that a current location fix may take several seconds, so the hook attempts a suitable last-known location first and updates it with a current fix when available.

## Testing Strategy

### Pure Unit Tests

- Finds the known fastest path on a hand-checked graph.
- Chooses a longer high-speed road over a shorter slow road when travel time is lower.
- Uses distance and node ID deterministic tie-breakers.
- Respects directed one-way edges.
- Returns no route for disconnected components.
- Snaps to the nearest indexed road node and rejects excessive snap distance.
- Calculates known Haversine distances within tolerance.
- Generates left, right, continue, and arrival steps from fixed coordinates.
- Ranks exact and prefix place matches ahead of substring matches.
- Rejects malformed graph data.

### Build-Pipeline Tests

- Converts a small OSM fixture into the literal expected directed graph.
- Excludes prohibited and non-motorized ways.
- Applies one-way and roundabout rules.
- Produces deterministic output.

### Integration and Manual Verification

- Existing full Node test suite remains green.
- Android production export bundles successfully.
- Emulator grants and denies location permission without crashing.
- Map tap and local search both recalculate a road-following route.
- Booking is disabled for outside, unsnappable, and disconnected endpoints.
- Booking, searching, and active-ride screens display identical route geometry and metrics.
- OSM attribution remains readable over the map.

## Performance Budgets

- Graph JSON target: no more than 5 MB uncompressed.
- Graph validation and initialization target: under 500 ms on the Android emulator.
- Typical Indang A* query target: under 150 ms after graph initialization.
- Local search target: under 50 ms for the bundled place set.

If the source snapshot exceeds these budgets, the build step will simplify non-intersection geometry while retaining road intersections, endpoints, names, directionality, and route distances.

## Planned File Changes

### New

- `assets/routing/indang-road-graph.json`
- `assets/routing/README.md`
- `scripts/build-road-graph.js`
- `utils/pathfinding.js`
- `utils/roadGraph.js`
- `utils/roadRules.js`
- `utils/routeDirections.js`
- `utils/placeSearch.js`
- `hooks/useCurrentPickup.js`
- `components/RouteMap.js`
- `components/LocationSearchPanel.js`
- `components/BookingSheet.js`
- Unit fixtures and tests under `tests/fixtures/` and `tests/`.

### Modified

- `screens/BookingScreen.js`
- `screens/SearchingScreen.js`
- `screens/ActiveRideScreen.js`
- `components/IndangMapLayers.js`
- `data/indangMap.js`
- `app.json`
- `package.json`
- `package-lock.json`

## Acceptance Checklist

- [ ] Device location or CvSU fallback initializes pickup.
- [ ] Search and map tap can set either endpoint.
- [ ] Both endpoints are constrained to Indang and snapped to the road graph.
- [ ] A* uses directed edges and fastest-time cost.
- [ ] Route polyline follows OSM roads.
- [ ] Booking displays distance, ETA, fare, and passengers.
- [ ] Confirmed route is reused on searching and active-ride screens.
- [ ] Active ride displays route-aware maneuver guidance.
- [ ] Failure states never display a misleading straight-line route.
- [ ] OSM attribution and ODbL documentation are present.
- [ ] Automated tests, Android export, and emulator checks pass.

## References

- Expo Location: https://docs.expo.dev/versions/v54.0.0/sdk/location/
- react-native-maps Polyline: https://github.com/react-native-maps/react-native-maps/blob/master/docs/polyline.md
- react-native-maps MapView: https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md
- OpenStreetMap copyright and licence: https://www.openstreetmap.org/copyright
