// =============================================================
// admin/AdminNavigator.js
// -------------------------------------------------------------
// ██████████████████████████████████████████████████████████████
// █  ADMIN-ONLY NAVIGATOR — everything reachable from here is    █
// █  the Indang Go ADMIN app, not the passenger/trike-driver     █
// █  app. Keep all admin screens/components/data under this      █
// █  admin/ folder so they're easy to find, audit, or strip out. █
// ██████████████████████████████████████████████████████████████
//
// WHY THIS FILE EXISTS (the merge):
// The standalone admin project used to have its own App.js with
// its own <NavigationContainer> and <Stack.Navigator>. React
// Navigation only allows ONE <NavigationContainer> per app, and
// the trike app already has one (wrapping AppNavigator.js at the
// project root). So instead of merging two containers, this file
// keeps ONLY the inner Stack.Navigator from the old admin App.js
// and gets mounted as a single nested screen inside the trike
// app's AppNavigator — see the "AdminApp" entry in
// ../navigation/AppNavigator.js.
//
// Flow inside this navigator:  AdminLogin -> AdminWelcome -> AdminMain
//
// HOW TO EDIT:
// - To add a new admin-only screen, add a <AdminStack.Screen>
//   below and put the screen file in admin/screens/.
// =============================================================

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AdminLoginScreen from './screens/AdminLoginScreen';
import AdminWelcomeScreen from './screens/AdminWelcomeScreen';
import AdminMainScreen from './screens/AdminMainScreen';
import adminColors from './theme/adminColors';

const AdminStack = createNativeStackNavigator();

export default function AdminNavigator() {
  return (
    <AdminStack.Navigator
      initialRouteName="AdminLogin"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: adminColors.background },
      }}
    >
      <AdminStack.Screen name="AdminLogin" component={AdminLoginScreen} />
      <AdminStack.Screen name="AdminWelcome" component={AdminWelcomeScreen} />
      <AdminStack.Screen name="AdminMain" component={AdminMainScreen} />
    </AdminStack.Navigator>
  );
}
