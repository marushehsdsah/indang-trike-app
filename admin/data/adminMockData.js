// =============================================================
// admin/data/adminMockData.js
// -------------------------------------------------------------
// ADMIN-ONLY fake data. Renamed from mockData.js to adminMockData.js
// so it can't collide with any data file the trike app already has.
// =============================================================

export const accounts = [
  { id: '2026-001', name: 'Johnwil Verano', email: 'johnwilverano@email.com', role: 'RIDER', status: 'Active' },
  { id: '2026-042', name: 'Jame Barrios', email: 'barriosjamehart@email.com', role: 'PASSENGER', status: 'Verified' },
  { id: '2026-015', name: 'Ricardo Reyes', email: 'ric.r@email.com', role: 'RIDER', status: 'Blocked' },
  { id: '2026-069', name: 'Elena Dizon', email: 'elena.d@email.com', role: 'RIDER', status: 'Pending Docs' },
  { id: '2026-070', name: 'Kuya Virgilio', email: 'virgilio.toda@email.com', role: 'RIDER', status: 'Active' },
  { id: '2026-071', name: 'Maria Clara', email: 'maria.clara@email.com', role: 'PASSENGER', status: 'Verified' },
];

export const trips = [
  { id: '#TR-8921', todaId: 'TODA-3142', passenger: 'Elena Cruz', driver: 'Kuya Vida', status: 'Ongoing' },
  { id: '#TR-891h8', todaId: 'TODA-1235', passenger: 'Jame Barrios', driver: 'Kuya Virgilio', status: 'Completed' },
  { id: '#TR-8915', todaId: 'TODA-1190', passenger: 'Maria Clara', driver: 'Lando Garcia', status: 'Cancelled' },
  { id: '#TR-8930', todaId: 'TODA-2831', passenger: 'Ricardo Reyes', driver: 'Ricardo Reyes', status: 'Ongoing' },
  { id: '#TR-8877', todaId: 'TODA-1034', passenger: 'Lito Camagong', driver: 'Lito Camagong', status: 'Completed' },
  { id: '#TR-8850', todaId: 'TODA-3142', passenger: 'Johnwil Verano', driver: 'Kuya Vida', status: 'Cancelled' },
];

export const currentAdmin = {
  name: 'Romar',
  adminId: '8821',
};
