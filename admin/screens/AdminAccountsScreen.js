// =============================================================
// admin/screens/AdminAccountsScreen.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from AccountsScreen.js.
// =============================================================

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import adminColors from '../theme/adminColors';
import { accounts } from '../data/adminMockData';
import AdminStatusBadge from '../components/AdminStatusBadge';
import AdminTopHeader from '../components/AdminTopHeader';

const ROLE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'RIDER', label: 'Drivers' },
  { key: 'PASSENGER', label: 'Passengers' },
];

export default function AdminAccountsScreen() {
  const [searchText, setSearchText] = useState('');
  const [activeRoleFilter, setActiveRoleFilter] = useState('ALL');

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const matchesRole = activeRoleFilter === 'ALL' || account.role === activeRoleFilter;
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
      <AdminTopHeader title="Admin" />
      <View style={styles.content}>
        <Text style={styles.heading}>Manage Accounts</Text>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={adminColors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users by name or ID..."
            placeholderTextColor={adminColors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.filterRow}>
          {ROLE_FILTERS.map((filter) => {
            const isActive = activeRoleFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveRoleFilter(filter.key)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={filteredAccounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No accounts match your search.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.accountCard} onPress={() => {}} activeOpacity={0.7}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={adminColors.textSecondary} />
              </View>
              <View style={styles.accountInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.accountName} numberOfLines={1}>{item.name}</Text>
                  <AdminStatusBadge label={item.role} />
                </View>
                <Text style={styles.accountId}>ID: {item.id}</Text>
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={12} color={adminColors.textSecondary} />
                  <Text style={styles.accountEmail} numberOfLines={1}>{item.email}</Text>
                </View>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusDotColor(item.status) }]} />
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>

      <TouchableOpacity style={styles.fab} onPress={() => {}} activeOpacity={0.85}>
        <Ionicons name="person-add" size={22} color={adminColors.textOnDark} />
      </TouchableOpacity>
    </View>
  );
}

function statusDotColor(status) {
  switch (status) {
    case 'Active':
    case 'Verified':
      return adminColors.statusVerified;
    case 'Blocked':
      return adminColors.statusBlocked;
    case 'Pending Docs':
      return adminColors.statusPending;
    default:
      return adminColors.statusInactive;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminColors.background },
  content: { flex: 1, paddingHorizontal: 20 },
  heading: { fontSize: 24, fontWeight: '800', color: adminColors.textPrimary, marginBottom: 16 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: adminColors.card,
    borderWidth: 1, borderColor: adminColors.border, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: adminColors.textPrimary },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: adminColors.card,
    borderWidth: 1, borderColor: adminColors.border,
  },
  filterChipActive: { backgroundColor: adminColors.brandYellow, borderColor: adminColors.brandYellow },
  filterChipText: { fontSize: 12, fontWeight: '600', color: adminColors.textSecondary },
  filterChipTextActive: { color: adminColors.brandGreenDark },
  listContent: { paddingTop: 12, paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: adminColors.textSecondary, marginTop: 30, fontSize: 13 },
  accountCard: {
    flexDirection: 'row', backgroundColor: adminColors.card, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: adminColors.border,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: adminColors.background,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  accountInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  accountName: { flex: 1, fontSize: 14, fontWeight: '700', color: adminColors.textPrimary },
  accountId: { fontSize: 11, color: adminColors.textSecondary, marginTop: 2 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  accountEmail: { fontSize: 11, color: adminColors.textSecondary, flexShrink: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, color: adminColors.textSecondary, fontWeight: '600' },
  fab: {
    position: 'absolute', right: 20, bottom: 100, width: 52, height: 52, borderRadius: 26,
    backgroundColor: adminColors.brandYellow, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
});
