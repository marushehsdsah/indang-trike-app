# Indang offline road graph

`indang-road-graph.json` is the road network the app routes on. Booking, search,
snapping, and A* routing read only this file; the app never calls a routing or
geocoding API at runtime.

Map data © OpenStreetMap contributors. The graph is a derived database of
OpenStreetMap data and is available under the Open Database License (ODbL)
1.0. See https://www.openstreetmap.org/copyright for the licence and
attribution requirements. The app shows `© OpenStreetMap contributors`, linked
to that page, on every map that draws this data.

## Snapshot

| Field | Value |
| --- | --- |
| Source | OpenStreetMap via the Overpass API (`https://overpass-api.de/api/interpreter`) |
| Snapshot timestamp (`osm3s.timestamp_osm_base`) | `2026-09-22T08:45:51Z` |
| Bounding box (south, west, north, east) | `14.120982, 120.810720, 14.246597, 120.929805` |
| Clip polygon | `assets/geo/indang-municipality.json` (PSGC `0402110000`) |
| Raw snapshot SHA-256 | `494dc38f07e11cd1ed1027ddf39a3912f1ece34bf261381f7bdac548755c7029` |

The bounding box is the extent of the municipal polygon. The raw Overpass
response is a build input and is not committed; the generated graph is.

## Graph statistics

| Nodes | Directed edges | Places | Bytes |
| ---: | ---: | ---: | ---: |
| 11,380 | 23,222 | 458 | 2,411,057 |

Of the 11,380 nodes, 11,230 form one connected road network (ignoring one-way
direction). The remaining 150 nodes are 12 small isolated fragments, mostly
service roads whose connections lie outside the municipality or are unmapped.
A point that snaps to one of those fragments gets the "No drivable route
found" state.

## Performance verification

Measurements below are from a representative run on 2026-09-22 under Node
22.22.1 in WSL2 (11th Gen Intel Core i5-11400F, 12 logical CPUs). Android UI
verification uses the `sdk_gphone16k_x86_64` Android emulator. Route timings
are the median of five runs after one warm-up; the search timing covers 20
representative queries. Run `node tests/roadGraphData.test.js` to repeat the
same checks and enforce their budgets.

| Check | Measured | Budget |
| --- | ---: | ---: |
| Graph validation / initialization | 51.2 ms | < 500 ms |
| CvSU Main Campus → Harasan default A* route | 14.3 ms (4.7 ms after 2026-09-23) | < 150 ms |
| Northwest → southeast graph-bounds A* route | 18.8 ms (5.1 ms after 2026-09-23) | < 150 ms |
| 20 local place searches | 13.9 ms total (0.7 ms average) | < 1,000 ms total |

The graph-bounds case routes from the northwest bound to the southeast bound,
which snap to opposite sides of the common connected road network.

Node's JIT hides costs that dominate on a phone: Hermes interprets bytecode.
Measured inside Hermes on the Android emulator (25 random node pairs), the
original object-based A* took a 48.8 ms median and 104.8 ms p90. On
2026-09-23 A* moved to a typed-array copy of the graph (`compileGraph` in
`utils/pathfinding.js`, built once per session, 60 ms in Hermes) and a
typed-array heap: 22.2 ms median, 47.6 ms p90, with identical routes (checked
on 500 random pairs, including Dijkstra mode). `data/roadNetwork.js` loads,
validates, and compiles the graph once, and the home screen warms it while
idle so the first booking route does not pay for it.

## Overpass query

```overpass
[out:json][timeout:180];
(
  way["highway"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["amenity"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["place"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["shop"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["tourism"](14.120982,120.810720,14.246597,120.929805);
  nwr["name"]["public_transport"](14.120982,120.810720,14.246597,120.929805);
);
(._;>;);
out body;
```

## Rebuild

Save the query above as `/tmp/indang-overpass.query`, then run from the
repository root:

