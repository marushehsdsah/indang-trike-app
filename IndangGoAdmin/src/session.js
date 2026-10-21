// =============================================================
// session.js
// -------------------------------------------------------------
// Who is signed in to the admin screens, and how to sign out.
//
// The IndangGO app provides its signed-in admin account here
// (navigation/AdminNavigator.js), and Logout ends that session.
// Run on its own (App.js), nothing provides it: the screens show
// the mock admin from data/mockData.js, and Logout returns to
// Login.
// =============================================================

import { createContext, useContext } from 'react';
import { currentAdmin } from './data/mockData';

export const AdminSession = createContext({ admin: currentAdmin, signOut: null });

export const useAdminSession = () => useContext(AdminSession);
