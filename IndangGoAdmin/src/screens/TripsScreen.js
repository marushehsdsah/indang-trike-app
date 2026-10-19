// =============================================================
// screens/TripsScreen.js
// -------------------------------------------------------------
// "Trip Records" screen: search bar (searches by trip ID, Toda ID,
// passenger, or driver) + a filter row to show All / Ongoing /
// Completed / Cancelled trips, followed by a scrollable list of
// trip cards (Toda ID, passenger, driver, status).
//
// HOW TO EDIT:
// - Trip data comes from data/mockData.js (trips array).
// - Filter options live in STATUS_FILTERS below — add a new one
//   there if you introduce another trip status.
// - Fields the search bar looks in live in SEARCH_FIELDS below.
// - Tapping a trip row is non-functional right now (onPress is a
//   no-op) — hook up a trip-details screen there later.
// =============================================================

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { trips } from '../data/mockData';
import StatusBadge from '../components/StatusBadge';
import TopHeader from '../components/TopHeader';

// Filter chip options shown at the top of the list.
const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'Ongoing', label: 'Ongoing' },
  { key: 'Completed', label: 'Finished' },
  { key: 'Cancelled', label: 'Cancelled' },
];

// Trip fields the search bar matches against (case-insensitive).
const SEARCH_FIELDS = ['id', 'todaId', 'passenger', 'driver'];

export default function TripsScreen() {
  const [searchText, setSearchText] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState('ALL');

  // A trip shows when it matches both the status filter and the
  // search text, so you can e.g. search a driver's name within
  // "Ongoing" trips only.
  const query = searchText.trim().toLowerCase();
  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchesStatus =
        activeStatusFilter === 'ALL' || trip.status === activeStatusFilter;

      const matchesSearch =
        query.length === 0 ||
        SEARCH_FIELDS.some((field) => trip[field].toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [query, activeStatusFilter]);

  return (
    <View style={styles.screen}>
      <TopHeader title="Admin" />

      <View style={styles.content}>
        <Text style={styles.heading}>Trip Records</Text>

        {/* ---- Search bar ---- */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by trip, Toda ID, or name..."
            placeholderTextColor={colors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {/* ---- Status filter chips ---- */}
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeStatusFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveStatusFilter(filter.key)}
              >
                <Text
                  style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ---- Trip list ---- */}
        <FlatList
          data={filteredTrips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query ? 'No trips match your search.' : 'No trips match this filter.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.tripCard} onPress={() => {}} activeOpacity={0.7}>
              <View style={styles.tripCardHeader}>
                <View>
                  <Text style={styles.tripId}>{item.id}</Text>
                  <Text style={styles.todaId}>{item.todaId}</Text>
                </View>
                <StatusBadge label={item.status} />
              </View>

              <View style={styles.divider} />

              <View style={styles.personRow}>
                <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.personLabel}>Passenger:</Text>
                <Text style={styles.personName}>{item.passenger}</Text>
              </View>
              <View style={styles.personRow}>
                <Ionicons name="car-outline" size={14} color={colors.textSecondary} />
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
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.brandYellow,
    borderColor: colors.brandYellow,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.brandGreenDark,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 90, // leave room above the bottom nav
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 30,
    fontSize: 13,
  },
  tripCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tripId: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  todaId: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  personLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  personName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
