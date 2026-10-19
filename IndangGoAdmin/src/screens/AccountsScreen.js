// =============================================================
// screens/AccountsScreen.js
// -------------------------------------------------------------
// "Manage Accounts" screen: search bar (searches by name or ID)
// + a filter row to show All / Riders (drivers) / Passengers,
// followed by a scrollable list of account cards.
//
// HOW TO EDIT:
// - Account data comes from data/mockData.js (accounts array).
// - Filter options live in ROLE_FILTERS below — add a new one
//   there if you introduce another role.
// - Tapping an account row is non-functional right now (onPress
//   is a no-op) — hook up a details screen there later.
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
import { accounts } from '../data/mockData';
import StatusBadge from '../components/StatusBadge';
import TopHeader from '../components/TopHeader';

// Filter chip options shown under the search bar.
const ROLE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'RIDER', label: 'Drivers' },
  { key: 'PASSENGER', label: 'Passengers' },
];

export default function AccountsScreen() {
  const [searchText, setSearchText] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('ALL');

  // Recomputes only when the search text, filter, or the account
  // list itself changes — cheap for this size of mock data, but
  // useMemo keeps it efficient if the list grows.
  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const matchesRole =
        activeRoleFilter === 'ALL' || account.role === activeRoleFilter;

      const query = searchText.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        account.name.toLowerCase().includes(query) ||
        account.id.toLowerCase().includes(query);

      return matchesRole && matchesSearch;
    });
  }, [searchText, activeRoleFilter]);

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
            placeholder="Search users by name or ID..."
            placeholderTextColor={colors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {/* ---- Role filter chips (Drivers / Passengers) ---- */}
        <View style={styles.filterRow}>
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
        </View>

        {/* ---- Account list ---- */}
        <FlatList
          data={filteredAccounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No accounts match your search.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.accountCard} onPress={() => {}} activeOpacity={0.7}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={colors.textSecondary} />
              </View>

              <View style={styles.accountInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <StatusBadge label={item.role} />
                </View>
                <Text style={styles.accountId}>ID: {item.id}</Text>
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
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
      </View>

      {/* ---- Floating "add account" button (non-functional) ---- */}
      <TouchableOpacity style={styles.fab} onPress={() => {}} activeOpacity={0.85}>
        <Ionicons name="person-add" size={22} color={colors.textOnDark} />
      </TouchableOpacity>
    </View>
  );
}

// Small helper to color the status dot next to each account's status text.
function statusDotColor(status) {
  switch (status) {
    case 'Active':
    case 'Verified':
      return colors.statusVerified;
    case 'Blocked':
      return colors.statusBlocked;
    case 'Pending Docs':
      return colors.statusPending;
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
    paddingBottom: 100, // leave room above the bottom nav + FAB
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100, // sits above the bottom nav
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandYellow,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
