# IndangGO — what we built, what it runs on, what to improve

Last updated: 2026-09-27

IndangGO is a tricycle ride-hailing prototype for Indang, Cavite. It books a
trike between two points, routes over real road geometry **without any routing
or geocoding API**, and guides the ride with a Waze-style 3D view. This document
inventories what exists, the technology behind it, and where to take it next.

---

## 1. What we added

### 1.1 Offline routing engine

Everything below runs on the device with no network call.

| Piece | File | What it does |
| --- | --- | --- |
| Road graph | `assets/routing/indang-road-graph.json` | 11,380 nodes, 23,222 directed edges, 458 named places, 2.4 MB. Built from an OpenStreetMap snapshot clipped to the municipal boundary. |
| Graph builder | `scripts/build-road-graph.js` | Turns an Overpass JSON export into the graph: keeps tricycle-drivable road classes, applies one-way and access tags, measures edges, estimates speeds, builds the spatial index, extracts places. Deterministic output. |
| A* pathfinding | `utils/pathfinding.js` | Fastest-time A* with an admissible straight-line heuristic, a binary min-heap, and deterministic tie-breaking. Runs over a typed-array (CSR) compilation of the graph. |
| Graph loading & snapping | `utils/roadGraph.js` | Validates every section of the graph, snaps a tapped coordinate to the nearest routable node via a grid spatial index (750 m limit). |
| Turn directions | `utils/routeDirections.js` | Groups edges into steps and classifies bends into turn instructions plus arrival. |
| Place search | `utils/placeSearch.js` | Ranked offline search (exact → prefix → word → substring) over bundled place names. |
| Road rules | `utils/roadRules.js` | Road-class speed and access table shared by the builder and the app. |
| Shared loader | `data/roadNetwork.js` | Loads, validates, and compiles the graph once per session; warmed while the home screen is idle. |

### 1.2 Booking experience

- Map-first booking: pickup uses fresh device GPS or an explicitly selected
  location. Missing/invalid GPS never substitutes a campus pickup.
- **Map-pick mode** — tap the pin button, then tap the map: pickup is set and the
  bar advances to destination automatically, so both stops take one tap each.
  The camera holds still while picking and frames the route when you finish.
- Offline place search, "Choose on map", and "Use my current location".
- Live route summary (time, distance) and a flat-fare booking sheet.
- The backend computes the authoritative road route from the selected stops.
  Persisted booking state drives searching and active-ride screens.

### 1.3 Waze-style 3D route guide (`screens/NavigationScreen.js`)

- Tilted 3D camera (pitch 60°, zoom 18) that rotates so travel is always "up",
  with heading sampled 30 m ahead so it eases into bends.
- Vehicle sits low on screen; while following it is drawn as an overlay at the
  camera target so it glides instead of jumping between updates.
- Turn banner with distance, road name, and a "Then …" preview; ETA panel with
  remaining time, distance, and arrival clock.
- 2D/3D toggle, route overview, re-center, and pan-to-detach.
- Foreground **live GPS** snapped to the route, with **offline rerouting** when
  the rider leaves it. No simulated drive, speed controls, or invented position.

### 1.4 Indang service area

- Everything outside the municipal boundary is greyed out with a mask polygon.
- Maps open over Indang, but the camera can pan past the boundary, so live GPS
  outside Indang is still shown and tracked.
- A minimum zoom stops zoom-out at roughly the whole municipality.
- Taps outside the service area are rejected with an explanation.
- Booking and driver matching are Indang-only: a passenger whose GPS is outside
  Indang sees that rides can only be booked inside Indang, and drivers outside
  it stay online and keep sharing GPS but receive no ride requests.

### 1.5 Design system and UI

| Piece | File | Contents |
| --- | --- | --- |
| Tokens | `theme.js` | Colour ramp (brand/ink/line/status), type scale, 4 px spacing scale, radii, elevation presets. |
| Primitives | `components/ui/` | `Button` (6 variants, loading, haptics), `IconButton`, `Field`, `AppHeader`, `Screen`/`BleedScreen`, and `Surfaces` (`Card`, `Sheet`, `Chip`, `ListRow`, `Badge`, `Avatar`, `SegmentedControl`, `Divider`, `EmptyState`). |
| Screens | `screens/` | Splash, Login, Register, Passenger home, Driver home, Booking, Searching, Active ride, 3D guide, History, Profile. |

Rebuilt in the Uber/Waze idiom: a "Where to?" home that hands a query straight
into booking search, a driver card with plate chip and call/message actions,
filterable persisted ride history, and an editable account/vehicle profile.
Drivers have availability controls, timed requests, accept/decline, pickup and
destination guidance, and confirmed arrival/start/completion actions.

