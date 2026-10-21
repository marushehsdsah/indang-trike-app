// =============================================================
// screens/WelcomeScreen.js
// -------------------------------------------------------------
// "Login successful" splash shown right after Login, before the
// main app (bottom-nav screens) appears.
//
// NON-FUNCTIONAL NOTE:
// This screen auto-advances to Main after a short delay (see
// AUTO_ADVANCE_MS below) via navigation.replace('Main') — `replace`
// so Welcome doesn't stay in the stack underneath Main (no swiping
// or pressing back into the splash). Change or remove the timer if
// you'd rather require a tap to continue.
//
// HOW TO EDIT:
// - Admin name and ID shown here come from the signed-in admin
//   (../session.js), or data/mockData.js (currentAdmin) when this
//   runs on its own.
// =============================================================

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { useAdminSession } from '../session';

// How long the welcome card stays on screen before moving on.
const AUTO_ADVANCE_MS = 1800;

export default function WelcomeScreen({ navigation }) {
  const { admin } = useAdminSession();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Main');
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.background}>
      <View style={styles.card}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={30} color={colors.textOnDark} />
        </View>

        <Text style={styles.welcomeText}>Welcome, {admin.name}!</Text>
        <Text style={styles.subText}>Authentication successfully verified</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>SECURE CORE</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>ISO 27001</Text>
        </View>

        <Text style={styles.adminIdText}>
          Authorized access only. Admin ID: {admin.adminId}
        </Text>
      </View>

      <Text style={styles.footerText}>Encrypted & Online</Text>
      <Text style={styles.footerText}>© 2026 Indang Go Municipal Transit Authority</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  welcomeText: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  metaText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metaDot: {
    color: colors.textSecondary,
  },
  adminIdText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 14,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 40,
  },
});
