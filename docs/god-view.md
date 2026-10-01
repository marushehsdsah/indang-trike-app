# God view

The web dashboard shows connected drivers and passengers on the app's shared
service-area map, with role/search filters, active trip status, vehicle details and GPS age.
It refreshes every 3 seconds. It is read-only and does not join mobile presence.

## Run locally

1. Install backend dependencies: `npm ci --prefix indang-trike-backend`.
2. Put `GOD_VIEW_ADMIN_PHONES=09171234567` in the git-ignored `.env.backend` at
   the repository root, substituting the approved account's phone number. Use
   commas for multiple accounts. Local `server.js` loads this file; exported
   environment variables take precedence. Node 22 is the supported runtime.
3. Start the backend with `npm run backend` or the existing `./start.sh`.
4. Open `http://localhost:3000/god-view/` and use that account's existing app
   password. Register the account in the mobile app first if it does not exist.

No account is created or promoted by signing into the dashboard. Unlisted
accounts are denied by the API, even when they have valid app credentials.
The allowlist is read at startup; restart the backend after changing it.

## Hosted pilot

Deploy the updated backend repository as usual. In Render, add the server-only
environment variable `GOD_VIEW_ADMIN_PHONES` with the approved mobile number(s),
then restart/redeploy. Open `https://<your-backend>/god-view/`. The backend and
dashboard share an origin; no additional hosting, map key or frontend build is
needed. The git-ignored local `.env.backend` is not sent to Render.

Rebuild/reload the mobile app with this change on both test phones. Both must
use the same backend as the dashboard. Old builds still appear connected, but
idle passengers and unavailable drivers may have no recent location.

## Meaning of the display

- **Online:** at least one authenticated mobile connection is open. Multiple
  phones/sockets for one account count as one person. Leaving the app or losing
  its connection removes the person once the server detects disconnection.
- **Ready for requests:** a driver is available, has fresh GPS inside the
  service area, and has no active offer/trip. Connected drivers may choose not
  to accept rides and still appear in the dashboard.
- **Live GPS:** measured within 30 seconds, accuracy at most 100 metres, and
  not invalidated by the phone. No location is invented when GPS is missing.
- **Last known:** an old/invalidated reading, drawn in grey with its age. If
  dashboard updates fail or take over 10 seconds, counts pause and markers are
  marked last known until a fresh snapshot arrives.

Phones track and publish while signed in and foregrounded, normally every
5 seconds and every 2 seconds during a ride. Home screens explain admin
sharing. Background tracking and historical location storage are not added.
The dashboard exposes names, roles, vehicles and current trip summaries; it
does not expose phone numbers, emails, passwords or pickup notes. Existing
private ride events still go only to the assigned passenger/driver.

## Checks

```sh
npm test
npm run test:backend
npx playwright install chromium
npm run test:god-view
```

Integration/browser tests need local MongoDB and permission to bind loopback
ports. Each creates and deletes only its own uniquely named test database.
Browser checks produce screenshots in `/tmp/indang-god-view-*.png`. They cover
access control, markers, filtering, missing/stale positions, interrupted
updates, responsive layout and logout using actual API and socket connections.

Maps use [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) and the
same OpenFreeMap service as the app. Vendor assets are pinned and served locally;
map tiles still require internet. The people list works if tiles cannot load.
