// =============================================================
// admin/components/AdminTopHeader.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from TopHeader.js to avoid colliding with any similarly
// named component in the trike app.
// =============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import adminColors from '../theme/adminColors';

export default function AdminTopHeader({ title = 'Admin' }) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <TouchableOpacity
          onPress={() => {}}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color={adminColors.brandGreenDark} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>

      <TouchableOpacity onPress={() => {}} style={styles.avatar}>
        <Ionicons name="person" size={18} color={adminColors.textOnDark} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: adminColors.background,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: adminColors.brandGreenDark,
    marginLeft: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: adminColors.brandGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
