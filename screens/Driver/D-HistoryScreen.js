import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../../components/BottomNav';

const rideHistory = [
  {
    id: 1,
    type: 'Standard Trike',
    date: 'Oct 24, 2023 • 02:45 PM',
    status: 'Completed',
    from: 'CvSU Main Campus',
    to: 'Harasan Cuevas Compound',
    fare: '₱45.00',
    route: 'CvSU Main Campus → Harasan Cuevas Compound',
    passenger: 'Juan Dela Cruz',
    notes: 'Ride completed on time with no issues.',
  },
  {
    id: 2,
    type: 'Standard Trike',
    date: 'Oct 20, 2023 • 08:10 AM',
    status: 'Cancelled',
    from: 'Barangay Hall',
    to: 'CvSU Main Campus',
    fare: '₱25.00',
    route: 'Barangay Hall → CvSU Main Campus',
    passenger: 'Mark Reyes',
    notes: 'Ride was cancelled before pickup by the passenger.',
  },
  {
    id: 3,
    type: 'Standard Trike',
    date: 'Oct 18, 2023 • 05:40 PM',
    status: 'Completed',
    from: 'Public Market',
    to: 'Alulod',
    fare: '₱60.00',
    route: 'Public Market → Alulod',
    passenger: 'Ramon Santos',
    notes: 'Ride was delivered cleanly and on schedule.',
  },
];

const filterOptions = [
  { key: 'all', label: 'All Rides' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const getStatusStyle = (status) => {
  if (status === 'Completed') {
    return {
      badge: styles.completedBadge,
      text: styles.completedText,
      dotColor: '#095C37',
    };
  }

  return {
    badge: styles.cancelledBadge,
    text: styles.cancelledText,
    dotColor: '#D93025',
  };
};

export default function HistoryScreen({ navigation }) {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [expandedRideId, setExpandedRideId] = useState(rideHistory[0].id);

  const filteredRides = useMemo(() => {
    if (selectedFilter === 'all') return rideHistory;
    return rideHistory.filter((ride) => ride.status.toLowerCase() === selectedFilter);
  }, [selectedFilter]);

  const toggleDetails = (rideId) => {
    setExpandedRideId((currentId) => (currentId === rideId ? null : rideId));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="bell" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Ride History</Text>
        <Text style={styles.pageSub}>Review your past tricycle journeys.</Text>

        <View style={styles.filterRow}>
          {filterOptions.map((filter) => {
            const isActive = selectedFilter === filter.key;

            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedFilter(filter.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {filteredRides.length === 0 ? (
          <Text style={styles.emptyState}>No rides found for this filter.</Text>
        ) : (
          filteredRides.map((ride) => {
            const statusStyle = getStatusStyle(ride.status);
            const isExpanded = expandedRideId === ride.id;

            return (
              <View key={ride.id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.rideIconBg}>
                    <MaterialCommunityIcons name="rickshaw" size={20} color="#095C37" />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <View style={styles.titleRow}>
                      <Text style={styles.rideTitle}>{ride.type}</Text>
                      <View style={[styles.statusBadge, statusStyle.badge]}>
                        <Text style={[styles.statusText, statusStyle.text]}>{ride.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.rideDate}>{ride.date}</Text>
                  </View>
                </View>

                <View style={styles.routeContainer}>
                  <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: statusStyle.dotColor }]} />
                    <Text style={styles.routeText}>{ride.from}</Text>
                  </View>
                  <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: '#967000' }]} />
                    <Text style={styles.routeText}>{ride.to}</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.fareLabel}>TOTAL FARE</Text>
                    <Text style={styles.fareAmount}>{ride.fare}</Text>
                  </View>
                  <TouchableOpacity style={styles.detailBtn} onPress={() => toggleDetails(ride.id)}>
                    <Text style={styles.detailBtnText}>{isExpanded ? 'Hide Details' : 'View Details'}</Text>
                  </TouchableOpacity>
                </View>

                {isExpanded && (
                  <View style={styles.detailsPanel}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Route</Text>
                      <Text style={styles.detailValue}>{ride.route}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Passenger</Text>
                      <Text style={styles.detailValue}>{ride.passenger}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Note</Text>
                      <Text style={styles.detailValue}>{ride.notes}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <BottomNav active="history" navigation={navigation} homeRoute="Driver" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'android' ? 20 : 10,
  },
  headerSpacer: { width: 24, height: 24 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#095C37' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#333' },
  pageSub: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 20 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0' },
  filterChipActive: { backgroundColor: '#FFD700' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#666' },
  filterTextActive: { color: '#333' },
  historyCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  rideIconBg: { backgroundColor: '#E1F5EE', padding: 10, borderRadius: 10 },
  cardHeaderText: { flex: 1, marginLeft: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rideTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  rideDate: { fontSize: 12, color: '#666', marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  completedBadge: { backgroundColor: '#E1F5EE' },
  cancelledBadge: { backgroundColor: '#FDECEC' },
  statusText: { fontSize: 10, fontWeight: '700' },
  completedText: { color: '#095C37' },
  cancelledText: { color: '#D93025' },
  routeContainer: { marginLeft: 44, marginBottom: 16 },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 12 },
  routeText: { fontSize: 13, color: '#333' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 16 },
  fareLabel: { fontSize: 10, fontWeight: '700', color: '#999', marginBottom: 2 },
  fareAmount: { fontSize: 16, fontWeight: '700', color: '#095C37' },
  detailBtn: { borderWidth: 1, borderColor: '#095C37', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  detailBtnText: { fontSize: 12, fontWeight: '600', color: '#095C37' },
  detailsPanel: { marginTop: 16, backgroundColor: '#F7F9F8', borderRadius: 12, padding: 12 },
  detailRow: { marginBottom: 10 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: '#777', marginBottom: 4, textTransform: 'uppercase' },
  detailValue: { fontSize: 12, color: '#333', lineHeight: 18 },
  emptyState: { fontSize: 14, color: '#666', textAlign: 'center', paddingVertical: 20 },
}); 