import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import WelcomeScreen from '../IndangGoAdmin/src/screens/WelcomeScreen';
import MainScreen from '../IndangGoAdmin/src/screens/MainScreen';
import ProfileScreen from '../IndangGoAdmin/src/screens/ProfileScreen';
import colors from '../IndangGoAdmin/src/theme/colors';
import { AdminSession } from '../IndangGoAdmin/src/session';
import { useApp } from '../context/AppContext';

const Stack = createNativeStackNavigator();

// The admin interface (IndangGoAdmin) for an admin account (role "admin", added
// only in the database) that logged in on the app's own login: its Welcome ->
// Main (+ Profile) stack, as in IndangGoAdmin/App.js after its Login. Its
// screens show this account, and its Logout ends the app's session.
export default function AdminNavigator() {
  const { user, signOut } = useApp();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin';
  // The mobile number the admin logs in with, as they type it (09…).
  const adminId = user?.phone?.replace(/^\+63/, '0') || '';
  const session = useMemo(() => ({ admin: { name, adminId, role: 'Administrator' }, signOut }), [name, adminId, signOut]);
  return (
    <AdminSession.Provider value={session}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <Stack.Navigator
          initialRouteName="Welcome"
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Main" component={MainScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </SafeAreaView>
    </AdminSession.Provider>
  );
}
