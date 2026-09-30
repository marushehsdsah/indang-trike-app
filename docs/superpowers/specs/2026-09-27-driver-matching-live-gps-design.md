# Driver matching and live GPS

Date: 2026-09-27

Status: approved by the user; implemented. Physical two-phone GPS validation remains required.

## Intended outcome

A passenger requests a tricycle, a real available driver accepts it, and both
accounts follow the same persisted trip through pickup and completion. Driver
screens use the backend for every operational action. Device location supplies
all moving positions. Remove simulated matching, navigation, trip progress,
identities, ride history, and personal statistics from the running app.

The user requested driver/passenger matchmaking, a functional driver UI connected
to the backend, and real GPS with the existing simulations removed.

Confirmed constraint: GPS updates only while the app is open for this version.

Approved defaults:

- Both roles use this Expo app, with separate authenticated navigation.
- Registration chooses passenger or driver; driver registration also captures
  vehicle plate, TODA, and passenger capacity. This is self-registration for the
  current prototype, not a claim that a driver has been vetted.
- Matching offers a request to the nearest eligible driver first.
- GPS runs while the app is open, as confirmed by the user. Keep this version
  compatible with Expo Go.
- The existing Indang service area, offline road graph, and A* route guidance
  remain the routing foundation. The backend supplies the existing PHP 45 flat
  cash fare as the actual first-version fare policy, rather than trusting a
  client-supplied amount.

## Baseline before this change

`server.js` supports registration and password checking against MongoDB, but
returns no authenticated session and stores only phone/password. Registration
collects names/email without sending them. `LoginScreen` bypasses authentication.

`SearchingScreen` opens an active ride after four seconds regardless of drivers.
`ActiveRideScreen` supplies a hardcoded driver and advances the ride by tapping a
status pill. `NavigationScreen` defaults to a simulated drive, but already has
foreground GPS, route projection, and offline rerouting. Home, history, and
profile contain fabricated personal data. Booking defaults to a sample trip and
can substitute a campus pickup when GPS fails.

The existing 102 Node tests passed during discovery. They cover routing and
other pure logic, not a real two-account dispatch flow.

## Approaches considered

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| Same app, nearest-driver offers, real-time events (recommended) | Reuses the UI and routing; one clear request card per driver | Requires offer expiry and driver reservations |
| Same app, requests broadcast to nearby drivers | Shorter dispatch flow; drivers choose requests | Drivers compete to accept, and proximity does not determine assignment |
| Separate passenger and driver applications | Independent distribution and release cycles | Adds build and maintenance work before validating this flow |

Use the first approach. A single backend process and the existing MongoDB setup
are sufficient for this iteration. Multi-instance dispatch is outside this design.

## Passenger experience

1. Log in through the API and restore the account's active request, if present.
2. Choose a destination and a pickup from current GPS or an explicit map/search
   selection. No sample destination is preselected. If GPS is unavailable, ask
   the passenger to choose a pickup; never label the campus or an old fix as the
   passenger's current location.
3. Confirm the route, passenger count, pickup note, and backend fare. Create a
   persisted request with an idempotency key before showing the search screen.
4. Display the actual search state. Transition to the active ride only after a
   driver accepts. Allow cancellation and show a genuine no-driver result.
5. Show the assigned driver's saved name, vehicle details, trip status, and live
   location. Driver-to-pickup routing is distinct from pickup-to-destination
   routing. Estimated travel time is labeled as an estimate.
6. Receive arrival, trip-start, completion, and cancellation updates from the
   server. Completion adds the real trip to history.

Use phone and SMS links for contact when the matched account has a phone number.
This does not introduce an in-app chat service. Contacts are exposed only to the
participants of the assigned ride.

## Driver experience

Reuse the current colors, buttons, sheets, maps, and typography. Driver navigation
has Home, Trips, and Profile.

- **Home, offline:** map and location status, a clear Go online action, and real
  completed-trip count and cash-fare total for the current day in Asia/Manila.
  An empty account shows zero. The total represents completed fares, not a payout.
- **Home, online:** availability and GPS freshness are visible. Going online
  requires a complete driver profile and a fresh location inside the service area.
