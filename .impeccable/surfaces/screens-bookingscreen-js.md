---
version: 1
slug: "screens-bookingscreen-js"
primary_target: "screens/BookingScreen.js"
related_targets: ["screens/DriverScreen.js","screens/ActiveRideScreen.js","screens/SearchingScreen.js","screens/NavigationScreen.js"]
---

# Map screens: passenger and driver

Scope: every map screen of the IndangGO app (passenger home/booking, searching,
active ride, route guide, driver home) plus the plain screens around them
(splash, login, register, history, profile). Mode: Operate.

Audience and job: passengers book a ₱45 flat-fare tricycle and follow their
driver; TODA drivers go online, take a 20 s offer, and run the trip. Both glance
at the phone outdoors, one-handed or mounted, on budget Android phones, often
offline. Constraints: no drag sheets over maps; English and Filipino on every
screen; Material navigation and system Back.

User-pinned: Waze- and JoyRide-inspired, floating cards instead of the bottom
sheet (the sheet covered too much map, overlapped map buttons, jumped between
states, and fought scrolling), keep IndangGO green and yellow, remove AI slop.

## Direction contract

THESIS: The map owns the whole screen; each trip stage is one small detached
card that never drags, never scrolls with the map, and keeps its height while
its content changes. Refuses the category default: a grabber sheet that grows
over the map with stacked tinted icon tiles and tracked caps labels.

OWN-WORLD: IndangGO green (#095C37) shell for live states and the turn banner,
for-hire plate yellow (#FFD700) for the one action that books or accepts a
trip, white cards at 24 dp radius floating 12 dp off the edges, Fredoka
rounded semibold/bold for headings, ETA and fare numerals, Roboto for body.
Map buttons are 48 dp white discs stacked in a rail directly above the card.

STORY: The rider sees where they are and which town they are in, taps
"Where to?", sees minutes and ₱45 on one card, books with the yellow button,
then watches a driver whose plate is shown as the yellow for-hire plate they
will look for on the street. The driver sees online/offline as a colour, gets
an offer card whose yellow bar drains over 20 s, and runs each stage with one
big button.

FIRST VIEWPORT: Passenger home: full-bleed map; top-left a status pill (green
"In Indang · live GPS", yellow waiting, red outside/problem, ink offline); a
48 dp locate disc right-aligned above the bottom card; bottom card 12 dp off
the edges holding a 56 dp "Where to?" field and one row of town shortcut and
recent-ride chips; Material navigation bar (Home, Rides, Profile) below.

FORM: Waze floating-card map shell with JoyRide booking content (upfront fare,
note to driver, plate and ETA on the matched driver). Pinned by the user, so no
concept roll was run; seed key: none (user-pinned direction).

Signature move: the yellow for-hire plate. The driver's plate and TODA are set
as a PH for-hire plate (yellow, black rounded numerals) wherever a passenger
must recognise the vehicle, and the same yellow drains across the driver's
offer card as the 20 s countdown.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Filipino copy is written by the build and needs a native-speaker pass.
- Server error messages arrive in English.
