// =============================================================
// screens/AccountsScreen.js
// -------------------------------------------------------------
// "Manage Accounts" screen: search bar (searches by name or
// mobile number, the account's id) + a filter row to show All /
// Riders (drivers) / Passengers / Admins (superadmins and the
// admins of a TODA), followed by a scrollable list of account
// cards.
//
// HOW TO EDIT:
// - Account data comes from useAdminData('accounts'): the API in
//   the IndangGO app (GET /api/admin/accounts: for a superadmin,
//   passengers and drivers newest first, then the staff accounts),
//   or data/mockData.js when this runs on its own. Pull down to
//   refresh.
// - Filter options live in ROLE_FILTERS below — add a new one
//   there if you introduce another role. An admin (not a
//   superadmin) gets only their TODA's drivers, so the filters are
//   hidden for them.
// - Tapping a driver opens their review (DriverReviewScreen.js),
//   where they can be approved, declined, suspended, deleted or
//   unblocked;
//   a driver who isn't approved shows a Pending or Suspended
//   badge. Tapping a passenger or a staff account does nothing
//   yet.
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
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import useAdminData from '../useAdminData';
import StatusBadge from '../components/StatusBadge';
import TopHeader from '../components/TopHeader';
import LoadState, { RefreshError } from '../components/LoadState';
import { useAdminSession } from '../session';

// Filter chip options shown under the search bar, and the account
// roles each one shows (none: every account).
const ROLE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'RIDER', label: 'Drivers', roles: ['RIDER'] },
  { key: 'PASSENGER', label: 'Passengers', roles: ['PASSENGER'] },
  { key: 'ADMIN', label: 'Admins', roles: ['ADMIN', 'SUPERADMIN'] },
];

// Staff accounts: a superadmin (every TODA), or an admin of one TODA.
const isStaffAccount = (account) => account.role === 'ADMIN' || account.role === 'SUPERADMIN';
const staffScope = (account) => (account.role === 'SUPERADMIN' ? 'Every TODA' : account.toda || 'No TODA yet');

export default function AccountsScreen() {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('ALL');
  const { data, loading, refreshing, error, reload, refresh } = useAdminData('accounts');
  const accounts = data?.accounts;
  // An admin (not a superadmin) gets only their TODA's drivers, so there is
  // nothing to filter by role.
  const { admin } = useAdminSession();
  const oneToda = typeof admin.toda === 'string';

  // Recomputes only when the search text, filter, or the account
  // list itself changes.
  const filteredAccounts = useMemo(() => {
    return (accounts || []).filter((account) => {
      const roles = ROLE_FILTERS.find((filter) => filter.key === activeRoleFilter)?.roles;
      const matchesRole = !roles || roles.includes(account.role);

      const query = searchText.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        account.name.toLowerCase().includes(query) ||
        account.id.toLowerCase().includes(query);

      return matchesRole && matchesSearch;
    });
  }, [accounts, searchText, activeRoleFilter]);

  return (
    <View style={styles.screen}>
      <TopHeader title="Admin" />

      <View style={styles.content}>
        <Text style={styles.heading}>Manage Accounts</Text>

        {/* ---- Search bar ---- */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or mobile number..."
            placeholderTextColor={colors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {/* ---- Role filter chips (Drivers / Passengers / Admins) ---- */}
        {!oneToda && <View style={styles.filterRow}>
          {ROLE_FILTERS.map((filter) => {
            const isActive = activeRoleFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveRoleFilter(filter.key)}
              >
                <Text
                  style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>}

        {error && accounts && <RefreshError message={error} />}

        {/* ---- Account list ---- */}
        {!accounts ? <LoadState loading={loading} error={error} onRetry={reload} /> : (
        <FlatList
          data={filteredAccounts}
          keyExtractor={(item) => item.key ?? item.id}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {accounts.length > 0 ? 'No accounts match your search.' : oneToda ? 'No drivers in your TODA yet.' : 'No accounts yet.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.accountCard}
              onPress={item.role === 'RIDER' && item.key ? () => navigation.navigate('DriverReview', { key: item.key, name: item.name }) : () => {}}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={colors.textSecondary} />
              </View>

              <View style={styles.accountInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.approval && item.approval !== 'Approved' ? <StatusBadge label={item.approval} /> : null}
                  <StatusBadge label={item.role} />
                </View>
                <Text style={styles.accountId}>Mobile No#: {item.id}</Text>
                {item.email ? (
                  <View style={styles.emailRow}>
                    <Ionicons name="mail-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {item.email}
                    </Text>
                  </View>
                ) : null}
                {/* Drivers: their TODA and plate. */}
                {item.role === 'RIDER' ? (
                  <View style={styles.emailRow}>
                    <Ionicons name="car-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {[item.toda, item.plate].filter(Boolean).join(' · ') || 'No TODA or plate yet'}
                    </Text>
                  </View>
                ) : null}
                {/* Staff: the TODA they manage. */}
                {isStaffAccount(item) ? (
                  <View style={styles.emailRow}>
                    <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {staffScope(item)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusDotColor(item.status) },
                    ]}
                  />
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
        )}
      </View>
    </View>
  );
}

// Small helper to color the status dot next to each account's status text:
// green while the app is open, gray when offline.
function statusDotColor(status) {
  switch (status) {
    case 'Available':
    case 'Online':
      return colors.statusOngoing;
    default:
      return colors.statusInactive;
  }
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
    paddingBottom: 30,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 30,
    fontSize: 13,
  },
  accountCard: {
    flexDirection: 'row',
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
  },
  accountInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  accountName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  accountId: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  accountEmail: {
    fontSize: 11,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
