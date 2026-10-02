# God view for the General Trias pilot

The pilot team needs a browser dashboard showing drivers and passengers whose
mobile apps are connected, with measured locations and clear GPS freshness.
The user selected login using an existing app account designated as an admin.

## Scope and behavior

- Serve a responsive, read-only dashboard at `/god-view/` from the existing
  Express service. No separate hosting or frontend build is required.
- Reuse app phone/password login and sessions. A server-only
  `GOD_VIEW_ADMIN_PHONES` comma-separated allowlist grants dashboard access.
  Missing configuration denies access. Self-registration cannot grant access.
- Fetch `/api/admin/overview` every 3 seconds, authenticating and authorizing
  each request. The browser never connects a mobile presence socket itself.
- Online means at least one authenticated mobile socket remains connected.
  Driver availability, ride status, and GPS freshness are separate concepts.
- Show counts, role filters, name/vehicle search, a selectable user list and
  location details. Use General Trias bounds/boundary and OpenFreeMap with
  locally served MapLibre GL JS assets. Support fitting all displayed users.
- Locations older than 30 seconds or explicitly unavailable are last known,
  never presented as live. Missing GPS remains listed without a fabricated pin.
  Disconnected users disappear on the next successful refresh. A failed refresh
  clearly marks the dashboard as disconnected and all displayed data as old.
- Return only the fields needed for monitoring: id, name, role, driver vehicle,
  availability, small active-ride summary, measured location and freshness.
  Exclude passwords, tokens, email, phone, trip notes and location history.
- Mobile GPS runs and publishes while signed in and in the foreground, for
  both roles, including idle passengers and unavailable drivers. Backgrounding,
  logout or lost connection stops publication. Existing availability controls
  still govern driver matching. Explain admin location sharing on both homes.
- A stale/unavailable GPS signal is reported separately. Private ride socket
  events still reach only assigned counterparts. No public fleet feed.

## Implementation boundaries

`indang-trike-backend/admin.js` owns allowlist authorization and overview
serialization. `app.js` mounts protected APIs and static dashboard assets.
`web/god-view/` owns browser presentation, polling and maps. Existing app
context/dispatch own location collection and publication. No schema migration,
admin mutations, location history, fake drivers or dispatch controls.

## Verification

Test admin rejection and session expiry, presence across multiple sockets,
safe serialization, fresh/stale/missing/outside-area GPS, current ride status,
and logout. Test foreground mobile publication and stopping in background.
Run the complete Node suite, database/socket integration tests, an Android
bundle export, and browser checks for login, filters, markers, reconnect and
responsive layout. Browser fixtures must be clearly isolated from real data.

## Deployment

Set the allowlist on the backend and deploy the same service. Rebuild/reload
the mobile app to enable locations from idle users; older mobile builds can
still appear online but may have no location. Never choose or grant a real
admin account implicitly. The phone number may be configured later.

Implementation note: concurrent work expanded the shared service-area settings
to Indang and General Trias. The dashboard reads those settings dynamically; it
does not keep a separate fixed map boundary.