**Defects fixed along the way:** dead History/Profile tabs (Profile was never
registered in the navigator), a login card clipped by its ScrollView, a
"Cancel ride" button cut off the bottom of the screen, deprecated `SafeAreaView`
in six screens, headers colliding with the status bar, an unreadable button on
the splash, a clipped vehicle marker, and the 3D-guide button covering the
OpenStreetMap attribution.

### 1.6 Authenticated live-ride backend (`indang-trike-backend/`)

Express + Mongoose against MongoDB, with authenticated login, hashed passwords,
revocable sessions, role checks, profile editing, persisted rides, and real
history/statistics. Expo SecureStore saves the app session. Socket.IO delivers
private updates; authenticated snapshots recover trips after reconnection.

The nearest eligible driver within 5 km receives an exclusive 20-second offer;
searching lasts up to 120 seconds. Eligibility requires availability, capacity,
connection, and fresh, accurate GPS inside Indang. Database unique indexes,
idempotent bookings, and ordered transitions prevent duplicate assignments.
Driver GPS is shared only with the assigned passenger. Passenger GPS runs
whenever the passenger app is open and is shared only with the driver holding
their ride (accepted through completion). Backgrounding the app stops new
matching without discarding an assigned trip.

### 1.7 Tests

**105 unit/component tests** using `node:test`, including actual React provider
and location-hook regressions. They cover routing, booking, GPS, authentication
transport, session races, configuration recovery, and performance budgets.
**11 integration tests** use a disposable MongoDB database and real HTTP/socket
connections for matching, privacy, races, expiry, logout, and restart recovery.
Run `npm test` and `npm run test:backend`.

---

## 2. Technologies used

### 2.1 App runtime

