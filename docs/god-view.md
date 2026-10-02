# God view

The web dashboard shows connected drivers and passengers on the app's shared
service-area map, with role/search filters, active trip status, vehicle details and GPS age.
It refreshes every 3 seconds. It is read-only and does not join mobile presence.

God view is a **separate website** in `web/god-view/`: static pages (no
server code) that sign in and read the IndangGO API cross-origin. The API does
not serve it. `build.mjs` writes the site into `web/god-view/dist/`, including
MapLibre GL JS and `config.mjs`, which names the API (`GOD_VIEW_API_URL`; it
must be `https://`, or `http://localhost` during development).

## Run locally

1. Put `GOD_VIEW_ADMIN_PHONES=09171234567` in the git-ignored `.env.backend` at
   the repository root, substituting the approved account's phone number. Use
   commas for multiple accounts. Local `server.js` loads this file; exported
   environment variables take precedence. Node 22 is the supported runtime.
2. Start the backend with `npm run backend` or the existing `./start.sh`.
3. Build and serve the website:

   ```sh
   cd web/god-view
   npm ci
   GOD_VIEW_API_URL=http://localhost:3000 npm start
   ```

4. Open `http://localhost:8080` and use that account's existing app password.
   Register the account in the mobile app first if it does not exist.

No account is created or promoted by signing into the dashboard. Unlisted
accounts are denied by the API, even when they have valid app credentials.
The allowlist is read at startup; restart the backend after changing it.

## Hosted pilot

The website is a free Render **Static Site**, separate from the API service.

1. On the API service in Render, add the environment variable
   `GOD_VIEW_ADMIN_PHONES` with the approved mobile number(s) and redeploy. The
   git-ignored local `.env.backend` is not sent to Render.
2. Create the website, either from the `indanggo-god-view` entry in
   `render.yaml` (**New → Blueprint**), or by hand with **New → Static Site**:
   - Repository and branch: this repository, `render-deploy`.
   - Root directory: `web/god-view`.
   - Build command: `npm ci && npm run build`.
   - Publish directory: `dist`.
   - Environment variables: `GOD_VIEW_API_URL` =
     `https://indang-trike-app.onrender.com`, `NODE_VERSION` = `22`.
   - Headers (Settings → Headers), path `/*`: `X-Frame-Options: DENY`,
     `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
3. Open the site's address, for example `https://indanggo-god-view.onrender.com`.

Any static host (Netlify, Vercel, GitHub Pages) can serve `dist/` the same way.
The API answers browsers from any origin (`CORS_ORIGIN` unset); set
`CORS_ORIGIN` on the API service to the website's address to accept only it.

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
- **Route guide:** a matched ride (accepted through in progress) is drawn as
  the driver's route guide shows it: a solid blue road route from the driver's
  live GPS to the pickup (computed on the API's offline road graph, as the app
  does), then the booked trip to the destination, dashed until pickup and
  solid once the trip starts. Green and yellow dots mark pickup and
  destination. Selecting the driver or passenger frames the whole path and
  lists each leg's distance and time. Unmatched requests draw no route.
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
npx playwright install chromium-headless-shell
npm run test:god-view
```

The browser check builds the website and serves it from its own port, so it
reads the API cross-origin as in production. In WSL, Chromium needs the system
libraries `libnss3`, `libnspr4` and `libasound2t64` (`sudo apt-get install`, or
`npx playwright install-deps`).

Integration/browser tests need local MongoDB and permission to bind loopback
ports. Each creates and deletes only its own uniquely named test database.
Browser checks produce screenshots in `/tmp/indang-god-view-*.png`. They cover
a full-size map, access control, markers, filtering, missing/stale positions, interrupted
updates, responsive layout and logout using actual API and socket connections.

Maps use [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) and the
same OpenFreeMap service as the app. MapLibre is pinned in
`web/god-view/package.json` and copied into the site; map tiles still require
internet. The people list works if tiles cannot load.
