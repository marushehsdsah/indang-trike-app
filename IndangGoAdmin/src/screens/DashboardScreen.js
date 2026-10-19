// =============================================================
// screens/DashboardScreen.js
// -------------------------------------------------------------
// Overview screen: quick stat summary + a "Recent Trips" list
// (Toda ID / Passenger / Status), matching the reference design.
//
// HOW TO EDIT:
// - Trip/account data comes from data/mockData.js.
// - Stat numbers below are computed live from that same data, so
//   adding/removing accounts or trips in mockData.js updates the
//   counts automatically — no need to touch this file.
// - "View All" jumps to the Trips tab via the onViewAllTrips prop
//   (wired up in App.js).
// =============================================================

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import colors from '../theme/colors';
import { trips, accounts } from '../data/mockData';
import StatusBadge from '../components/StatusBadge';
import TopHeader from '../components/TopHeader';

export default function DashboardScreen({ onViewAllTrips }) {
  const ongoingCount = trips.filter((t) => t.status === 'Ongoing').length;
  const activeAccountsCount = accounts.filter(
    (a) => a.status === 'Active' || a.status === 'Verified'
  ).length;

  // Only show a handful on the dashboard preview; the full list
  // lives on the Trips tab.
  const recentTrips = trips.slice(0, 3);

  return (
    <View style={styles.screen}>
      <TopHeader title="Admin" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Dashboard</Text>

        {/* ---- Quick stat summary cards ---- */}
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
            <Text style={[styles.statNumber, { color: colors.statusOngoing }]}>
              {ongoingCount}
            </Text>
            <Text style={styles.statLabel}>Ongoing Trips</Text>
          </View>
        </View>

        {/* ---- Recent trips card ---- */}
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
                <StatusBadge label={trip.status} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  viewAllText: {
    fontSize: 12,
    color: colors.brandGreen,
    fontWeight: '600',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  rightAlign: {
    textAlign: 'right',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tripId: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  passengerName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  driverName: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
