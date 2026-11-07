# God view

The web dashboard shows connected drivers and passengers on the app's shared
service-area map, with role/search filters, active trip status, vehicle details and GPS age.
It refreshes every 3 seconds. It does not join mobile presence.

God view is a **separate website** in `web/god-view/`: static pages (no
server code) that sign in and read the IndangGO API cross-origin. The API does
not serve it. `build.mjs` writes the site into `web/god-view/dist/`, including
MapLibre GL JS and `config.mjs`, which names the API (`GOD_VIEW_API_URL`; it
must be `https://`, or `http://localhost` during development).

## Superadmins and admins

Two staff roles oversee the service (`utils/roles.js`). Both are set only in
the database, on the account (`role`, and an admin's `toda`); sign-up offers
passenger or driver. Neither can book or drive.

- **Superadmin** (`role: "superadmin"`): signs in to God view, and in the
  IndangGO app gets the admin screens for every TODA.
- **Admin** (`role: "admin"`, `toda`: one of Indang's TODAs, such as
  `"BCITODA"`, in any spelling): signs in on the IndangGO app and sees and
  manages only that TODA's drivers: their accounts, trips, approvals and
  decisions. Another TODA's driver is "not found" for them. God view refuses
  them. An admin without one of Indang's TODAs reaches nothing until one is
  assigned.

The API reads the role on every request, so a change applies at once, without
signing in again; a role spelled any other way (`"SuperAdmin"`) grants nothing.
A staff account needs its own mobile number (a TODA officer who also drives
keeps a separate driver account). Drivers whose TODA is not one of Indang's
are managed by superadmins only (God view's **Accounts**, **Pending
approval**).

- **Staff have no email and no "Forgot password?"** (for now, admins too;
  `NO_EMAIL_ROLES` in `utils/roles.js` lists the roles without one). Each is
  seeded straight into the database as a new account: `phone` (`+639…`),
  `password` (a bcrypt hash, never the password itself), `firstName`,
  `lastName`, `role` (and an admin's `toda`), and no email. "Forgot password?"
  answers a staff number as it answers a number no account uses, and sends no
  code, so trying numbers cannot tell which ones are staff; an email left on
  a staff account from before is not used, and a profile edit clears it. A
  lost password is replaced by seeding a new hash, which also signs the
  account out everywhere (its sessions are deleted).
- **To take the role away:** delete a superadmin's account; set an admin's
  `role` back to `"passenger"` (it then needs an email, added in its
  profile, before it can book), or delete the account.

A superadmin's account lists (God view's **Accounts**, and **Accounts** in the
app's admin screens) include the staff accounts: **Admins** shows them on
their own, each tagged Superadmin (every TODA) or Admin with the TODA it
manages ("No TODA yet" until one of Indang's is assigned). Staff never ride,
so a staff account has no trip history to open and is not on the map, and
the app's Dashboard counts only passengers and drivers. An admin's lists hold
only their TODA's drivers.

## Run locally

1. Seed a superadmin into your local database (above), on a mobile number no
   other account uses. Node 22 is the supported runtime.
2. Start the backend with `npm run backend` or the existing `./start.sh`.
3. Build and serve the website:

   ```sh
   cd web/god-view
   npm ci
   GOD_VIEW_API_URL=http://localhost:3000 npm start
   ```

4. Open `http://localhost:8080` and sign in with the superadmin's number and
   password.

No account is created or promoted by signing into the dashboard. Accounts that
are not superadmins are denied by the API, even with valid app credentials.

## Hosted pilot

The website is a free Render **Static Site**, separate from the API service.

1. Seed the superadmin(s) into the API's database (Atlas), as above. No
   environment variable grants access: a `GOD_VIEW_ADMIN_PHONES`
   left on the API service from before is ignored and can be deleted once a
   superadmin can sign in.
2. Create the website, either from the `indanggo-god-view` entry in
   `render.yaml` (**New → Blueprint**), or by hand with **New → Static Site**:
   - Repository and branch: this repository, `render-deploy`.
   - Root directory: `web/god-view`.
   - Build command: `npm ci && npm run build`.
   - Publish directory: `dist`.
   - Environment variables: `GOD_VIEW_API_URL` =
     `https://indanggo-api.onrender.com`, `NODE_VERSION` = `22`.
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
- **Routes:** every booked ride is drawn as solid road routes, coloured by
  stage: **purple** while the passenger's requested trip waits for a driver;
  **green** from the driver's live GPS to the passenger once a driver accepts
  (computed on the API's offline road graph, as the app's route guide does),
  with the booked trip ahead in **blue**; and **blue** from pickup to
  destination during the trip. Green and yellow dots mark pickup and
  destination. Selecting the driver or passenger frames the whole path and
  lists each leg's distance and time.
- **Places:** the same establishments, landmarks and named areas the app
  draws (`assets/places`, from the offline place index): a dot coloured by
  category (food, shops, schools, health, churches, government, transport,
  parks, lodging, landmarks, services) with its name. Landmarks appear from
  zoom 14, other establishments from zoom 16, subdivisions and business
  parks as italic labels from zoom 13. Streets and buildings come from the
  base map.
- **On a trip:** a driver and passenger travelling together share one blue
  **DP** marker at the trike (placed by the driver's phone, or the
  passenger's when the driver has no fix). Clicking it, or either person in
  the list, opens one card with both people and the trip.
- **Last known:** an old/invalidated reading, drawn in grey with its age. If
  dashboard updates fail or take over 10 seconds, counts pause and markers are
  marked last known until a fresh snapshot arrives.

Phones track and publish while signed in and foregrounded, normally every
5 seconds and every 2 seconds during a ride. Home screens explain admin
sharing. Background tracking and historical location storage are not added.
The dashboard exposes names, roles, vehicles and current trip summaries; it
does not expose phone numbers, emails, passwords or pickup notes. Existing
private ride events still go only to the assigned passenger/driver.

## Cancelling a booking

A superadmin can cancel any booking or trip that has not ended: **Accounts**, open
the driver's (or passenger's) account, choose **Ongoing** in its trip history,
then **Cancel booking** on the trip. It works at every stage: still finding a
driver, on the way to the pickup, waiting there, or under way. The admin
confirms and may type a reason. The trip ends at once (`POST
/api/admin/rides/<id>/cancel`): the passenger and driver see it cancelled in
the app with that reason (or "Cancelled by an IndangGO admin"), and the driver
can take the next booking. Trip histories then list it as cancelled by the admin.

## Downloading a driver's trip records

A driver's account page (**Accounts**, then the driver) has **Download PDF**
beside the period. It asks which trips to include, the last 7, 14 or 30 days,
then saves a PDF (`indanggo-<name>-trips-last-<days>-days-<date>.pdf`) with:

- the driver's name, mobile number, email, plate, TODA and status:
  **Registered** (approved, or from before approval), **Pending** (waiting for
  approval) or **Suspended**, with the date and reason;
- their rating (overall, and from the trips in the period);
- the period's total, completed and cancelled trips, and the fares earned from
  completed trips;
- each trip booked in the period: when, its ID, route, passenger, fare, status
  and rating, newest first.

The site makes the PDF itself (`web/god-view/src/driverReport.mjs`, drawn by
`pdf.mjs`) from the same trip history the page reads
(`GET /api/admin/accounts/<id>?days=<days>`), so the API needs no change.
Times are in Philippine time. The PDF uses the fonts every PDF reader has,
which have no peso sign, so fares read "PHP 45". It holds personal
information, as its footer says: keep it private.

## TODAs and their drivers

The **TODAs** tab lists every Indang TODA, each with the drivers who signed up
under it (`GET /api/admin/todas`): name, plate, mobile number, rating, and
whether they are online, waiting for approval or suspended. A rating reads
**4.8 ★ (12)**: the average of the 1 to 5 stars passengers gave the driver
after their trips, and how many ratings that is. A TODA's rating is the same
over all its drivers' ratings. Drivers whose TODA is not an Indang TODA are
listed last, under **Other TODAs**, with the TODA they gave. Search by name,
plate or mobile number, or sort the highest rated first. A driver's name opens
their account and trips; its back link returns to their TODA.

## Changing fares

The **Fares** tab lists each TODA with the fares of the barangays it serves
(ITODA, which serves every barangay, lists them all), plus the two amounts
every TODA shares: what each passenger past two adds to a special trip, and
the flat fare. Each fare is a special trip's (the whole trike, the only trip
the app books) and has a day and a night amount. Fares start as the municipal
taripa (`assets/fares/indang-fares.json`); its regular per-passenger fares are
not offered, so they are not listed.

To change fares, type the new amounts (₱1 to ₱1,000, with centavos if needed,
at most two decimal places, like `12.50`), then
**Save changes** and confirm. Typed fares are highlighted and kept while you
look at other TODAs; **Discard** drops them. A fare that differs from the
taripa shows the taripa's amount beside it, and typing the taripa's amount
back restores it.

- A fare belongs to a place, not to a TODA: a barangay two TODAs serve has one
  set of fares, so changing it there changes it under both (the area says
  which other TODAs list it).
- New bookings are charged the saved fares at once (`GET`/`POST
  /api/admin/fares`). Trips already booked keep their fare.
- Phones with the updated app fetch the new fares within about 15 seconds, so
  the fare shown before booking is the one charged; a booking quoted with old
  fares is refused with "Fares were just updated", and the app then shows the
  new fare. Older app builds are still charged the new fares and see them on
  the trip, but show the taripa's amount before booking until they update.
- If another superadmin saved a fare you are typing, the page says so and keeps your
  amount; save again to replace theirs.

Only amounts change here. The areas, their barangays, the night hours and the
pricing rules come from the taripa file.

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
