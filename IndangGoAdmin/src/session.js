// =============================================================
// session.js
// -------------------------------------------------------------
// Who is signed in to the admin screens, how to sign out, and
// where the screens' data comes from.
//
// The IndangGO app provides its signed-in admin account here
// (navigation/AdminNavigator.js): Logout ends that session,
// load('dashboard' | 'accounts' | 'trips' | 'approvals' |
// 'drivers/<key>') gets the data from the API (GET
// /api/admin/<name>), and act('drivers/<key>/<decision>', body)
// sends an admin's decision on a driver (POST /api/admin/...).
// Run on its own (App.js), nothing provides it: the screens show
// the mock admin and the mock data from data/mockData.js, the
// decisions change that mock data, and Logout returns to Login.
// =============================================================

import { createContext, useContext } from 'react';
import { accounts, trips, currentAdmin } from './data/mockData';

const mockDrivers = () => accounts.filter((account) => account.role === 'RIDER');
// Fresh copies, as the API sends: a decision changes the mock data in place,
// and a screen must see a new list to show it.
const copies = (list) => list.map((item) => ({ ...item }));

// The mock data, shaped as the API sends it.
const MOCK = {
  dashboard: () => ({
    totalAccounts: accounts.length,
    onlineNow: accounts.filter((account) => account.status !== 'Offline').length,
    ongoingTrips: trips.filter((trip) => trip.status === 'Ongoing').length,
    recentTrips: trips.slice(0, 3),
    pendingDrivers: mockDrivers().filter((driver) => driver.approval === 'Pending').length,
  }),
  accounts: () => ({ accounts: copies(accounts) }),
  trips: () => ({ trips }),
  approvals: () => ({ drivers: copies(mockDrivers().filter((driver) => driver.approval !== 'Approved')) }),
};

function findMockDriver(key) {
  const driver = mockDrivers().find((item) => item.key === key);
  if (!driver) throw new Error('No driver has this ID.');
  return driver;
}

const loadMock = async (name) => {
  const key = name.match(/^drivers\/(.+)$/)?.[1];
  return key ? { driver: { ...findMockDriver(key) } } : MOCK[name]();
};

// An admin's decisions on the mock drivers, as the API makes them.
const DECISIONS = {
  approve: () => ({ approval: 'Approved' }),
  terminate: (reason) => ({ approval: 'Terminated', terminatedAt: new Date().toISOString(), terminationReason: reason }),
  unblock: () => ({ approval: 'Pending', terminatedAt: null, terminationReason: '' }),
};
const actMock = async (path, body = {}) => {
  const [, key, decision] = path.match(/^drivers\/([^/]+)\/(\w+)$/) || [];
  const driver = findMockDriver(key);
  if (decision === 'delete') accounts.splice(accounts.indexOf(driver), 1);
  else Object.assign(driver, DECISIONS[decision]((body.reason || '').trim()));
  // Nothing is emailed from the mock.
  return { driver: { ...driver }, emailed: false };
};

export const AdminSession = createContext({ admin: currentAdmin, signOut: null, load: loadMock, act: actMock });

export const useAdminSession = () => useContext(AdminSession);
