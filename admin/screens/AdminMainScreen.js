// =============================================================
// admin/screens/AdminMainScreen.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from MainScreen.js. Owns the admin bottom tab bar and
// switches between Dashboard/Accounts/Trips using local state.
// =============================================================

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import AdminDashboardScreen from './AdminDashboardScreen';
import AdminAccountsScreen from './AdminAccountsScreen';
import AdminTripsScreen from './AdminTripsScreen';
import AdminBottomNav from '../components/AdminBottomNav';
import adminColors from '../theme/adminColors';

export default function AdminMainScreen() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const goToTripsTab = () => setActiveTab('trips');

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        {activeTab === 'dashboard' && <AdminDashboardScreen onViewAllTrips={goToTripsTab} />}
        {activeTab === 'accounts' && <AdminAccountsScreen />}
        {activeTab === 'trips' && <AdminTripsScreen />}
      </View>
      <AdminBottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminColors.background },
});
