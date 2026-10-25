// =============================================================
// data/mockData.js
// -------------------------------------------------------------
// FAKE data, shown only when this folder runs on its own (App.js).
// Inside the IndangGO app the Dashboard, Accounts and Trips
// screens load real data from the API instead (see session.js),
// in the same shape as these arrays.
//
// HOW TO EDIT:
// - Add/remove objects from the arrays to change what shows up
//   on the Dashboard, Accounts, and Trips screens.
// =============================================================

// key: unique per account. id: the account's mobile number.
// role: 'RIDER' (driver) | 'PASSENGER'
// status: 'Available' (a driver taking ride requests) | 'Online' (app open) | 'Offline'
// Drivers also have toda, plate, capacity, joined (when they signed up) and
// approval: 'Pending' (waiting for an admin's approval) | 'Approved' |
// 'Suspended' (with terminatedAt and terminationReason).
export const accounts = [
  { key: 'a1', id: '09171234501', name: 'Johnwil Verano', email: 'johnwilverano@email.com', role: 'RIDER', status: 'Available', toda: 'ITODA', plate: 'ABC 1234', capacity: 4, joined: '2026-09-02T01:00:00.000Z', approval: 'Approved' },
  { key: 'a2', id: '09171234542', name: 'Jame Barrios', email: 'barriosjamehart@email.com', role: 'PASSENGER', status: 'Online' },
  { key: 'a3', id: '09171234515', name: 'Ricardo Reyes', email: 'ric.r@email.com', role: 'RIDER', status: 'Offline', toda: 'BITODA', plate: 'XYZ 5678', capacity: 4, joined: '2026-09-05T03:20:00.000Z', approval: 'Approved' },
  { key: 'a4', id: '09171234569', name: 'Elena Dizon', email: 'elena.d@email.com', role: 'RIDER', status: 'Online', toda: 'ITODA', plate: 'DEF 9012', capacity: 3, joined: '2026-10-21T09:45:00.000Z', approval: 'Pending' },
  { key: 'a5', id: '09171234570', name: 'Kuya Virgilio', email: 'virgilio.toda@email.com', role: 'RIDER', status: 'Offline', toda: 'BITODA', plate: 'GHI 3456', capacity: 4, joined: '2026-10-22T02:10:00.000Z', approval: 'Pending' },
  { key: 'a6', id: '09171234571', name: 'Maria Clara', email: 'maria.clara@email.com', role: 'PASSENGER', status: 'Offline' },
  { key: 'a7', id: '09171234588', name: 'Lito Camagong', email: 'lito.c@email.com', role: 'RIDER', status: 'Offline', toda: 'ALITODA', plate: 'JKL 7788', capacity: 4, joined: '2026-10-18T05:30:00.000Z', approval: 'Suspended', terminatedAt: '2026-10-19T02:00:00.000Z', terminationReason: 'Plate not on the TODA list' },
];

// status: 'Ongoing' | 'Completed' | 'Cancelled' | 'No driver' (no driver took it)
// date: when it was booked. driver and todaId are '—' until a driver accepts.
export const trips = [
  { id: '#TR-8921', todaId: 'ITODA', passenger: 'Elena Cruz', driver: 'Kuya Vida', status: 'Ongoing', route: 'Indang Public Market → CvSU Main Campus', date: '2026-10-21T08:30:00.000Z' },
  { id: '#TR-891H8', todaId: 'BITODA', passenger: 'Jame Barrios', driver: 'Kuya Virgilio', status: 'Completed', route: 'Bancod → Indang Municipal Hall', date: '2026-10-21T07:55:00.000Z' },
  { id: '#TR-8915', todaId: '—', passenger: 'Maria Clara', driver: '—', status: 'Cancelled', route: 'Agus-os → Indang Public Market', date: '2026-10-21T07:10:00.000Z' },
  { id: '#TR-8930', todaId: 'ITODA', passenger: 'Ricardo Reyes', driver: 'Lito Camagong', status: 'Ongoing', route: 'CvSU Main Campus → Kayquit', date: '2026-10-21T06:40:00.000Z' },
  { id: '#TR-8877', todaId: 'BITODA', passenger: 'Lito Camagong', driver: 'Kuya Vida', status: 'Completed', route: 'Bancod → CvSU Main Campus', date: '2026-10-20T23:15:00.000Z' },
  { id: '#TR-8850', todaId: '—', passenger: 'Johnwil Verano', driver: '—', status: 'No driver', route: 'Tambo Kulit → Indang Public Market', date: '2026-10-20T22:05:00.000Z' },
];

// The admin who is "logged in", shown on the welcome/splash screen
// and the Profile screen. Change this to whatever admin name/ID you
// want displayed.
export const currentAdmin = {
  name: 'Romar',
  adminId: '8821',
  role: 'Administrator',
};
