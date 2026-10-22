// =============================================================
// screens/DashboardScreen.js
// -------------------------------------------------------------
// Overview screen: quick stat summary + a "Recent Trips" list
// (Toda ID / Passenger / Status), matching the reference design.
//
// HOW TO EDIT:
// - The numbers and recent trips come from useAdminData('dashboard'):
//   the API in the IndangGO app (GET /api/admin/dashboard), or
//   data/mockData.js when this runs on its own. Pull down to refresh.
// - "Online Now" counts passengers and drivers with the app open.
// - "View All" jumps to the Trips tab via the onViewAllTrips prop
//   (wired up in App.js).
// - While drivers wait for approval, a card says how many and
//   opens Account Approval (also in the hamburger menu).
// =============================================================

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import useAdminData from '../useAdminData';
import StatusBadge from '../components/StatusBadge';
import TopHeader from '../components/TopHeader';
import LoadState, { RefreshError } from '../components/LoadState';

export default function DashboardScreen({ onViewAllTrips }) {
  const navigation = useNavigation();
  const { data, loading, refreshing, error, reload, refresh } = useAdminData('dashboard');

  return (
    <View style={styles.screen}>
      <TopHeader title="Admin" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.brandGreen]} />}
      >
        <Text style={styles.heading}>Dashboard</Text>

        {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : <>
        {error && <RefreshError message={error} />}

        {/* ---- Quick stat summary cards ---- */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{data.totalAccounts}</Text>
            <Text style={styles.statLabel}>Total Accounts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{data.onlineNow}</Text>
            <Text style={styles.statLabel}>Online Now</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: colors.statusOngoing }]}>
              {data.ongoingTrips}
            </Text>
            <Text style={styles.statLabel}>Ongoing Trips</Text>
          </View>
        </View>

        {/* ---- Drivers waiting for approval ---- */}
        {data.pendingDrivers > 0 && (
          <TouchableOpacity
            style={styles.approvalCard}
            onPress={() => navigation.navigate('AccountApproval')}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="person-add-outline" size={22} color={colors.brandGreenDark} />
            <View style={styles.approvalCopy}>
              <Text style={styles.approvalTitle}>
                {data.pendingDrivers} driver{data.pendingDrivers === 1 ? '' : 's'} waiting for approval
              </Text>
              <Text style={styles.approvalNote}>Check them against their TODA’s list</Text>
            </View>
            <Text style={styles.viewAllText}>Review</Text>
          </TouchableOpacity>
        )}

        {/* ---- Recent trips card ---- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Recent Trips</Text>
            <TouchableOpacity onPress={onViewAllTrips}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>Trip ID</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>Passenger</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }, styles.rightAlign]}>Status</Text>
          </View>

          {data.recentTrips.length === 0 && <Text style={styles.emptyText}>No trips yet.</Text>}
          {data.recentTrips.map((trip) => (
            <View key={trip.key ?? trip.id} style={styles.tripRow}>
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
        </>}
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
  approvalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.brandYellowSoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },
  approvalCopy: {
    flex: 1,
  },
  approvalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brandGreenDark,
  },
  approvalNote: {
    fontSize: 11,
    color: colors.brandGreenDark,
    marginTop: 2,
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
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