- **Incoming request:** pickup, destination, estimated route distance/time,
  passenger count, pickup note, fare, and server-derived offer countdown. Accept
  and Decline call the backend and show errors or expired offers explicitly.
- **Assigned trip:** route to pickup and an Arrived at pickup action; then Start
  trip; then route guidance to the destination and Complete trip. Confirmation
  protects start/completion from accidental taps. Map arrival alone never marks
  a passenger as picked up or completes a ride.
- **Trips:** backend history with completed/cancelled status and recorded fare.
- **Profile:** actual account, vehicle, and TODA details with functional editing
  and logout. Do not display fabricated ratings or inactive settings controls.

The driver cannot go available or accept another offer during an assigned ride.
Navigating to another screen must not stop the driver's foreground GPS publisher.

## Backend and authentication

Keep `server.js` as a thin entry point and organize backend models, HTTP handlers,
session authentication, matching, and socket handling into focused modules under
`indang-trike-backend/`. Preserve compatibility with `start.sh` and `start.bat`.

Store accounts, sessions, and rides in MongoDB:

- **User:** normalized unique phone, password hash, real profile fields, role,
  driver vehicle fields, availability intent, latest measured GPS fix and server
  receipt time. Do not treat availability intent alone as evidence of presence.
- **Session:** cryptographically random bearer token, stored hashed on the
  server, linked account, and expiry. Store the client token in Expo SecureStore.
  Authenticate both HTTP and socket connections, enforce expiry, and revoke on
  logout. Password hashes and token hashes never appear in API responses.
- **Ride:** passenger, named endpoints/coordinates, route snapshot, passenger
  count, note, server fare, status, version, timestamps, current offer and expiry,
  attempted drivers, assigned driver, and cancellation/completion details.

Existing phone/password accounts remain valid and default to passenger. Missing
profile fields are completed by the account owner, not filled with fake names.
Normalize existing phone lookup compatibly and never overwrite existing users.

Backend responsibilities include server-side input validation, authentication
rate limiting, role checks, participant checks, service-area checks, and bounded
payload sizes. Validate endpoints and derive route/fare facts from the shared
road graph and server policy; client estimates are not authoritative.

HTTP covers register/login/logout, current account/profile, driver availability
and location, ride creation/current ride/history, and ride actions. Socket.IO
delivers private request, ride, and location updates. The server assigns rooms
from authenticated identity and ride participation; clients cannot subscribe to
arbitrary account or ride IDs.

## Matching and ride lifecycle

The persisted lifecycle is:

`searching -> accepted -> arrived -> in_progress -> completed`

Searching can end as `no_driver` or `cancelled`. An accepted or arrived ride can
be cancelled by either participant with a recorded reason. An in-progress ride
must be completed by its assigned driver; this iteration has no normal
mid-trip cancellation or administrative dispute workflow.

Proposed configurable dispatch defaults:

- Consider available, connected drivers with complete profiles, adequate vehicle
  capacity, and a fresh fix within Indang and 5 km of the pickup.
- Rank by geographic distance, with stable tie-breaking. This is not a claim
  of shortest road travel time.
- Offer to one driver for 20 seconds. Decline, expiry, lost availability, or lost
  presence releases the offer and tries the next eligible driver.
- Keep a request searching for at most 120 seconds. Retry when eligible drivers
  come online during that window. Expire to `no_driver` with a retry action.

Use a single Ride document to hold both the outstanding driver reservation and
the eventual assignment. Partial unique indexes enforce one active ride per
passenger and one reserved/assigned ride per driver. Conditional updates include
the expected ride state, offer identity, and unexpired deadline; acceptance,
cancellation, expiry, and completion cannot independently win the same transition.

Serialize availability and matching operations for each driver within the single
backend process; database uniqueness remains the assignment guard. A duplicate
reservation moves dispatch to another candidate. Repeated action requests return
the current authorized result or a clear conflict, never a second assignment.
Publish events only after persistence succeeds.

Offer deadlines are persisted and checked on every action. Server startup and a
periodic sweep reconcile overdue offers/searches; JavaScript timers are wakeups,
not the authority. After restart, drivers must reconnect and provide fresh GPS
before receiving offers. Assigned rides survive disconnects and restarts.

