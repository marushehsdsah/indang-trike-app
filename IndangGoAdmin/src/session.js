// =============================================================
// session.js
// -------------------------------------------------------------
// Who is signed in to the admin screens, how to sign out, and
// where the screens' data comes from.
//
// The IndangGO app provides its signed-in admin account here
// (navigation/AdminNavigator.js): Logout ends that session, and
// load('dashboard' | 'accounts' | 'trips') gets the data from the
// API (GET /api/admin/<name>). Run on its own (App.js), nothing
// provides it: the screens show the mock admin and the mock data
// from data/mockData.js, and Logout returns to Login.
// =============================================================

import { createContext, useContext } from 'react';
import { accounts, trips, currentAdmin } from './data/mockData';

// The mock data, shaped as the API sends it.
const MOCK = {
  dashboard: () => ({
    totalAccounts: accounts.length,
    onlineNow: accounts.filter((account) => account.status !== 'Offline').length,
    ongoingTrips: trips.filter((trip) => trip.status === 'Ongoing').length,
    recentTrips: trips.slice(0, 3),
  }),
  accounts: () => ({ accounts }),
  trips: () => ({ trips }),
};
const loadMock = async (name) => MOCK[name]();

export const AdminSession = createContext({ admin: currentAdmin, signOut: null, load: loadMock });

export const useAdminSession = () => useContext(AdminSession);
