# Service area boundary

The app serves Indang. Its polygon is loaded by `data/indangMap.js`.

## Indang

`indang-municipality.json` contains the WGS 84 municipal polygon for Indang,
Cavite (PSGC `0402110000`). It was retrieved on 2026-09-22 from the Philippine
GeoRiskPH/ULAP PSA Municipal Boundary feature service:

https://ulap-nga.georisk.gov.ph/arcgis/rest/services/PSA/Municipal/MapServer/0

The app uses this polygon as an approximate service-area overlay and containment
check. It is not a cadastral or turn-by-turn routing dataset. Confirm the source
service's current terms and the boundary version before redistributing a
production dataset.

General Trias was served from 2026-10-01 and removed on 2026-10-14. Its
boundary file was deleted then.
