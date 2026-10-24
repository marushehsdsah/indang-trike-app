# Service area boundaries

The app serves Indang only (`data/indangMap.js`). General Trias was removed
on 2026-10-19; its boundary file is in git history if it is ever needed again.

## Indang

`indang-municipality.json` contains the WGS 84 municipal polygon for Indang,
Cavite (PSGC `0402110000`). It was retrieved on 2026-09-22 from the Philippine
GeoRiskPH/ULAP PSA Municipal Boundary feature service:

https://ulap-nga.georisk.gov.ph/arcgis/rest/services/PSA/Municipal/MapServer/0

The app uses this polygon as an approximate service-area overlay and containment
check. It is not a cadastral or turn-by-turn routing dataset. Confirm the source
service's current terms and the boundary version before redistributing a
production dataset.

## Indang barangays

`indang-barangays.json` holds Indang's 36 barangays (name and 10-digit PSGC),
cut from the PSA barangay shapefile (PSGC as of 31 December 2023) published by
[altcoder/philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles)
(MIT), file `dist/PH_Adm4_BgySubMuns.shp.zip`, SHA-256
`904ff4ad2a8cfcfc06d23a6f4109bb1b142689d4cb4a8863d8bf650e99476186`, retrieved
2026-10-02. The source is UTM zone 51N; points were converted to WGS 84 and
rounded to six decimals. The 11 barangays OpenStreetMap also maps each fall in
the same-named barangay here. Along the town edge these polygons and
`indang-municipality.json` differ slightly, so `data/todaZones.js` puts a point
in such a gap in the nearest barangay within 300 m.

## Indang TODA zones

`indang-todas.json` lists Indang's 16 TODAs and the barangays each may serve,
from `TODAs_coordinates.xlsx` at the repository root (COORDINATES and Notes
sheets). A TODA serves:

- the barangays the sheet names (e.g. PCHTI-TODA: Pulo, Carasuchi, Harasan,
  Tambo Ilaya; "POBLACION 1, 2, 3, 4" is Barangay 1–4), and
- the barangays holding one of its places marked "Matched" in the Notes sheet,
  except where that place is listed under `stops` instead.

A stop is part of a barangay a TODA serves without the rest of it, always
inside the stop's `barangay`. It is a circle, `radiusMeters` around a pin; a
square, `sizeMeters` on each side, centred on a
pin, or, with `along`, a strip `depthMeters` deep along that barangay's whole
border with the `along` barangay, rounded past both ends of the border and cut
to the barangay's outline. BITODA serves
Bancod and the CvSU stop (400 m around the CvSU pin, inside Kaytapos), not the
rest of Kaytapos. BCITODA (formerly misspelled SITODAI, kept as an alias for
drivers saved under it) serves Banaba Cerca and two stops: Rehab, the strip
of Banaba Lejos along its border with Banaba Cerca, end to end, 320 m deep
(Rehab is 270 m from that border); and British Village, 300 m around the
Indang British Village pin, in Calumpang Lejos I. CIKTODA serves Kaytambog and
the Sagana Spring Resort stop: the strip of Banaba Cerca along its border with
Kaytambog, 330 m deep (Sagana is 277 m past the border's northern end), not the
rest of Banaba Cerca. DITTODA serves Daine I, Daine II, Lumampong Balagbag and
the Camp Elizabeth stop: the strip of Tambo Kulit along its border with
Lumampong Balagbag, 100 m deep (Camp Elizabeth is 23 m past it), not the rest
of Tambo Kulit; and the Dulong Bato and Buho stop: the strip of Lumampong
Halayhay along its border with Lumampong Balagbag, 740 m deep (Dulong Bato is
686 m and Buho 603 m from it), about half of Lumampong Halayhay, which GLITODA
also serves. The driver's map draws each stop's shape.

Places marked only "Verify" (approximate pins) do not add a barangay; those
barangays are listed under each TODA's `review` for confirmation. Move one into
`barangays` to add it. Edit this file directly when a TODA's area changes; the
app and backend read it as is.

The sheet's "ITODA PITODA" column is two TODAs since 2026-10-19: PITODA serves
only the Poblacion (Barangay 1–4) and ITODA all 36 barangays, so no barangay is
left without a TODA (`uncovered` is empty). A TODA listing every barangay serves
all of Indang: its drivers keep the town-wide rules and their map draws no zone.
"ITODA PITODA" is an alias of ITODA, so drivers saved under that name are
ITODA, and the backend shows them as ITODA.

KITODA serves Kayquit I, II and III and the Ikloy River stop: a 350 m square
(`sizeMeters`) centred on its pin, in Kaytambog, 306 m past the Kayquit II
border. The pin is approximate and the same as CIKTODA's Ikloy; the square
also takes in CIKTODA's Class Villas. A strip along that border would have
taken a third of Kaytambog, CIKTODA's barangay hall included. BERAS FARM and
BICOL REGOIN have no pins; the KITODA list places them in the Ikloy River area,
so they are listed under that stop's `places`.

MACITODA serves Calumpang Cerca, Agus-us and Calumpang Lejos I, and the
Macalima stop: a 350 m square around its pin in Banaba Cerca, 1.36 km from
MACITODA's barangays. The pin is approximate (Google's pin for Macalima
Private Resort is imprecise) and the same as DITTODA's Tamak; move the square
when the real pin is known.

ALITODA serves Alulod and Limbon. PHILMALAY (a pin in Banaba Cerca, about
1.4 km away) was removed from its list on 2026-10-20. Its PANGIL pin is Barangay Pangil, Amadeo, about 190 m past the town edge
beside Limbon. The zone check counts it as Limbon, but it is outside Indang's
service area, so it cannot be booked; Pangil Bridge on the Indang side
(14.20083, 120.90017, Limbon) can.

GLITODA and TBKTODA were one entry ("GLITODA TBKTODA") until 2026-10-20; they
do not share a route. GLITODA serves Guyam Malaki, Guyam Munti and Lumampong
Halayhay, plus three stops: Balwarte Gwapo (a 130 m strip of Harasan along its
border with Guyam Malaki; the pin is 77 m into Harasan), Old Cemetery and Roman
Garden (120 m, in Barangay 3) and Lumampong National High School (120 m, in
Barangay 4). TBKTODA serves Tambo Kulit and Tambo Balagbag. A driver saved
under the combined name matches neither and keeps the town-wide rules until
they pick one.

Banaba Lejos's TODA is BLI-TODA, as the sheet names it; it was listed here as
BIPTODA until 2026-10-20, which stays an alias. Its POULTRY (Maragondon) and
MALAINEN (Malainen Luma, Naic) pins lie outside Indang, which the app does not
serve, and JARO and GLORY MOORE have no pins, so its area is Banaba Lejos only.

KAYITODA and BMLITODA were added on 2026-10-24 from the sheet's last two
columns. KAYITODA serves Kaytapos, so CvSU is both its and BITODA's.
BMLITODA serves Mahabangkahoy Lejos: its BALAGBAG MAHABANG KAHOY pin is the
same as ITODA's (Mahabang Kahoy Lejos Barangay Hall), and its drivers' addresses
on its 2026 franchise list are Mahabangkahoy Lejos ("Ma. Kahoy Lejos" or
"Bal. Ma. Kahoy").

A driver whose TODA field names one of these TODAs (any spelling of its name or
an alias) is offered only trips whose pickup is inside its barangays, and their
map shows that area; the destination may be anywhere in Indang. Drivers of
other TODAs keep the town-wide rules. Passengers see no TODA areas.
