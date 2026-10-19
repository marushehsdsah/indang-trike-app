// =============================================================
// screens/ProfileScreen.js
// -------------------------------------------------------------
// The signed-in admin's own profile, opened from the avatar in
// TopHeader: name, Admin ID and role, plus a Logout button.
//
// NON-FUNCTIONAL NOTE:
// Like Login, Logout only moves the app. It resets the stack so
// Login is the only screen left — the back button can't return to
// the dashboard afterwards. Add a real sign-out call to
// handleLogout() once admin login checks credentials.
//
// HOW TO EDIT:
// - Name, Admin ID and role come from data/mockData.js (currentAdmin).
// - Rows in the details card live in DETAILS below.
// - Colors come from ../theme/colors.js.
// =============================================================

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { currentAdmin } from '../data/mockData';

// Rows shown in the "Account Details" card.
const DETAILS = [
  { icon: 'id-card-outline', label: 'Admin ID', value: currentAdmin.adminId },
  { icon: 'shield-checkmark-outline', label: 'Role', value: currentAdmin.role },
];

export default function ProfileScreen({ navigation }) {
  const handleLogout = () => {
    // TODO: end the real admin session here once login is wired up.
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.screen}>
      {/* ---- Top bar: back arrow + title ---- */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.brandGreenDark} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ---- Who is signed in ---- */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={colors.textOnDark} />
          </View>
          <Text style={styles.name}>{currentAdmin.name}</Text>
          <Text style={styles.organization}>Indang Go Municipal Transit Authority</Text>
        </View>

        {/* ---- Account details ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Details</Text>
          {DETAILS.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <Ionicons name={row.icon} size={18} color={colors.textSecondary} />
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={styles.detailValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* ---- Logout ---- */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.statusCancelled} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brandGreenDark,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  identityCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  organization: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.statusCancelled,
    backgroundColor: colors.card,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.statusCancelled,
  },
});