| Layer | Technology | Notes |
| --- | --- | --- |
| Framework | React Native 0.81.5, React 19.1 | New Architecture (Fabric) enabled. |
| Platform | Expo SDK 54 | Runs in a development build (`expo-dev-client`), not Expo Go; see [development-build.md](development-build.md). |
| JS engine | Hermes | No JIT — the reason routing is written against typed arrays. |
| Navigation | React Navigation 7 (native stack) | `navigation/AppNavigator.js`. |
| Maps | `@maplibre/maplibre-react-native` 11 with [OpenFreeMap](https://openfreemap.org) tiles | Free OpenStreetMap vector maps: no API key, account, or usage limit. GeoJSON layers for routes and the Indang mask, view annotations for markers. |
| Location | `expo-location` | Foreground current fixes and `watchPositionAsync`; stale/inaccurate measurements are rejected, and fixes outside Indang are kept but flagged. |
| Session/live updates | `expo-secure-store`, `socket.io-client` | Secure token storage, private updates, snapshot recovery. |
| UI extras | `expo-linear-gradient`, `expo-haptics`, `expo-status-bar`, `react-native-safe-area-context`, `@expo/vector-icons` | Gradients, tactile feedback, safe areas, icons. |
| Testing | `node:test` + `node:assert/strict` | `npm test`. |

### 2.2 Backend (prototype)

Express 5, Mongoose 9, MongoDB (local, Docker), bcryptjs, cors, Socket.IO 4.

### 2.3 Algorithms and techniques

- **A\*** over estimated travel seconds; heuristic = straight-line distance ÷ the
  graph's maximum speed, which cannot overestimate, so results stay optimal.
- **CSR adjacency in typed arrays** (`Float64Array`/`Int32Array`) with an
  index-based binary heap — chosen because Hermes has no JIT and per-object
  allocation dominated the original implementation.
- **Haversine** distances; **equirectangular** projection for local point-to-segment
  work.
- **Grid spatial index** (0.005° cells) for nearest-road snapping, searched in
  expanding rings.
- **Polyline projection** with a search window for snapping GPS to the route,
  plus off-route detection and offline rerouting.
- **Bearing sampling with look-ahead** for a camera that turns smoothly.

### 2.4 Data sources and licensing

| Data | Source | Licence |
| --- | --- | --- |
| Road network, places | OpenStreetMap via Overpass API | ODbL 1.0 — `© OpenStreetMap contributors` shown on every map drawing it. |
| Municipal boundary | GeoRiskPH / ULAP PSA municipal boundary service (PSGC 0402110000) | Confirm terms before redistributing. |

---

## 3. Repository map

| Path | Contents |
| --- | --- |
| `screens/` | Passenger and driver experiences, auth, booking, guidance, history, profile. |
| `utils/` | Pure routing, guidance, search, validation, and ride policies. |
| `tests/` | Unit/component tests and real-Mongo integration suite. |
| `components/`, `components/ui/` | Maps, sheets, ride details, and design-system primitives. |
| `context/`, `services/`, `hooks/` | Session/ride provider, API client, foreground GPS, account data. |
| `indang-trike-backend/` | Authentication, persisted models, exclusive dispatch, HTTP/socket server. |
| `scripts/`, `data/`, `theme.js` | Road-graph pipeline, map data, design tokens. |

The pure modules under `utils/` are deliberately React-free so they can be
tested with plain Node.

---

## 4. Measured performance

Reproduce routing numbers with `node tests/roadGraphData.test.js`.

| Check | Result |
| --- | --- |
| A* route, Node 22 (JIT) | ~4.7 ms median |
| A* route, Hermes on Android emulator | 22.2 ms median, 47.6 ms p90 — down from 48.8 / 104.8 ms before the typed-array rewrite |
| One-time graph compile (Hermes) | ~60 ms, warmed while the home screen is idle |
| Graph validation | ~52 ms (Node) / ~81 ms (Hermes) |
| 20 offline place searches | ~19 ms total |
| Guide memory (Android, 192 MB heap) | peaks ~70 MB while driving, returns to ~25 MB after arrival |

The rewrite was verified to return **identical routes** on 500 random node pairs,
including a Dijkstra cross-check.

---

## 5. Known limitations

1. **The base map still needs network.** Routing, search and rerouting are
   offline; OpenFreeMap's map tiles are not.
2. **Foreground GPS only.** Keep the app open; no background tracking or push
   notifications. Idle drivers explicitly go online again after reconnecting.
3. **One backend process.** Multi-instance dispatch needs distributed coordination.
4. **Self-service driver registration.** Driver vetting/admin tools are not included.
5. **Fare is a flat ₱45 cash fare**, not a distance-based policy or payment integration.
6. **Physical two-phone GPS and iOS checks remain required.** Automated tests and
   an Android bundle build cannot establish field behavior. See
   [live-ride testing](driver-live-gps-testing.md).
7. Reloading through a debugger connection can leak the previous JS instance
   (a dev-tooling artifact, not app behaviour) — cold start before judging
   memory.

---

## 6. How to improve it

### Near-term (highest value per effort)

1. **Run the two-phone field acceptance checklist** inside Indang with real GPS.
2. **Add operational driver verification** before a public service launch.
3. **Keep the screen awake while navigating** — `npx expo install expo-keep-awake`
   and `useKeepAwake()` in `NavigationScreen`.
4. **Voice guidance** with `expo-speech`, announcing each maneuver at roughly
   300 m / 100 m / on arrival. The step data already carries everything needed.
5. **Distance-based fare** with a visible breakdown, replacing the flat ₱45.
6. **Lint and CI.** Add ESLint + Prettier and a GitHub Actions job running
   `npm test` on every push.

### Medium-term

7. **Host the backend** (e.g. a free Render web service with MongoDB Atlas M0)
   so preview builds work away from the development PC.
8. **Background driver GPS and push notifications**, once a development build
   and an explicit background-location policy are approved.
9. **Richer OSM rules:** turn restrictions, barriers and gates, plus roads where
   tricycles are prohibited — all present in OSM but not yet modelled.
10. **Snap to the nearest road *segment*** rather than the nearest node, and show
    a short walking leg for the first and last metres.
11. **Route alternatives** (k-shortest paths) so riders can choose.
12. **Graph refresh pipeline:** scheduled rebuild, a version stamp in the app, and
    a diff report; consider a packed binary format to cut the 2.4 MB JSON parse.
13. **Broader UI tests:** React Native Testing Library for primitives and Maestro
    for two-account flows, beyond the current hook/provider regression tests.
14. **TypeScript** (or JSDoc with `checkJs`), starting with `utils/` where the
    contracts are already strict.

### Longer-term

15. **True offline maps** — bundling Indang's vector tiles with the MapLibre map
    would remove the last network dependency and make the app usable with no
    signal.
16. **Better map-matching** for live GPS (Kalman filter or an HMM matcher)
    instead of nearest-point projection.
17. **Scale the graph beyond Indang** (multi-municipality). At that size, add ALT
    landmarks or contraction hierarchies so queries stay fast.
18. **Accessibility and localisation:** a Filipino/Tagalog translation, dynamic
    type, screen-reader passes, and a dark theme — the token layer makes the last
    one mostly mechanical.
19. **Payments and receipts** (e.g. GCash), plus push notifications when the
    driver arrives.
20. **Crash and analytics reporting** to see real-world routing failures.

---

## 7. Related documents

- `assets/routing/README.md` — graph provenance, Overpass query, rebuild steps,
  transformation rules, performance budgets.
- `assets/geo/README.md` — municipal boundary source.
- `docs/superpowers/specs/2026-09-22-offline-a-star-booking-route-design.md` —
  original design for the offline routing work.
- `docs/superpowers/plans/2026-09-22-offline-a-star-booking-route.md` — the plan
  that work followed.
