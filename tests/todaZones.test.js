const test = require('node:test');
const assert = require('node:assert/strict');
const todaData = require('../assets/geo/indang-todas.json');
const { BARANGAY_NAMES, TODA_NAMES, findToda, getBarangayAt, getTodaZoneShape, todaCovers, todaName } = require('../data/todaZones');
const { createMapPolygons, isCoordinateInPolygons } = require('../utils/geojson');

const at = (latitude, longitude) => ({ latitude, longitude });
// Whether every point is in the TODA's area, where its drivers may pick up.
const inArea = (toda, ...points) => points.every((point) => todaCovers(toda, point));
// Pins from TODAs_coordinates.xlsx.
const PULO = at(14.16990, 120.87269), HARASAN = at(14.16053, 120.87006), CARASUCHI = at(14.14694, 120.88147);
const POBLACION = at(14.19558, 120.87956), BANCOD = at(14.21894, 120.87430);

test('Indang has 36 barangays and every TODA lists only real ones', () => {
  assert.equal(BARANGAY_NAMES.length, 36);
  assert.equal(TODA_NAMES.length, 16);
  for (const toda of todaData.todas) {
    for (const barangay of [...toda.barangays, ...toda.review.map((item) => item.barangay)]) assert.ok(BARANGAY_NAMES.includes(barangay), `${toda.name}: ${barangay}`);
  }
  assert.deepEqual(todaData.uncovered, [], 'ITODA serves every barangay');
  // A stop's pin in another barangay would leave nothing of it to draw.
  for (const toda of TODA_NAMES.map(findToda)) {
    for (const stop of toda.stops.filter(({ along }) => !along)) assert.equal(getBarangayAt(stop), stop.barangay, `${toda.name}: ${stop.name}`);
  }
});

