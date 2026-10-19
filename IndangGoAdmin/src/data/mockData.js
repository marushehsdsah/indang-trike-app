// =============================================================
// data/mockData.js
// -------------------------------------------------------------
// FAKE data only. The app is a non-functional design mockup, so
// there is no backend yet — these arrays stand in for it.
//
// HOW TO EDIT:
// - Add/remove objects from the arrays to change what shows up
//   on the Dashboard, Accounts, and Trips screens.
// - Later, when a real backend exists, fetch data from your API
//   (e.g. inside a useEffect) and pass it down the same way these
//   arrays are used — the screens don't need to change.
// =============================================================

// role: 'RIDER' (driver) | 'PASSENGER'
// status: 'Active' | 'Verified' | 'Blocked' | 'Pending Docs'
export const accounts = [
  { id: '2026-001', name: 'Johnwil Verano', email: 'johnwilverano@email.com', role: 'RIDER', status: 'Active' },
  { id: '2026-042', name: 'Jame Barrios', email: 'barriosjamehart@email.com', role: 'PASSENGER', status: 'Verified' },
  { id: '2026-015', name: 'Ricardo Reyes', email: 'ric.r@email.com', role: 'RIDER', status: 'Blocked' },
  { id: '2026-069', name: 'Elena Dizon', email: 'elena.d@email.com', role: 'RIDER', status: 'Pending Docs' },
  { id: '2026-070', name: 'Kuya Virgilio', email: 'virgilio.toda@email.com', role: 'RIDER', status: 'Active' },
  { id: '2026-071', name: 'Maria Clara', email: 'maria.clara@email.com', role: 'PASSENGER', status: 'Verified' },
];

// status: 'Ongoing' | 'Completed' | 'Cancelled'
export const trips = [
  { id: '#TR-8921', todaId: 'TODA-3142', passenger: 'Elena Cruz', driver: 'Kuya Vida', status: 'Ongoing' },
  { id: '#TR-891h8', todaId: 'TODA-1235', passenger: 'Jame Barrios', driver: 'Kuya Virgilio', status: 'Completed' },
  { id: '#TR-8915', todaId: 'TODA-1190', passenger: 'Maria Clara', driver: 'Lando Garcia', status: 'Cancelled' },
  { id: '#TR-8930', todaId: 'TODA-2831', passenger: 'Ricardo Reyes', driver: 'Ricardo Reyes', status: 'Ongoing' },
  { id: '#TR-8877', todaId: 'TODA-1034', passenger: 'Lito Camagong', driver: 'Lito Camagong', status: 'Completed' },
  { id: '#TR-8850', todaId: 'TODA-3142', passenger: 'Johnwil Verano', driver: 'Kuya Vida', status: 'Cancelled' },
];

// The admin who is "logged in", shown on the welcome/splash screen
// and the Profile screen. Change this to whatever admin name/ID you
// want displayed.
export const currentAdmin = {
  name: 'Romar',
  adminId: '8821',
  role: 'Administrator',
};
