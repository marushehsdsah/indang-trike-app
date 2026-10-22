// =============================================================
// screens/AccountApprovalScreen.js
// -------------------------------------------------------------
// "Account Approval", opened from the hamburger menu (TopHeader):
// the drivers who signed up and wait for an admin to check their
// details against their TODA's list of registered drivers, and
// the drivers an admin terminated. Until approved, a driver
// cannot go online or get bookings. Tapping a driver opens their
// review (DriverReviewScreen.js) to approve, terminate, delete or
// unblock them.
//
// HOW TO EDIT:
// - Drivers come from useAdminData('approvals'): the API in the
//   IndangGO app (GET /api/admin/approvals), or the mock accounts
//   in data/mockData.js when this runs on its own. Pull down to
//   refresh; the list also reloads when you come back from a
//   driver's review.
// - The filter chips live in FILTERS below.
// =============================================================

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import useAdminData from '../useAdminData';
import formatDate from '../formatDate';
import StatusBadge from '../components/StatusBadge';
import TopHeader from '../components/TopHeader';
import LoadState, { RefreshError } from '../components/LoadState';

// The drivers' approval, as the API names it.
const FILTERS = [
  { key: 'Pending', label: 'Pending', empty: 'No drivers are waiting for approval.' },
  { key: 'Terminated', label: 'Terminated', empty: 'No drivers have been terminated.' },
];

export default function AccountApprovalScreen({ navigation }) {
  const [activeFilter, setActiveFilter] = useState('Pending');
  const { data, loading, refreshing, error, reload, refresh } = useAdminData('approvals');
  const drivers = data?.drivers;

  const shownDrivers = useMemo(
    () => (drivers || []).filter((driver) => driver.approval === activeFilter),
    [drivers, activeFilter],
  );
  const filter = FILTERS.find((item) => item.key === activeFilter);

  return (
    <View style={styles.screen}>
      <TopHeader title="Admin" section="approval" />

      <View style={styles.content}>
        <Text style={styles.heading}>Account Approval</Text>
        <Text style={styles.subheading}>
          Check each driver against their TODA’s list of registered drivers. They can’t take bookings until you approve them.
        </Text>

        {/* ---- Pending / Terminated chips, with how many each has ---- */}
        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const isActive = activeFilter === item.key;
            const count = drivers ? drivers.filter((driver) => driver.approval === item.key).length : null;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {count === null ? item.label : `${item.label} (${count})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error && drivers && <RefreshError message={error} />}

        {/* ---- Driver list ---- */}
        {!drivers ? <LoadState loading={loading} error={error} onRetry={reload} /> : (
        <FlatList
          data={shownDrivers}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={<Text style={styles.emptyText}>{filter.empty}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.driverCard}
              onPress={() => navigation.navigate('DriverReview', { key: item.key, name: item.name })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Review ${item.name}`}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={colors.textSecondary} />
              </View>

              <View style={styles.driverInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.driverName} numberOfLines={1}>{item.name}</Text>
                  <StatusBadge label={item.approval} />
                </View>
                <Text style={styles.detailText}>Mobile No#: {item.id}</Text>
                <View style={styles.detailRow}>
                  <Ionicons name="car-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.detailText} numberOfLines={1}>
                    {[item.toda, item.plate].filter(Boolean).join(' · ') || 'No TODA or plate'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.detailText} numberOfLines={1}>
                    {item.approval === 'Terminated' && item.terminatedAt
                      ? `Terminated ${formatDate(item.terminatedAt)}`
                      : `Signed up ${formatDate(item.joined)}`}
                  </Text>
                </View>
                {item.approval === 'Terminated' && item.terminationReason ? (
                  <Text style={styles.reasonText} numberOfLines={2}>Reason: {item.terminationReason}</Text>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} style={styles.chevron} />
            </TouchableOpacity>
          )}
        />
        )}
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
  },
  subheading: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
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
    paddingBottom: 30,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 30,
    fontSize: 13,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    alignSelf: 'flex-start',
  },
  driverInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  driverName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  detailText: {
    fontSize: 11,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  reasonText: {
    fontSize: 11,
    color: colors.statusCancelled,
    marginTop: 4,
  },
  chevron: {
    marginLeft: 8,
  },
});
