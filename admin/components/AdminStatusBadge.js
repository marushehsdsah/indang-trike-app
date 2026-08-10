// =============================================================
// admin/components/AdminStatusBadge.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from StatusBadge.js to avoid colliding with any similarly
// named component in the trike app.
// =============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import adminColors from '../theme/adminColors';

const STATUS_COLORS = {
  ongoing: adminColors.statusOngoing,
  completed: adminColors.statusCompleted,
  cancelled: adminColors.statusCancelled,
  active: adminColors.statusOngoing,
  verified: adminColors.statusVerified,
  blocked: adminColors.statusBlocked,
  suspended: adminColors.statusSuspended,
  inactive: adminColors.statusInactive,
  idle: adminColors.statusPending,
  'pending docs': adminColors.statusPending,
  rider: adminColors.roleRider,
  passenger: adminColors.rolePassenger,
};

export default function AdminStatusBadge({ label }) {
  const key = label.toLowerCase();
  const bgColor = STATUS_COLORS[key] || adminColors.statusInactive;

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
    color: adminColors.textOnDark,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
