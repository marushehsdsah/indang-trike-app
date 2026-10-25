// =============================================================
// components/StatusBadge.js
// -------------------------------------------------------------
// A small colored pill used for statuses ("Ongoing", "Blocked",
// "Verified"...) and role tags ("RIDER", "PASSENGER").
//
// HOW TO EDIT:
// - To add a new status/role, add one line to STATUS_COLORS
//   below and it will automatically work everywhere StatusBadge
//   is used (Dashboard, Accounts, Trips).
// =============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

// Maps a status/role label (lowercased) -> background color.
// Add more entries here any time you introduce a new status.
const STATUS_COLORS = {
  ongoing: colors.statusOngoing,
  completed: colors.statusCompleted,
  cancelled: colors.statusCancelled,
  'no driver': colors.statusInactive,
  active: colors.statusOngoing,
  verified: colors.statusVerified,
  blocked: colors.statusBlocked,
  suspended: colors.statusSuspended,
  inactive: colors.statusInactive,
  idle: colors.statusPending,
  'pending docs': colors.statusPending,
  // A driver's approval (screens/AccountApprovalScreen.js); a
  // suspended driver uses 'suspended' above.
  pending: colors.statusPending,
  approved: colors.statusVerified,
  rider: colors.roleRider,
  passenger: colors.rolePassenger,
};

export default function StatusBadge({ label }) {
  const key = label.toLowerCase();
  const bgColor = STATUS_COLORS[key] || colors.statusInactive;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={styles.badgeText} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: colors.textOnDark,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
