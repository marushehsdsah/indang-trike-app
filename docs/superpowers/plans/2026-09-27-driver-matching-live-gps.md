# Driver matching and live GPS implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in this session. Track results below.

**Goal:** Deliver real passenger/driver booking, driver trip controls, persisted accounts/rides, and foreground GPS without runtime simulation.

**Architecture:** Express/MongoDB owns authentication, ride transitions, and exclusive driver offers. Socket.IO signals private updates; authenticated HTTP snapshots recover state. An app-level session/ride/location provider serves both roles and the existing map/navigation components.

**Tech stack:** Existing Expo 54, React Native, Express 5, Mongoose 9; Socket.IO 4 and Expo SecureStore.

**Spec:** `docs/superpowers/specs/2026-09-27-driver-matching-live-gps-design.md` (approved).

## Global constraints

- Foreground GPS only; remain compatible with Expo Go.
- Preserve existing user changes and Indang offline A* routing.
- PHP 45 cash fare, 1–4 passengers, 5 km dispatch radius, 20-second offers, 120-second search, fixes at most 30 seconds old and 100 m accuracy.
- Server authority for roles, ownership, transitions, fares, and reservations.
- One active passenger request and one reserved/assigned ride per driver.
- No fabricated runtime identity, trips, GPS, matching, or automatic trip progress.

## Review focus

- A response is lost after booking succeeds: retries must not create a duplicate.
- Two driver actions/cancellation race: only one legal transition wins.
- An expired socket/session reconnects: no private data or mutation is permitted.
- GPS permission fails or app backgrounds: no current-position claim or new matching.
- Profile edits/legacy accounts contain missing fields: preserve identity and require actual completion.

## Tasks

### Task 1: Ride policies and persisted models

Files: `utils/rideState.js`, `indang-trike-backend/{models,policy}.js`, `tests/rideState.test.js`.

Interfaces: `validateFix(fix, now)`, `isFreshFix(fix, now)`, `rankDrivers(drivers, pickup, passengers, now)`, `nextRideStatus(status, action, role)`, `mergeRide(current, incoming)`. Models factory `createModels(connection)` returns User, Session, Ride. Ride fields use `id` in responses, `status`, `version`, `trip`, `route`, `driver`, `passenger`, `driverLocation`, `fare`, `offerExpiresAt`, `searchExpiresAt`.

- [x] Write/run failing tests for stale/malformed GPS, ranking, forbidden transitions, and old events.
- [x] Implement policy and model/index definitions.
- [x] Run `node --test tests/rideState.test.js`; expect all passing.

### Task 2: Authenticated backend and exclusive dispatch

Files: `indang-trike-backend/{app,auth,dispatch,models,policy}.js`, `server.js`, backend package manifest, `tests/backend.integration.js` (separate MongoDB command).

Interfaces: `createBackend({ mongoUri, clock, dispatchOptions })` returns `{ app, server, io, models, dispatch, close }`. HTTP under `/api`: register/login/logout, GET/PATCH me, GET state/history/config, POST rides, POST rides/:id/:action, POST driver/location and driver/availability. Mutations return a refreshed state or ride. `GET state` returns `{ user, ride, offer, serverTime }`; events `state:changed` request a snapshot, `driver:location` carries measured position. Socket auth `{ token }`.

- [x] Write failing integration tests against a unique disposable Mongo database for authentication, real request-to-completion, duplicate booking, privacy, cancellation/acceptance race, expiry/restart, and driver double reservation.
- [x] Implement sessions, validation, endpoint ownership, persisted offers, unique indexes, ordered dispatch, expiry sweep, and private events.
- [x] Install Socket.IO server/client dependencies. Run `npm run test:backend`; expect all passing against local MongoDB.

### Task 3: Shared client session, ride state, and foreground location

Files: `services/api.js`, `context/AppContext.js`, `hooks/useLiveLocation.js`, `utils/rideState.js`, `App.js`, `navigation/AppNavigator.js`, `screens/{Login,Register,Splash}Screen.js`, registration utility/tests, app configuration.

Interfaces: `useApp()` exposes user, ride, offer, connected, syncing, error, gps, config, history refresh, signIn/signOut/refresh, request, bookRide, rideAction, setAvailable. `useLiveLocation(enabled)` exposes `{ fix, status, retry }`; measured fix has latitude, longitude, accuracy, timestamp, heading, speed.

- [x] Extend registration/request tests for actual account fields and failed HTTP responses; verify RED.
- [x] Implement token storage, authenticated HTTP, single location subscription, app-state/socket lifecycle, snapshot recovery, and role-gated navigation.
- [x] Run unit tests and verify imports through Android export.

