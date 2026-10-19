// =============================================================
// screens/MainScreen.js
// -------------------------------------------------------------
// This is the "Main" screen in the Stack Navigator (see App.js).
// It owns the bottom tab bar and switches between Dashboard,
// Accounts, and Trips using local state — NOT a separate stack
// route per tab. That keeps things simple since the tabs don't
// need their own back-stack/history.
//
// HOW TO EDIT:
// - activeTab: which of 'dashboard' | 'accounts' | 'trips' shows.
// - If you'd rather each tab have its own navigation history
//   (e.g. drilling into a trip and pressing back), swap BottomNav
//   here for @react-navigation/bottom-tabs' createBottomTabNavigator
//   and nest it as a screen inside the Stack in App.js instead.
// =============================================================

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import DashboardScreen from './DashboardScreen';
import AccountsScreen from './AccountsScreen';
import TripsScreen from './TripsScreen';
import BottomNav from '../components/BottomNav';
import colors from '../theme/colors';

export default function MainScreen() {
  // 'dashboard' | 'accounts' | 'trips'
  const [activeTab, setActiveTab] = useState('dashboard');

  const goToTripsTab = () => setActiveTab('trips');

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        {activeTab === 'dashboard' && <DashboardScreen onViewAllTrips={goToTripsTab} />}
        {activeTab === 'accounts' && <AccountsScreen />}
        {activeTab === 'trips' && <TripsScreen />}
      </View>
      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