```bash
curl --fail --retry 3 -A "IndangGO-road-graph-builder/1.0" \
  --data-urlencode data@/tmp/indang-overpass.query \
  https://overpass-api.de/api/interpreter --output /tmp/indang-overpass.json
node scripts/build-road-graph.js --input /tmp/indang-overpass.json \
  --output assets/routing/indang-road-graph.json
npm test
```

Overpass rejects requests without a `User-Agent` header (HTTP 406), so keep the
`-A` option. The builder prints the node, edge, place, byte, and snapshot
timestamp counts; copy them into the tables above. A new snapshot changes the
graph, so update this README and re-run the tests whenever you rebuild.

## Transformation

`scripts/build-road-graph.js` applies these rules, shared with the app through
`utils/roadRules.js`:

1. Keeps `highway` classes a tricycle can drive: `primary`, `secondary`,
   `tertiary` (and their `_link` roads), `residential`, `unclassified`,
   `living_street`, and `service`. Tracks, paths, footways, steps, and roads
   under construction or proposed are dropped.
2. Drops ways whose most specific motor access tag (`motor_vehicle`, then
   `vehicle`, then `access`) is `no` or `private`, and `oneway=reversible`
   ways, whose direction changes by time of day.
3. Creates directed edges between adjacent way nodes. `oneway=yes|1|true`,
   `junction=roundabout`, and `junction=circular` allow travel only in way
   order; `oneway=-1` allows travel only against it.
4. Keeps only segments whose two nodes lie inside the municipal polygon.
5. Merges distinct nodes that share an exact coordinate into the lowest node ID
   and skips zero-length segments, so duplicated OSM nodes never break a road.
6. Measures each edge with the Haversine formula (metres, 0.1 m precision) and
   estimates travel seconds from `maxspeed` (clamped to 5–60 km/h) or from this
   table, rounding seconds up to 0.1 s:

   | Class | km/h | Class | km/h |
   | --- | ---: | --- | ---: |
   | primary | 35 | residential | 20 |
   | primary_link | 25 | unclassified | 18 |
   | secondary | 30 | living_street | 10 |
   | secondary_link | 22 | service | 12 |
   | tertiary | 25 | | |
   | tertiary_link | 20 | | |

7. Records `metadata.maxSpeedKph` as the fastest speed any stored edge implies,
   so the A* heuristic (straight-line distance divided by that speed) never
   overestimates.
8. Indexes nodes in 0.005° grid cells (`"<floor(lat/0.005)>:<floor(lon/0.005)>"`)
   for nearest-road snapping.
9. Extracts named places tagged `amenity`, `shop`, `tourism`,
   `public_transport`, or `place` (area and relation centroids), plus one
   on-road point per named routable road, all inside the polygon.

Node coordinates are rounded to six decimal places (about 0.1 m). Output is
deterministic: the same snapshot always produces byte-identical JSON.

## Android launch from WSL2

The backend and Metro run inside WSL2 while the Android emulator and ADB run on
Windows. Reverse both required ports before starting the app:

```bash
ADB_EXE='/mnt/c/Users/Michael D. Valledor/AppData/Local/Android/Sdk/platform-tools/adb.exe'
"$ADB_EXE" reverse tcp:8081 tcp:8081
"$ADB_EXE" reverse tcp:3000 tcp:3000
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 \
  ANDROID_HOME=/tmp/indang-android-sdk \
  PATH=/tmp/indang-android-sdk/platform-tools:$PATH \
  ./start.sh --android --localhost
```

If Expo advertises the Docker bridge instead of WSL's `eth0` address, get the
current WSL address and open that Expo URL explicitly in Expo Go:

```bash
WSL_ETH0_ADDRESS=$(ip -4 addr show eth0 | awk '/inet / { sub(/\/.*/, "", $2); print $2; exit }')
"$ADB_EXE" shell am start -a android.intent.action.VIEW \
  -d "exp://$WSL_ETH0_ADDRESS:8081" host.exp.exponent
```

Keep the `--localhost` flag: ADB reverse makes the API at port 3000 and Metro
at port 8081 reachable from the emulator even though the explicit Expo deep
link uses WSL's current address to work around incorrect host selection.
