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