test('no two TODAs share a name or alias', () => {
  const keys = todaData.todas.flatMap((toda) => [toda.name, ...toda.aliases].map((name) => name.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  assert.equal(new Set(keys).size, keys.length);
});

test('PITODA serves only the Poblacion and ITODA all of Indang', () => {
  const pitoda = findToda('PITODA'), itoda = findToda('ITODA');
  assert.deepEqual(pitoda.barangays, ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4']);
  assert.equal(pitoda.wholeTown, false);
  assert.equal(inArea(pitoda, POBLACION), true);
  assert.equal(inArea(pitoda, BANCOD), false, 'Bancod is outside the Poblacion');
  assert.equal(inArea(pitoda, PULO), false, 'Pulo is outside the Poblacion');
  assert.deepEqual(getTodaZoneShape(pitoda).features.map((feature) => feature.properties.name).sort(), ['Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4']);
  assert.deepEqual([...itoda.barangays].sort(), [...BARANGAY_NAMES].sort());
  assert.equal(itoda.wholeTown, true);
  assert.equal(inArea(itoda, PULO, BANCOD), true);
  assert.equal(inArea(itoda, CARASUCHI, POBLACION), true);
  assert.equal(TODA_NAMES.filter((name) => findToda(name).wholeTown).join(), 'ITODA', 'the only whole-town TODA');
});

test('drivers saved under the former "ITODA PITODA" are ITODA', () => {
  assert.equal(findToda('ITODA PITODA').name, 'ITODA');
  assert.equal(findToda('itoda-pitoda').name, 'ITODA');
  assert.equal(todaName('ITODA PITODA'), 'ITODA');
  assert.equal(todaName('pitoda'), 'PITODA');
  assert.equal(todaName('Test TODA'), 'Test TODA', 'any other TODA keeps its saved text');
  assert.equal(todaName(undefined), undefined);
});

test('PCHTI-TODA serves only Pulo, Carasuchi, Harasan and Tambo Ilaya', () => {
  const pchti = findToda('PCHTI-TODA');
  assert.deepEqual(pchti.barangays, ['Pulo', 'Carasuchi', 'Harasan', 'Tambo Ilaya']);
  assert.equal(inArea(pchti, PULO, HARASAN), true);
  assert.equal(inArea(pchti, CARASUCHI, PULO), true);
  assert.equal(inArea(pchti, POBLACION), false, 'the Poblacion is outside its barangays');
  assert.equal(inArea(pchti, BANCOD), false, 'Bancod is outside its barangays');
  assert.deepEqual(getTodaZoneShape(pchti).features.map((feature) => feature.properties.name).sort(), ['Carasuchi', 'Harasan', 'Pulo', 'Tambo Ilaya']);
});

test('BITODA serves Bancod and CvSU only, not the rest of Kaytapos or the unverified Sitio Quarry pin in Alulod', () => {
  const bitoda = findToda('BITODA');
  const CVSU = at(14.19782, 120.88149), LIBRARY = at(14.1994, 120.8823), CAMBIE = at(14.2214861, 120.8764213);
  const SITIO_QUARRY = at(14.20358, 120.89152), KAYTAPOS_AWAY = at(14.196, 120.888);
  assert.deepEqual(bitoda.barangays, ['Bancod']);
  assert.deepEqual(bitoda.areas, ['Bancod', 'CvSU']);
  assert.equal(getBarangayAt(KAYTAPOS_AWAY), 'Kaytapos');
  assert.equal(inArea(bitoda, BANCOD, CVSU), true);
  assert.equal(inArea(bitoda, LIBRARY, BANCOD), true, 'inside the campus');
  assert.equal(inArea(bitoda, CAMBIE, BANCOD), true);
  assert.equal(inArea(bitoda, BANCOD, KAYTAPOS_AWAY), false, 'Kaytapos away from CvSU');
  assert.equal(inArea(bitoda, CVSU, POBLACION), false, 'the Poblacion next to CvSU');
  assert.equal(inArea(bitoda, BANCOD, SITIO_QUARRY), false, 'Alulod is under review');
  assert.deepEqual(getTodaZoneShape(bitoda).features.map((feature) => feature.properties.name), ['Bancod', 'CvSU']);
});

test('the driver map draws a stop only inside its own barangay, where it counts', () => {
  const bitoda = findToda('BITODA');
  const CVSU = at(14.19782, 120.88149), LIBRARY = at(14.1994, 120.8823);
  const shape = (name) => createMapPolygons({ type: 'FeatureCollection', features: getTodaZoneShape(bitoda).features.filter((feature) => feature.properties.name === name) });
  assert.equal(isCoordinateInPolygons(CVSU, shape('CvSU')), true);
  assert.equal(isCoordinateInPolygons(LIBRARY, shape('CvSU')), true);
  // The Poblacion pin is about 330 m from CvSU, inside the 400 m circle.
  assert.equal(isCoordinateInPolygons(POBLACION, shape('CvSU')), false, 'the Poblacion part of the circle');
  assert.equal(inArea(bitoda, POBLACION, BANCOD), false);
});

test('BCITODA serves Banaba Cerca, the strip of Banaba Lejos along their border up to Rehab, and British Village', () => {
  const bcitoda = findToda('BCITODA');
  // Drivers saved under the misspelled "SITODAI" are BCITODA.
  assert.equal(findToda('SITODAI'), bcitoda);
  assert.equal(todaName('SITODAI'), 'BCITODA');
  assert.equal(TODA_NAMES.includes('SITODAI'), false);
  const BANABA_CERCA = at(14.21434, 120.85302), CERCA_GARDEN = at(14.21818, 120.84664), REHAB = at(14.22466, 120.84297);
  const PAST_BORDER = at(14.2229, 120.8441), PAST_REHAB = at(14.2272, 120.8410), HARAYA_FARM = at(14.22837, 120.83528);
  const BRITISH = at(14.23255, 120.85241), WEST_END = at(14.2200, 120.8380), EAST_END = at(14.2268, 120.8500);
  assert.equal(inArea(bcitoda, WEST_END, EAST_END), true, 'both ends of the Banaba Cerca border');
  assert.equal(getTodaZoneShape(bcitoda).features.find((feature) => feature.properties.name === 'Rehab').geometry.coordinates[0].length > 4, true);
  assert.deepEqual(bcitoda.areas, ['Banaba Cerca', 'Rehab', 'British Village']);
  assert.equal(inArea(bcitoda, BANABA_CERCA, CERCA_GARDEN), true);
  assert.equal(getBarangayAt(REHAB), 'Banaba Lejos');
  assert.equal(inArea(bcitoda, REHAB, BANABA_CERCA), true);
  assert.equal(getBarangayAt(PAST_BORDER), 'Banaba Lejos');
  assert.equal(inArea(bcitoda, PAST_BORDER, BANABA_CERCA), true, 'between the Banaba Cerca border and Rehab');
  assert.equal(getBarangayAt(PAST_REHAB), 'Banaba Lejos');
  assert.equal(inArea(bcitoda, BANABA_CERCA, PAST_REHAB), false, 'Banaba Lejos past Rehab');
  assert.equal(inArea(bcitoda, BANABA_CERCA, HARAYA_FARM), false);
  assert.equal(getBarangayAt(BRITISH), 'Calumpang Lejos I');
  assert.equal(inArea(bcitoda, BANABA_CERCA, BRITISH), true);
});

test('CIKTODA serves Kaytambog and the edge of Banaba Cerca by Sagana Spring Resort, not the rest of Banaba Cerca', () => {
  const ciktoda = findToda('CIKTODA');
  const KAYTAMBOG = at(14.19066, 120.86770), EJ_GARAGE = at(14.17418, 120.87445), SAGANA = at(14.19734, 120.86507);
  const BANABA_CERCA = at(14.21434, 120.85302), CALIFORNIA_BREEZE = at(14.20590, 120.86090);
  assert.deepEqual(ciktoda.areas, ['Kaytambog', 'Sagana Spring Resort']);
  assert.equal(inArea(ciktoda, KAYTAMBOG, EJ_GARAGE), true);
  assert.equal(getBarangayAt(SAGANA), 'Banaba Cerca');
  assert.equal(inArea(ciktoda, KAYTAMBOG, SAGANA), true);
  assert.equal(inArea(ciktoda, KAYTAMBOG, BANABA_CERCA), false, 'Banaba Cerca is BCITODA');
  assert.equal(inArea(ciktoda, CALIFORNIA_BREEZE, KAYTAMBOG), false);
});

test('DITTODA serves Daine I and II, Lumampong Balagbag, the edge of Tambo Kulit by Camp Elizabeth and of Lumampong Halayhay to Dulong Bato', () => {
  const dittoda = findToda('DITTODA');
  const LUMAMPONG_BALAGBAG = at(14.17397, 120.84986), SADATI_FOREST = at(14.19201, 120.83559), CAMP_ELIZABETH = at(14.17751, 120.85466);
  const TAMBO_KULIT = at(14.17709, 120.85994), BUHO = at(14.1670, 120.8650);
  assert.deepEqual(dittoda.areas, ['Daine I', 'Daine II', 'Lumampong Balagbag', 'Camp Elizabeth', 'Dulong Bato and Buho']);
  assert.equal(inArea(dittoda, LUMAMPONG_BALAGBAG, SADATI_FOREST), true);
  assert.equal(getBarangayAt(CAMP_ELIZABETH), 'Tambo Kulit');
  assert.equal(inArea(dittoda, LUMAMPONG_BALAGBAG, CAMP_ELIZABETH), true);
  assert.equal(inArea(dittoda, LUMAMPONG_BALAGBAG, TAMBO_KULIT), false, 'the rest of Tambo Kulit is TBKTODA');
  assert.equal(getBarangayAt(BUHO), 'Lumampong Halayhay');
  assert.equal(inArea(dittoda, LUMAMPONG_BALAGBAG, BUHO), true);
  assert.equal(inArea(dittoda, at(14.1612, 120.8554), LUMAMPONG_BALAGBAG), true, 'Dulong Bato');
  assert.equal(inArea(dittoda, at(14.1540, 120.8520), LUMAMPONG_BALAGBAG), false, 'Lumampong Halayhay past Dulong Bato');
});

test('BLI-TODA serves Banaba Lejos, and drivers saved as BIPTODA are BLI-TODA', () => {
  const bliToda = findToda('BLI-TODA');
  const BANABA_LEJOS = at(14.23161, 120.83317), MRF = at(14.2387325, 120.8318673), BIYAYA_FARM = at(14.23340, 120.83694);
  const MALAINEN = at(14.27061, 120.79192);
  assert.deepEqual(bliToda.areas, ['Banaba Lejos']);
  assert.equal(findToda('bli toda').name, 'BLI-TODA');
  assert.equal(todaName('BIPTODA'), 'BLI-TODA');
  assert.equal(inArea(bliToda, BANABA_LEJOS, MRF), true);
  assert.equal(inArea(bliToda, BIYAYA_FARM, BANABA_LEJOS), true);
  assert.equal(getBarangayAt(MALAINEN), null, 'Malainen Luma is in Naic, outside Indang');
});

test('GLITODA and TBKTODA are separate TODAs with their own areas', () => {
  const glitoda = findToda('GLITODA'), tbktoda = findToda('TBKTODA');
  const GUYAM_MALAKI = at(14.14341, 120.86999), ALTA_RIOS = at(14.16775, 120.86263), BALWARTE_GWAPO = at(14.15574, 120.86784);
  const OLD_CEMETERY = at(14.199293, 120.8751305), ROMAN_GARDEN = at(14.19983, 120.87527), LUMAMPONG_NATIONAL = at(14.20007, 120.87370);
  const TAMBO_KULIT = at(14.17709, 120.85994), TAMBO_BALAGBAG = at(14.18715, 120.85277), HARASAN = at(14.16053, 120.87006);
  assert.deepEqual(glitoda.barangays, ['Guyam Malaki', 'Guyam Munti', 'Lumampong Halayhay']);
  assert.deepEqual(tbktoda.barangays, ['Tambo Kulit', 'Tambo Balagbag']);
  assert.equal(inArea(glitoda, GUYAM_MALAKI, ALTA_RIOS), true);
  assert.equal(getBarangayAt(BALWARTE_GWAPO), 'Harasan');
  assert.equal(inArea(glitoda, GUYAM_MALAKI, BALWARTE_GWAPO), true);
  assert.equal(inArea(glitoda, GUYAM_MALAKI, HARASAN), false, 'the rest of Harasan is PCHTI-TODA');
  assert.equal(inArea(glitoda, GUYAM_MALAKI, OLD_CEMETERY), true);
  assert.equal(inArea(glitoda, ROMAN_GARDEN, LUMAMPONG_NATIONAL), true);
  assert.equal(inArea(glitoda, GUYAM_MALAKI, POBLACION), false, 'the rest of the Poblacion');
  assert.equal(inArea(glitoda, GUYAM_MALAKI, TAMBO_KULIT), false);
  assert.equal(inArea(tbktoda, TAMBO_KULIT, TAMBO_BALAGBAG), true);
  assert.equal(inArea(tbktoda, TAMBO_KULIT, GUYAM_MALAKI), false);
  assert.equal(findToda('GLITODA TBKTODA'), null, 'the combined name is gone');
});

test('KITODA serves Kayquit I, II and III and Ikloy River, not the rest of Kaytambog', () => {
  const kitoda = findToda('KITODA');
  const KAYQUIT_1 = at(14.17760, 120.88285), KAYQUIT_2 = at(14.18198, 120.88003), MUZON = at(14.1448499, 120.8971981);
  const IKLOY_RIVER = at(14.18372, 120.87093), THE_RAVINE = at(14.18889, 120.86855), KAYTAMBOG = at(14.19066, 120.86770);
  assert.deepEqual(kitoda.areas, ['Kayquit I', 'Kayquit II', 'Kayquit III', 'Ikloy River']);
  assert.deepEqual(kitoda.stops[0].places, ['IKLOY RIVER', 'BERAS FARM', 'BICOL REGOIN'], 'Beras Farm and Bicol Region are by Ikloy River');
  assert.equal(inArea(kitoda, KAYQUIT_1, KAYQUIT_2), true);
  assert.equal(inArea(kitoda, MUZON, KAYQUIT_1), true, 'Muzon (Asis) on the Kayquit III border');
  assert.equal(getBarangayAt(IKLOY_RIVER), 'Kaytambog');
  assert.equal(inArea(kitoda, KAYQUIT_2, IKLOY_RIVER), true);
  assert.equal(inArea(kitoda, KAYQUIT_2, at(14.18372 + 0.0015, 120.87093 + 0.0015)), true, 'a corner of the 350 m square');
  assert.equal(inArea(kitoda, KAYQUIT_2, at(14.18372 + 0.0018, 120.87093)), false, 'just past the square');
  assert.equal(inArea(kitoda, KAYQUIT_2, THE_RAVINE), false, 'Kaytambog is CIKTODA');
  assert.equal(inArea(kitoda, KAYQUIT_2, KAYTAMBOG), false);
});

test('MACITODA serves Calumpang Cerca, Agus-us, Calumpang Lejos I and a 350 m square around Macalima', () => {
  const macitoda = findToda('MACITODA');
  const CALUMPANG_CERCA = at(14.21253, 120.86611), FAMIGLIA_FELICE = at(14.2049703, 120.8674365), TRIO_AS_FARM = at(14.22557, 120.86664);
  const EL_HERENCIA = at(14.22879, 120.85653), MRP = at(14.23868, 120.84330), BRITISH_VILLAGE = at(14.23255, 120.85241);
  const MACALIMA = at(14.19204, 120.87286);
  assert.deepEqual(macitoda.areas, ['Calumpang Cerca', 'Agus-us', 'Calumpang Lejos I', 'Macalima']);
  assert.equal(inArea(macitoda, CALUMPANG_CERCA, FAMIGLIA_FELICE), true);
  assert.equal(inArea(macitoda, TRIO_AS_FARM, EL_HERENCIA), true);
  assert.equal(inArea(macitoda, MRP, BRITISH_VILLAGE), true);
  assert.equal(getBarangayAt(MACALIMA), 'Banaba Cerca');
  assert.equal(inArea(macitoda, CALUMPANG_CERCA, MACALIMA), true);
  assert.equal(inArea(macitoda, CALUMPANG_CERCA, at(14.19204 + 0.0018, 120.87286)), false, 'just past the square');
  assert.equal(inArea(macitoda, CALUMPANG_CERCA, at(14.21434, 120.85302)), false, 'the rest of Banaba Cerca is BCITODA');
});

test('ALITODA serves Alulod and Limbon, not Philmalay in Banaba Cerca', () => {
  const alitoda = findToda('ALITODA');
  const ALULOD = at(14.20339, 120.89046), VILLA_FELICIANA = at(14.20673, 120.89061), BONIFACIO_SHRINE = at(14.19990, 120.90330);
  const PANGIL = at(14.20036, 120.90543), PHILMALAY = at(14.19620, 120.87159);
  assert.deepEqual(alitoda.areas, ['Alulod', 'Limbon']);
  assert.equal(inArea(alitoda, ALULOD, VILLA_FELICIANA), true);
  assert.equal(inArea(alitoda, BONIFACIO_SHRINE, ALULOD), true);
  assert.equal(getBarangayAt(PANGIL), 'Limbon', 'Pangil, Amadeo, just past the town edge counts as Limbon');
  assert.equal(getBarangayAt(PHILMALAY), 'Banaba Cerca');
  assert.equal(inArea(alitoda, ALULOD, PHILMALAY), false);
});

test('KAYITODA serves all of Kaytapos, CvSU included, which BITODA also serves', () => {
  const kayitoda = findToda('KAYITODA');
  const KAYTAPOS = at(14.1977786, 120.8831715), KAYTAPOS_AWAY = at(14.196, 120.888), CVSU = at(14.19782, 120.88149);
  assert.deepEqual(kayitoda.areas, ['Kaytapos']);
  assert.equal(kayitoda.wholeTown, false);
  assert.equal(getBarangayAt(KAYTAPOS), 'Kaytapos');
  assert.equal(inArea(kayitoda, KAYTAPOS, KAYTAPOS_AWAY, CVSU), true);
  assert.equal(inArea(findToda('BITODA'), CVSU), true);
  assert.equal(inArea(kayitoda, BANCOD), false, 'Bancod is BITODA');
  assert.equal(inArea(kayitoda, POBLACION), false);
  assert.deepEqual([...new Set(getTodaZoneShape(kayitoda).features.map((feature) => feature.properties.name))], ['Kaytapos']);
});

test('BMLITODA serves Mahabangkahoy Lejos, not Mahabangkahoy Cerca', () => {
  const bmlitoda = findToda('BMLITODA');
  const BALAGBAG_MAHABANG_KAHOY = at(14.15102, 120.91934), MAHABANG_KAHOY_CERCA = at(14.17308, 120.89342);
  assert.deepEqual(bmlitoda.areas, ['Mahabangkahoy Lejos']);
  assert.equal(bmlitoda.wholeTown, false);
  assert.equal(getBarangayAt(BALAGBAG_MAHABANG_KAHOY), 'Mahabangkahoy Lejos');
  assert.equal(inArea(bmlitoda, BALAGBAG_MAHABANG_KAHOY), true);
  assert.equal(getBarangayAt(MAHABANG_KAHOY_CERCA), 'Mahabangkahoy Cerca');
  assert.equal(inArea(bmlitoda, MAHABANG_KAHOY_CERCA), false);
  assert.equal(inArea(bmlitoda, POBLACION), false);
  assert.deepEqual([...new Set(getTodaZoneShape(bmlitoda).features.map((feature) => feature.properties.name))], ['Mahabangkahoy Lejos']);
});

test('a TODA is found by its name however it is typed, other TODAs are not zoned', () => {
  assert.equal(findToda('kayitoda').name, 'KAYITODA');
  assert.equal(findToda('BMLI-TODA').name, 'BMLITODA');
  assert.equal(findToda('pchti toda').name, 'PCHTI-TODA');
  assert.equal(findToda('Bancod Indang TODA').name, 'BITODA');
  assert.equal(findToda('tbktoda').name, 'TBKTODA');
  assert.equal(findToda('General Trias TODA'), null);
  assert.equal(findToda(''), null);
  assert.equal(findToda(undefined), null);
});

test('points find their barangay, including just past a border, and none outside Indang', () => {
  assert.equal(getBarangayAt(PULO), 'Pulo');
  assert.equal(getBarangayAt(POBLACION), 'Barangay 1');
  assert.equal(getBarangayAt(BANCOD), 'Bancod');
  assert.equal(getBarangayAt(at(14.385026, 120.880477)), null, 'General Trias');
});
