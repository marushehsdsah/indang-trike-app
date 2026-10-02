# Running and checking live rides

The app supports passenger and driver accounts in the same installation. GPS
updates only while the app is open. No simulated driver, automatic acceptance,
or simulated navigation is included.

Pilot admins can monitor connected accounts on the God view website; see
[God view setup](god-view.md). Both roles now publish foreground GPS, including
idle passengers and drivers who are not accepting requests. Driver availability
still controls matching, and private ride updates still reach only the assigned
counterpart. Missing or stale GPS is labelled separately in the dashboard.

## Local setup

1. Install app and backend dependencies with `npm ci` in the repository root and
   `npm ci --prefix indang-trike-backend`.
2. Start local MongoDB and run `./start.sh` (Windows: `start.bat`). The scripts can
   start their existing MongoDB Docker container. The backend listens on port
   3000 and fails clearly if MongoDB cannot be reached.
3. For physical phones, set `EXPO_PUBLIC_API_URL` in `.env` to an address reachable
   from both phones, for example `http://192.168.1.100:3000`, then restart Metro.
   Both phones need access to the same backend. An Expo tunnel exposes Metro,
   not your backend; configure API reachability separately when using WSL (see
   [wsl-phone-networking.md](wsl-phone-networking.md)) or a
   different network. Use HTTPS for a remotely hosted backend.
4. Open the project in the IndangGO development build on both phones (Expo Go
   cannot run the MapLibre map; see [development-build.md](development-build.md)).
   Register one passenger and one
   driver. Driver signup requires plate, TODA, and passenger capacity (1–4).
   Driver registration is self-service for this prototype, without verification.
5. Existing phone/password accounts still log in and are treated as passengers.
   Complete their actual name/email in Profile before booking.

Run the backend alone with `npm run backend` or `npm start --prefix
indang-trike-backend`. Set backend `MONGO_URL` and `PORT` as shell environment
variables if needed. The Node server does not load `.env` itself; Expo loads the
app's public configuration. A physical phone must not use the Android emulator's
`10.0.2.2` address.

## Two-phone acceptance check

Use physical devices inside Indang; an emulator cannot prove actual GPS accuracy.

1. On the driver phone, enable location services, grant foreground permission,
   and tap Go online. The backend requires a measured fix at most 30 seconds old
   and at most 100 m reported accuracy. Keep the app open.
2. On the passenger phone, choose current-location pickup or explicitly choose
   a point on the map. Select a destination and confirm. Missing GPS must never
   substitute a campus location. A missing destination remains unselected.
3. A nearby available driver (within 5 km) receives a request with a 20-second
   deadline. Decline or let it expire to check that the next eligible driver is
   offered the request. Matching can search for up to 120 seconds.
4. Accept on the driver phone. Both phones must show the same ride and actual
   contact/vehicle details. The passenger must see measured driver movement,
   and the driver must see the passenger's live blue dot on the way to pickup.
5. Use Navigate to pickup, confirm Arrived at pickup, then Start trip when the
   passenger is aboard. Use Navigate to destination and Complete trip at the
   stop. Only the assigned driver controls those transitions.
6. Both accounts must see the persisted completed ride in History/Trips. The
   cash fare is PHP 45. Driver totals count completed fares in Asia/Manila time.

Also check:

- No available drivers: search ends with a real no-driver result.
- Cancellation before pickup: both accounts update and the driver is released.
- GPS denied/inaccurate: the driver cannot receive new requests.
- Phone with Google Location Accuracy off and location not yet granted: the
  permission prompt appears once, no "turn on Location Accuracy" dialog follows,
  and GPS stays on (plain GPS works without it). Approximate-only permission
  shows its own message asking for precise location.
- Outside Indang: both apps keep tracking live GPS. The passenger cannot book
  (the trip card says booking needs a pickup inside the service area), and an online driver shows
  "Outside Indang" and receives no requests until back inside.
- Minimize/lock the driver app: new matching stops. An assigned ride stays saved,
  and the passenger's position becomes unavailable/last known, not simulated.
- Reopen with network and GPS: the assigned trip is restored. An idle driver
  explicitly goes online again.
- Brief network loss: no invented trip progress; reconnect recovers a snapshot.
- Relaunch/server restart: sessions and assigned rides persist; drivers must
  reconnect with fresh GPS before receiving offers.

## Automated checks

```sh
npm test
npm run test:backend
NODE_ENV=production npx expo export --platform android --output-dir /tmp/indang-live-gps-export
```

`npm test` covers routing, request validation, GPS policies, UI session races,
configuration recovery, and pickup handling. React hook tests replace only native
location/storage/network boundaries; they execute the actual provider and hooks.
React 19 prints a test-renderer deprecation notice during those tests.

`npm run test:backend` requires local MongoDB and permission to bind a loopback
HTTP/WebSocket port. It creates a uniquely named `indang_test_<uuid>` database,
then removes only that database. It tests the actual database indexes, concurrent
actions, private socket delivery, GPS invalidation, logout, and restart recovery.

## Limits

This version uses one backend process. Do not run multiple dispatch instances
without adding a distributed reservation/dispatch design. Background GPS,
push notifications, ratings, payment processing, driver vetting, and administrator
dispute handling are not part of this version. History lists the latest 100 rides;
account totals are aggregated across all completed rides.

Automated tests and an Android bundle build do not establish physical GPS or iOS
behavior. Complete the two-phone check before relying on this for actual trips.
