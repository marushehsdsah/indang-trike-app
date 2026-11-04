# Indang tricycle fares

`indang-fares.json` is the taripa from `TODAs_coordinates (1).xlsx`:

- sheet **2**: Municipal Ordinance No. 267 s. 2023, Section 1 (day/night,
  night differential, special trip) and Section 2 (fares per trip from the
  Poblacion, the Palengke sub-terminal, and the Buna Cerca junction);
- sheet **TARIPA**: the Bancod TODA (BITODA) fares per purok, per passenger
  (regular, special, student/senior) by day and by night, and its notes.

`data/fares.js` turns it into a quote. The server (`indang-trike-backend/policy.js`)
recomputes every booking's fare with its own clock; the app's quote is a preview.

When the fares change, an admin changes the amounts in God view's **Fares**
tab (`docs/god-view.md`). Those amounts are saved in the database and take the
place of this file's for every new booking; this file stays as the taripa
they are compared with. Only amounts change there: to add or move an area,
edit this file.

How a trip is priced:

- **Special** (the whole trike) is the only trip the app books: the listed
  fare covers two passengers; each further passenger is ₱15. No
  student/senior/PWD discount. TARIPA's regular per-passenger fares (Bancod)
  stay in the data but are not offered.
- Both stops in the Poblacion: ₱30 by day, ₱35 at night.
- One stop in the Poblacion: the other stop's listed fare (from the Palengke
  table when the pickup is at the Palengke sub-terminal).
- Neither stop in the Poblacion: priced by the barangays the road route
  crosses. Where the route comes nearest the town plaza, each stop whose leg
  leaves its own barangay (or reaches the Poblacion) pays its listed fare, and
  the fares are added together. A trip through the town from Alulod (₱35) to
  Pulo (₱75) is ₱110; end to end of Indang, Mahabang Kahoy Balagbag (₱110) to
  Calumpang Lejos (₱50) is ₱160. A trip within one barangay, or out along one
  road (Alulod to Banaba), pays the farther stop's fare.
- Night is 9:00 PM to 4:00 AM, Philippine time.
- When a barangay has several listed areas (Alulod's Bukana, School, Dulo…),
  the stop's straight-line distance from the town plaza decides, not the
  rider. The taripa names the areas but not where they are, and a barangay's
  far parts cost more than its near ones, so its reach from the plaza (nearest
  to farthest outline point) is split into equal bands: the cheapest area
  nearest the town, the dearest farthest out (`resolveArea` in data/fares.js).
- A stop the taripa lists no area for is priced ₱45 flat (`FLAT_FARE`).

`review` in the JSON lists every place where the sheets disagree or a point had
to be placed by judgment. Confirm those with the TODAs and update the file.
