// =============================================================
// admin/components/AdminBottomNav.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from BottomNav.js to avoid colliding with any similarly
// named component in the trike app. Controlled by local state in
// AdminMainScreen.js — not a separate navigator.
// =============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import adminColors from '../theme/adminColors';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'accounts', label: 'Accounts', icon: 'people' },
  { key: 'trips', label: 'Trips', icon: 'car' },
];

export default function AdminBottomNav({ activeTab, onChangeTab }) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            activeOpacity={0.7}
            onPress={() => onChangeTab(tab.key)}
          >
            <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
              <Ionicons
                name={tab.icon}
                size={20}
                color={isActive ? adminColors.navActiveText : adminColors.navInactive}
              />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: adminColors.navBackground,
    borderTopWidth: 1,
    borderTopColor: adminColors.border,
    paddingTop: 8,
    paddingBottom: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: adminColors.navActiveBg,
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    color: adminColors.navInactive,
    fontWeight: '500',
  },
  labelActive: {
    color: adminColors.textPrimary,
    fontWeight: '700',
  },
});
