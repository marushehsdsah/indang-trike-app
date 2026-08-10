// =============================================================
// admin/screens/AdminDashboardScreen.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from DashboardScreen.js.
// =============================================================

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import adminColors from '../theme/adminColors';
import { trips, accounts } from '../data/adminMockData';
import AdminStatusBadge from '../components/AdminStatusBadge';
import AdminTopHeader from '../components/AdminTopHeader';

export default function AdminDashboardScreen({ onViewAllTrips }) {
  const ongoingCount = trips.filter((t) => t.status === 'Ongoing').length;
  const activeAccountsCount = accounts.filter(
    (a) => a.status === 'Active' || a.status === 'Verified'
  ).length;
  const recentTrips = trips.slice(0, 3);

  return (
    <View style={styles.screen}>
      <AdminTopHeader title="Admin" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Dashboard</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{accounts.length}</Text>
            <Text style={styles.statLabel}>Total Accounts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{activeAccountsCount}</Text>
            <Text style={styles.statLabel}>Active Accounts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: adminColors.statusOngoing }]}>{ongoingCount}</Text>
            <Text style={styles.statLabel}>Ongoing Trips</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Recent Trips</Text>
            <TouchableOpacity onPress={onViewAllTrips}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>Toda ID</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>Passenger</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }, styles.rightAlign]}>Status</Text>
          </View>

          {recentTrips.map((trip) => (
            <View key={trip.id} style={styles.tripRow}>
              <Text style={[styles.tripId, { flex: 1.1 }]}>{trip.id}</Text>
              <View style={{ flex: 1.4 }}>
                <Text style={styles.passengerName}>{trip.passenger}</Text>
                <Text style={styles.driverName}>Driver: {trip.driver}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <AdminStatusBadge label={trip.status} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminColors.background },
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  heading: { fontSize: 24, fontWeight: '800', color: adminColors.textPrimary, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statCard: {
    flex: 1, backgroundColor: adminColors.card, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: adminColors.border,
  },
  statNumber: { fontSize: 20, fontWeight: '800', color: adminColors.textPrimary },
  statLabel: { fontSize: 10, color: adminColors.textSecondary, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: adminColors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: adminColors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: adminColors.textPrimary },
  viewAllText: { fontSize: 12, color: adminColors.brandGreen, fontWeight: '600' },
  tableHeaderRow: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: adminColors.border },
  tableHeaderText: { fontSize: 11, color: adminColors.textSecondary, fontWeight: '600' },
  rightAlign: { textAlign: 'right' },
  tripRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: adminColors.border },
  tripId: { fontSize: 12, fontWeight: '600', color: adminColors.textPrimary },
  passengerName: { fontSize: 13, fontWeight: '600', color: adminColors.textPrimary },
  driverName: { fontSize: 11, color: adminColors.textSecondary, marginTop: 2 },
});
