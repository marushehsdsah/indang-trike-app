// =============================================================
// admin/screens/AdminTripsScreen.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from TripsScreen.js.
// =============================================================

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import adminColors from '../theme/adminColors';
import { trips } from '../data/adminMockData';
import AdminStatusBadge from '../components/AdminStatusBadge';
import AdminTopHeader from '../components/AdminTopHeader';

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'Ongoing', label: 'Ongoing' },
  { key: 'Completed', label: 'Finished' },
  { key: 'Cancelled', label: 'Cancelled' },
];

export default function AdminTripsScreen() {
  const [activeStatusFilter, setActiveStatusFilter] = useState('ALL');

  const filteredTrips = useMemo(() => {
    if (activeStatusFilter === 'ALL') return trips;
    return trips.filter((trip) => trip.status === activeStatusFilter);
  }, [activeStatusFilter]);

  return (
    <View style={styles.screen}>
      <AdminTopHeader title="Admin" />
      <View style={styles.content}>
        <Text style={styles.heading}>Trip Records</Text>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeStatusFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveStatusFilter(filter.key)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={filteredTrips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No trips match this filter.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.tripCard} onPress={() => {}} activeOpacity={0.7}>
              <View style={styles.tripCardHeader}>
                <View>
                  <Text style={styles.tripId}>{item.id}</Text>
                  <Text style={styles.todaId}>{item.todaId}</Text>
                </View>
                <AdminStatusBadge label={item.status} />
              </View>
              <View style={styles.divider} />
              <View style={styles.personRow}>
                <Ionicons name="person-outline" size={14} color={adminColors.textSecondary} />
                <Text style={styles.personLabel}>Passenger:</Text>
                <Text style={styles.personName}>{item.passenger}</Text>
              </View>
              <View style={styles.personRow}>
                <Ionicons name="car-outline" size={14} color={adminColors.textSecondary} />
                <Text style={styles.personLabel}>Driver:</Text>
                <Text style={styles.personName}>{item.driver}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminColors.background },
  content: { flex: 1, paddingHorizontal: 20 },
  heading: { fontSize: 24, fontWeight: '800', color: adminColors.textPrimary, marginBottom: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: adminColors.card,
    borderWidth: 1, borderColor: adminColors.border,
  },
  filterChipActive: { backgroundColor: adminColors.brandYellow, borderColor: adminColors.brandYellow },
  filterChipText: { fontSize: 12, fontWeight: '600', color: adminColors.textSecondary },
  filterChipTextActive: { color: adminColors.brandGreenDark },
  listContent: { paddingTop: 12, paddingBottom: 90 },
  emptyText: { textAlign: 'center', color: adminColors.textSecondary, marginTop: 30, fontSize: 13 },
  tripCard: {
    backgroundColor: adminColors.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: adminColors.border,
  },
  tripCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripId: { fontSize: 14, fontWeight: '700', color: adminColors.textPrimary },
  todaId: { fontSize: 11, color: adminColors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: adminColors.border, marginVertical: 10 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  personLabel: { fontSize: 12, color: adminColors.textSecondary },
  personName: { fontSize: 12, fontWeight: '600', color: adminColors.textPrimary },
});
