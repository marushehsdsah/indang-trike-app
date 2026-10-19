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

`indang-todas.json` lists Indang's 13 TODAs and the barangays each may serve,
from `TODAs_coordinates.xlsx` at the repository root (COORDINATES and Notes
sheets). A TODA serves:

- the barangays the sheet names (e.g. PCHTI-TODA: Pulo, Carasuchi, Harasan,
  Tambo Ilaya; "POBLACION 1, 2, 3, 4" is Barangay 1–4), and
- the barangays holding one of its places marked "Matched" in the Notes sheet
  (e.g. BITODA's CvSU pin lies in Kaytapos).

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

A driver whose TODA field names one of these TODAs (any spelling of its name or
an alias) is offered only trips whose pickup and destination are both inside its
barangays, and their map shows that area. Drivers of other TODAs keep the
town-wide rules. Passengers see no TODA areas.