## Live GPS and synchronization

Use one foreground location subscription per active account at the application
provider level. Driver guidance consumes that subscription. Passenger personal
GPS is used for choosing pickup or personal guidance; the passenger's driver
marker always comes from the assigned driver's backend location.

Request frequent device fixes, targeting roughly 2-second publishing during a
ride and 5 seconds while available. OS scheduling can vary. Each fix preserves
its measurement timestamp, accuracy, heading, and speed where available. Never
advance a marker along a route using a timer or relabel a cached fix as new.

Accept finite coordinates and a plausible measurement timestamp; a matching fix
must be no older than 30 seconds with reported horizontal accuracy at most 100 m.
Maintain connection presence separately. Stationary drivers still need fresh
device measurements; repeating the last coordinate with a new timestamp is not
a GPS refresh. Clearly display waiting, denied, disabled, inaccurate, stale,
outside-area, and disconnected states.

When stale or disconnected, retain a last-known marker with its age and pause
live ETA claims. Exclude the driver from new matching. Preserve an assigned ride
so it can resume after reconnection. In foreground-only mode, entering the
background suspends availability for new requests; returning requires a fresh
fix. Tracking stops on logout or when an offline driver has no active trip.

HTTP snapshots remain authoritative. On connection, reconnection, app resume, or
an uncertain action response, fetch the current ride and outstanding offer.
Use ride versions and location timestamps to reject older events. Do not assume
that a socket library guarantees delivery after a disconnect.

Keep offline rerouting and guidance calculations. Separate calculated route
geometry from measured position: no vehicle marker is shown at a route's start
while waiting for the first real fix. GPS progress never changes trip lifecycle
status by itself.

Foreground updates are supported by the existing Expo Location watcher. Tracking
while minimized/locked is outside this version's agreed scope; it would require
a background task, additional permissions, native configuration, and a development
build. The UI must not promise ongoing tracking while the app is backgrounded.
See [Expo Location SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/location/).

## Removal of prototype behavior

- Remove the four-second matching timer and default active-ride payloads.
- Remove fixed driver data, fabricated review/trip counts, manual passenger
  status advancement, and simulated route-progress positions.
- Remove Simulate/Live GPS switching, simulation timers, play/pause, and speed
  controls from navigation.
- Replace fake home identity, recent trips, history, and profile statistics with
  API data and honest empty states. Remove unavailable no-op actions.
- Replace automatic sample pickup/destination selection with real GPS or explicit
  user choices. Static named-place shortcuts may remain as destinations.
- Preserve ordinary loading animations, route calculations, real place data, and
  deterministic test fixtures. These do not impersonate runtime ride activity.

## Verification and completion criteria

1. Existing routing tests continue to pass; update tests that expressly require
   prototype behavior when that behavior is removed.
2. Test role/participant authorization, session expiry/logout, malformed GPS,
   stale driver exclusion, offer expiry/decline, and legal lifecycle transitions.
3. Exercise MongoDB indexes and concurrent acceptance/cancellation against a
   separate disposable test database, proving there is only one winning driver
   and no passenger/driver double booking.
4. Test reconnect/restart restoration, idempotent request retry, and out-of-order
   events. Database outages must produce a visible failure, never a fake success.
5. Build/export the Android bundle and inspect both roles' layouts, loading,
   empty, permission-denied, and connection-error states.
6. Use two physical phones/accounts for final GPS verification: request, accept,
   approach pickup, arrive, start, move, complete, and confirm matching history.
   Emulator tests can check UI and API behavior but do not prove physical GPS.
7. Verify cancellation, no available drivers, temporary network loss, and app
   resume. Check that minimizing/locking the driver app removes it from new
   matching, marks old locations as stale, and preserves an assigned trip.

Update the project overview and local setup instructions to describe the actual
behavior and any remaining device-verification limits. This design does not add
payments, ratings, push notifications, in-app chat, or an administrator console.

## Technical references

- [Socket.IO connection recovery](https://socket.io/docs/v4/connection-state-recovery/):
  missed-event recovery is not guaranteed; reconnect needs state synchronization.
- [MongoDB unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/):
  partial unique indexes can protect the active passenger and driver slots.