### Task 4: Functional driver and passenger experience

Files: `screens/{Driver,ActiveRide,Searching,History,Profile,Passenger,Booking}Screen.js`, `components/{BottomNav,BookingSheet,ConnectionBanner,RideDetails}.js`, `components/RouteMap.js` as needed.

- [x] Add tests for display state/driver action derivation and fresh-location handling; verify RED.
- [x] Implement driver availability, timed incoming offers, accept/decline, both route legs, confirmed driver actions, contact links, and actual history/profile.
- [x] Wire booking/cancel/search/restoration to backend; remove fabricated personal data and sample-trip fallback behavior.
- [x] Run unit/backend suites and export Android; verify account-role and trip-state paths.

### Task 5: GPS-only guidance and removal of simulation

Files: `screens/NavigationScreen.js`, `hooks/useCurrentPickup.js`, `utils/pickupLocation.js`, booking/navigation tests.

- [x] Change pickup tests to require no fabricated fallback; test freshness and missing GPS behavior.
- [x] Replace guidance's simulation source with shared GPS; retain offline rerouting, but render no vehicle until a measured fix exists. Remove unused simulation-only helpers/tests.
- [x] Verify unit tests, Android export, and source audit for remaining mock runtime data.

### Task 6: Integration review, setup, and handoff

Files: `.env.example`, `docs/project-overview.md`, `docs/driver-live-gps-testing.md`, this plan.

- [x] Document two-phone setup and foreground-only behavior, MongoDB test command, account creation, and exact field verification steps.
- [x] Run complete unit suite, real-Mongo integration suite, Android export, and `git diff --check`.
- [x] Perform fresh agent review as required by executing-plans; reproduce and fix material findings with focused regression tests.
- [x] Report verified behavior and physical-device checks that could not be performed here (see testing guide; physical two-phone check remains manual).

## Execution ledger

- User approved the written spec and explicitly instructed implementation. Execute inline; no repeated plan-approval request.
- Ruling: Work in the existing checkout without staging/committing unrelated changes. Much of the required passenger/routing implementation is uncommitted; a worktree from HEAD would omit it. Preserve that work and provide reviewable changes here.
- Baseline: 102 existing unit tests passed before product edits.
- Pre-flight: Task 1 policy/model fields feed Tasks 2–5. Task 2 state envelope and private events feed Task 3. Task 3 context feeds Tasks 4–5. Shared names above are consistent.
- Task 1: GPS, ranking, legal-action, and event-order tests RED→GREEN (5 passing).
- Task 2: First real-Mongo integration suite RED→GREEN (6 passing): authentication, full trip, retries, reservations/races, expiry, invalid GPS. Added `/stats` for all-time and Manila-day aggregates, and `lastRide` to snapshots for terminal event recovery.
- Tasks 3–5: Implemented session/provider, role navigation, driver screens, real history/profile, booking, GPS-only guidance. Registration, API errors, missing endpoints, and no-fallback pickup tests RED→GREEN. Android export passed.
- Verification environment: sandbox suppresses subprocess stdout in the pre-existing roadGraphBuilder CLI test; the approved full-test command outside the sandbox passes. No change to that test or builder.
- Final fresh review: four Important findings, no Critical or Minor findings; all four reproduced and fixed in one pass.
- Final: fixed late account mutation responses restoring private state after logout — three actual-provider race tests RED→GREEN, suite 105/105.
- Final: fixed booking payloads exceeding the server JSON limit — endpoint-only payload regression RED→GREEN; server still computes authoritative geometry, suite 105/105.
- Final: fixed unusable GPS retaining live status/dispatch eligibility — actual location-hook regression and two database invalidation tests RED→GREEN, suites 105/105 and 11/11. Assigned trips retain labeled last-known coordinates.
- Final: fixed transient configuration failure permanently preventing booking — actual-provider configuration recovery test RED→GREEN, suite 105/105.
- Final verification: `npm test` 105/105; `node tests/backend.integration.js` 11/11; Android production export passed (1,006 modules); `git diff --check` passed. React 19 test-renderer deprecation notice remains visible in the hook tests.
- Runtime audit: no simulated movement, auto-matching, mock identities/history, or fabricated current pickup. The static named places in `data/indangMap.js` remain searchable landmarks and routing-test fixtures, never automatic booking selections.
- UI copy audit: removed unsupported driver-vetting/offline-booking claims and stopped implying a driver is nearby when pickup routing fails.
- Device scope: Android Expo login, driver dashboard (real zero totals), empty trip history, and saved vehicle/profile details exercised against isolated review backend; no GPS injection. Physical movement, two-phone acceptance, and iOS remain unverified; use `docs/driver-live-gps-testing.md`.
