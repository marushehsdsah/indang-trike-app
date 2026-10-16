# Indang tricycle fares

`indang-fares.json` is the taripa from `TODAs_coordinates (1).xlsx`:

- sheet **2**: Municipal Ordinance No. 267 s. 2023, Section 1 (day/night,
  night differential, special trip) and Section 2 (fares per trip from the
  Poblacion, the Palengke sub-terminal, and the Buna Cerca junction);
- sheet **TARIPA**: the Bancod TODA (BITODA) fares per purok, per passenger
  (regular, special, student/senior) by day and by night, and its notes.

`data/fares.js` turns it into a quote. The server (`indang-trike-backend/policy.js`)
recomputes every booking's fare with its own clock; the app's quote is a preview.

How a trip is priced:

- **Special** (the whole trike): the listed fare covers two passengers; each
  further passenger is ₱15. No student/senior/PWD discount.
- **Regular** (per passenger): only where TARIPA lists it, between the Bancod
  puroks and the Poblacion or the CvSU gate. 20% off with a student, senior or
  PWD ID (TARIPA's own column).
- Both stops in the Poblacion: ₱30 by day, ₱35 at night.
- One stop in the Poblacion: the other stop's listed fare (from the Palengke
  table when the pickup is at the Palengke sub-terminal).
- Neither stop in the Poblacion: the listed fare of the stop farther from the
  town plaza.
- Night is 9:00 PM to 4:00 AM, Philippine time.
- When a barangay has several listed areas (Alulod's Bukana, School, Dulo…),
  the rider picks one; the booking is refused until they do.
- General Trias has no taripa in the file yet: ₱45 flat (`FLAT_FARE`).

`review` in the JSON lists every place where the sheets disagree or a point had
to be placed by judgment. Confirm those with the TODAs and update the file.
