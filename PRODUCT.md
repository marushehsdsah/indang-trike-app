# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

- **Passengers:** mostly Cavite State University students and local residents of
  Indang and General Trias, booking short tricycle trips within their town.
- **Drivers:** TODA (tricycle operators and drivers association) members on
  low- to mid-range, often older Android phones.
- **Pilot admins:** watch connected drivers and passengers on the separate God
  view website (`web/god-view`).

Both app roles use the phone outdoors in bright sun, glancing at it while
waiting or driving, often one-handed or with the phone mounted on the trike,
in barangays with weak or no mobile data.

## Product Purpose

IndangGO books a tricycle between two points in Indang or General Trias, matches
the passenger with a nearby driver of the right town (and, in Indang, the right
TODA), and guides the trip along real roads. Success is a passenger getting a
real driver quickly and both sides always knowing where the other is and what
happens next.

## Positioning

Routing, place search, maps and the turn-by-turn route guide run on the phone
from an offline OpenStreetMap road graph and map; no routing or geocoding API is
called. Matching follows how tricycles actually operate locally: separate town
networks and, in Indang, TODA barangay zones.

## Operating Context

- Flat fare (₱45), paid in cash to the driver; up to 4 passengers per trike.
- Passenger flow: set pickup (GPS or map pin) and destination (offline search,
  map pick, shortcuts by town), see the road route and fare, book, wait for a
  driver, follow the driver, ride, arrive.
- Driver flow: go online with fresh GPS, receive a timed offer (20 s), accept or
  decline, navigate to pickup with the route guide, arrive, start, complete.
- Both roles open the app offline from a saved session; booking and live trips
  need internet, maps/search/routes/guide do not.
- Indang drivers registered with one of the 12 Indang TODAs only get trips
  inside their TODA's barangays; passengers never see TODA areas.

## Capabilities and Constraints

- Expo / React Native app (`com.indanggo.app`), MapLibre maps over OpenFreeMap
  tiles, offline map packs, offline road graph and places layer.
- Android standalone APK is the shipped pilot build; an iPhone build later
  reuses the same design.
- Phones are budget Android devices: keep rendering, memory and bundle cost low.
- Backend: Express + Socket.IO on Render, MongoDB Atlas.
- Language: the app must offer English and Filipino, switchable by the user.

## Brand Commitments

- Name: **IndangGO**.
- Brand colours: IndangGO's green and yellow stay (user-confirmed 2026-10-02).
- The route guide is explicitly Waze-style (tilted 3D follow camera, turn
  banner, ETA panel); the user named Waze and JoyRide as references for the
  app's map experience.

## Evidence on Hand

- Real map, road and place data for Indang and General Trias
  (`assets/routing`, `assets/places`, `assets/geo`).
- TODA list and zones from `TODAs_coordinates.xlsx`.
- No real ratings, reviews, ride counts, driver photos or testimonials exist;
  never fabricate them.

## Product Principles

1. The map is the product: whatever the screen, the user keeps sight of the map
   and their position on it.
2. Glanceable in the sun: one primary action at a time, readable at arm's
   length, reachable with one thumb.
3. Honest state: always show what is live, what is last known, and what needs
   internet; never invent positions, drivers or progress.
4. Works on the cheapest phone and the weakest signal.
5. Local first: town, barangay and TODA realities, in the user's language.

## Accessibility & Inclusion

- Large touch targets for one-handed, in-motion use; high contrast for direct
  sunlight.
- English and Filipino.
