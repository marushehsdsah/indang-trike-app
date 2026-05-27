import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../components/BottomNav';

export default function HistoryScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="menu" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="bell" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Ride History</Text>
        <Text style={styles.pageSub}>Review your past tricycle journeys.</Text>

        {/* Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]}>
            <Text style={[styles.filterText, styles.filterTextActive]}>All Rides</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Completed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <Text style={styles.filterText}>Cancelled</Text>
          </TouchableOpacity>
        </View>

        {/* History Card */}
        <View style={styles.historyCard}>
          <View style={styles.cardHeader}>
            <View style={styles.rideIconBg}>
              <MaterialCommunityIcons name="rickshaw" size={20} color="#095C37" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.rideTitle}>Standard Trike</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>Completed</Text>
                </View>
              </View>
              <Text style={styles.rideDate}>Oct 24, 2023 • 02:45 PM</Text>
            </View>
          </View>

          <View style={styles.routeContainer}>
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: '#095C37' }]} />
              <Text style={styles.routeText}>CvSU Main Campus</Text>
            </View>
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: '#967000' }]} />
              <Text style={styles.routeText}>Harasan Cuevas Compound</Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <View>
              <Text style={styles.fareLabel}>TOTAL FARE</Text>
              <Text style={styles.fareAmount}>₱45.00</Text>
            </View>
            <TouchableOpacity style={styles.rebookBtn}>
              <Text style={styles.rebookText}>Rebook Ride</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      <BottomNav active="history" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingVertical: Platform.OS === 'android' ? 20 : 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#095C37' },
  
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#333' },
  pageSub: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 20 },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0' },
  filterChipActive: { backgroundColor: '#FFD700' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#666' },
  filterTextActive: { color: '#333' },

  historyCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  rideIconBg: { backgroundColor: '#E1F5EE', padding: 10, borderRadius: 10 },
  rideTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  rideDate: { fontSize: 12, color: '#666', marginTop: 4 },
  statusBadge: { backgroundColor: '#E1F5EE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700', color: '#095C37' },

  routeContainer: { marginLeft: 44, marginBottom: 20 },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 12 },
  routeText: { fontSize: 13, color: '#333' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 16 },
  fareLabel: { fontSize: 10, fontWeight: '700', color: '#999', marginBottom: 2 },
  fareAmount: { fontSize: 16, fontWeight: '700', color: '#095C37' },
  rebookBtn: { borderWidth: 1, borderColor: '#095C37', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  rebookText: { fontSize: 12, fontWeight: '600', color: '#095C37' },
});