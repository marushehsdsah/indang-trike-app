// =============================================================
// components/BottomNav.js
// -------------------------------------------------------------
// The 3-tab bottom bar: Dashboard | Accounts | Trips.
//
// NOTE ON APPROACH:
// This is a simple, hand-built tab bar controlled by the
// `activeTab` state that lives in App.js — it is NOT using
// @react-navigation/bottom-tabs. That keeps this demo lightweight
// and dependency-free.
//
// If you later want real screen transitions, deep linking, etc,
// swap this out for @react-navigation/bottom-tabs — the visual
// design here (icon, label, active pill) can be copied into a
// custom tabBar render function.
//
// HOW TO EDIT:
// - To add/remove a tab, edit the TABS array below.
// =============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'accounts', label: 'Accounts', icon: 'people' },
  { key: 'trips', label: 'Trips', icon: 'car' },
];

export default function BottomNav({ activeTab, onChangeTab }) {
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
            {/* collapsable={false}: an inactive pill has nothing to draw, so
                Android would flatten it away; when it turned active, the view
                was recreated without its borderRadius and showed square. */}
            <View collapsable={false} style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
              <Ionicons
                name={tab.icon}
                size={20}
                color={isActive ? colors.navActiveText : colors.navInactive}
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
    backgroundColor: colors.navBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 20, // extra padding for home-indicator area on iOS
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
    backgroundColor: colors.navActiveBg,
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    color: colors.navInactive,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
