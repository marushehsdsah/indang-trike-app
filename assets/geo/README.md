# Service area boundaries

The app serves Indang and General Trias. Both polygons are loaded together
(`data/indangMap.js`); each town is its own network of roads and drivers.

## Indang

`indang-municipality.json` contains the WGS 84 municipal polygon for Indang,
Cavite (PSGC `0402110000`). It was retrieved on 2026-09-22 from the Philippine
GeoRiskPH/ULAP PSA Municipal Boundary feature service:

https://ulap-nga.georisk.gov.ph/arcgis/rest/services/PSA/Municipal/MapServer/0

The app uses this polygon as an approximate service-area overlay and containment
check. It is not a cadastral or turn-by-turn routing dataset. Confirm the source
service's current terms and the boundary version before redistributing a
production dataset.

## General Trias

`general-trias-municipality.json` is the boundary of General Trias, Cavite
(PSGC `0402108000`). The GeoRiskPH
service above now requires a token, so this polygon comes from the
OpenStreetMap administrative boundary instead, relation
[1489187](https://www.openstreetmap.org/relation/1489187), snapshot
`2026-10-01T06:31:34Z`, retrieved on 2026-10-01 with Overpass
(`relation(1489187);out geom;`). Its 126 outer ways were joined into one ring
(3,314 points, counter-clockwise, six decimal places).

Map data © OpenStreetMap contributors, available under the Open Database
License (ODbL) 1.0.

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

`indang-todas.json` lists Indang's 12 TODAs and the barangays each may serve,
from `TODAs_coordinates.xlsx` at the repository root (COORDINATES and Notes
sheets). A TODA serves:

- the barangays the sheet names (e.g. PCHTI-TODA: Pulo, Carasuchi, Harasan,
  Tambo Ilaya; "POBLACION 1, 2, 3, 4" is Barangay 1–4), and
- the barangays holding one of its places marked "Matched" in the Notes sheet
  (e.g. BITODA's CvSU pin lies in Kaytapos).

Places marked only "Verify" (approximate pins) do not add a barangay; those
barangays are listed under each TODA's `review` for confirmation. Move one into
`barangays` to add it. Mahabangkahoy Lejos is the only barangay no TODA serves
(`uncovered`). Edit this file directly when a TODA's area changes; the app and
backend read it as is.

A driver whose TODA field names one of these TODAs (any spelling of its name or
an alias) is offered only trips whose pickup and destination are both inside its
barangays, and their map shows that area. Drivers of other TODAs (e.g. in General
Trias) keep the town-wide rules. Passengers see no TODA areas.
