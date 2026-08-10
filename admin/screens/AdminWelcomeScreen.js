// =============================================================
// admin/screens/AdminWelcomeScreen.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from WelcomeScreen.js. Auto-advances to 'AdminMain'
// (route name inside this nested navigator) after a short delay.
// =============================================================

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import adminColors from '../theme/adminColors';
import { currentAdmin } from '../data/adminMockData';

const AUTO_ADVANCE_MS = 1800;

export default function AdminWelcomeScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('AdminMain');
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.background}>
      <View style={styles.card}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={30} color={adminColors.textOnDark} />
        </View>
        <Text style={styles.welcomeText}>Welcome, {currentAdmin.name}!</Text>
        <Text style={styles.subText}>Authentication successfully verified</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>SECURE CORE</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>ISO 27001</Text>
        </View>
        <Text style={styles.adminIdText}>
          Authorized access only. Admin ID: {currentAdmin.adminId}
        </Text>
      </View>
      <Text style={styles.footerText}>Encrypted & Online</Text>
      <Text style={styles.footerText}>© 2026 Indang Go Municipal Transit Authority</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: adminColors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    width: '100%', backgroundColor: adminColors.card, borderRadius: 22, paddingVertical: 34,
    paddingHorizontal: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1,
    shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  checkCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: adminColors.brandGreen,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  welcomeText: { fontSize: 19, fontWeight: '800', color: adminColors.textPrimary },
  subText: { fontSize: 13, color: adminColors.textSecondary, marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  metaText: { fontSize: 11, color: adminColors.textSecondary, fontWeight: '600' },
  metaDot: { color: adminColors.textSecondary },
  adminIdText: { fontSize: 11, color: adminColors.textSecondary, marginTop: 14, textAlign: 'center' },
  footerText: { fontSize: 11, color: adminColors.textSecondary, marginTop: 40 },
});
