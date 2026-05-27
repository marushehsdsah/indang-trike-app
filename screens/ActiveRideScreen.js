import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import BottomNav from '../components/BottomNav';


export default function ActiveRideScreen({ navigation }) {
  // Prototype State Machine: 0 = Heading to Pickup, 1 = In Transit, 2 = Destination Reached
  const [rideState, setRideState] = useState(0);

  const cycleRideState = () => {
    if (rideState < 2) setRideState(rideState + 1);
  };

  const completeRide = () => {
    navigation.navigate('History', { newRide: true });
  };

  const getStatusConfig = () => {
    switch (rideState) {
      case 0: return { text: 'Heading to Pickup', color: '#095C37', dot: '#FFD700' };
      case 1: return { text: 'Heading to Destination', color: '#095C37', dot: '#378ADD' };
      case 2: return { text: 'Destination Reached', color: '#095C37', dot: '#4ade80' };
      default: return { text: 'Heading to Pickup', color: '#095C37', dot: '#FFD700' };
    }
  };

  const status = getStatusConfig();
  const isCompleteEnabled = rideState === 2;

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

      {/* Interactive Map */}
      <View style={styles.mapContainer}>
        <MapView 
          style={styles.map} 
          initialRegion={{ latitude: 14.1953, longitude: 120.8767, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          pitchEnabled={false}
        >
          <Marker coordinate={{ latitude: 14.1953, longitude: 120.8767 }}>
            <MaterialCommunityIcons name="map-marker" size={40} color="#378ADD" />
          </Marker>
        </MapView>

        {/* Floating Status Pill (Tap to simulate ride progress) */}
        <TouchableOpacity style={styles.statusPill} onPress={cycleRideState} activeOpacity={0.8}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={styles.statusText}>{status.text}</Text>
        </TouchableOpacity>
      </View>

      {/* Expanded Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.dragIndicator} />
          
          {/* Driver Info Header */}
          <View style={styles.driverHeader}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarPlaceholder}>
                <MaterialCommunityIcons name="account" size={32} color="#FFF" />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.driverName}>Kuya Virgilio</Text>
                <Text style={styles.driverStats}>★ 4.9 • 1.2k trips</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.chatBtn}>
              <MaterialCommunityIcons name="message-processing-outline" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Vehicle Details */}
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>TODA REGISTRATION NUMBER</Text>
            <Text style={styles.detailValue}>TODA-1235</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>TRICYCLE PLATE NUMBER</Text>
            <Text style={styles.detailValue}>CVSU-1992</Text>
          </View>


          {/* Route Summary */}
          <View style={styles.routeCard}>
            <View style={styles.timelineContainer}>
              <MaterialCommunityIcons name="circle-slice-8" size={16} color="#095C37" />
              <View style={styles.timelineLine} />
              <MaterialCommunityIcons name="map-marker-outline" size={18} color="#967000" />
            </View>
            <View style={styles.detailsContainer}>
              <View>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeValue}>CvSU Main Campus</Text>
              </View>
              <View style={{ marginTop: 16, marginBottom: 16 }}>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeValue}>Harasan Cuevas Compound</Text>
              </View>
              <View style={styles.passengerRow}>
                <Feather name="users" size={16} color="#095C37" style={{ marginRight: 8 }} />
                <Text style={styles.passengerText}>Number of Passenger: 1</Text>
              </View>
            </View>
          </View>

          {/* Fare */}
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>ESTIMATED FARE</Text>
            <Text style={styles.fareAmount}>₱45.00</Text>
          </View>

          {/* Dynamic Buttons */}
          <TouchableOpacity 
            style={[styles.completeBtn, !isCompleteEnabled && styles.completeBtnDisabled]} 
            disabled={!isCompleteEnabled}
            onPress={completeRide}
          >
            <Text style={[styles.completeBtnText, !isCompleteEnabled && styles.completeBtnTextDisabled]}>
              Complete Booking
            </Text>
          </TouchableOpacity>

          {rideState < 2 ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.navigate('Passenger')}>
              <Text style={styles.cancelBtnText}>Cancel Ride</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.reportBtn}>
              <Text style={styles.reportBtnText}>Report Driver</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </View>
      <BottomNav active="bookings" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingVertical: Platform.OS === 'android' ? 20 : 10,
    backgroundColor: '#F8F9FA', zIndex: 10
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#095C37' },
  
  mapContainer: { flex: 1, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  
  statusPill: {
    position: 'absolute', top: 20, alignSelf: 'center',
    backgroundColor: '#095C37', borderRadius: 20,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  bottomSheet: {
    height: '60%', backgroundColor: '#FFF',
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    marginTop: -20, paddingHorizontal: 24, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 15,
  },
  dragIndicator: { width: 40, height: 4, backgroundColor: '#CCC', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  
  driverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#095C37', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 16, fontWeight: '700', color: '#333' },
  driverStats: { fontSize: 12, color: '#666', marginTop: 2 },
  chatBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#095C37', alignItems: 'center', justifyContent: 'center' },

  detailBlock: { marginBottom: 16 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: '#999', marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  
  docVerificationBox: { borderWidth: 1, borderColor: '#EEE', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },

  routeCard: { backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16, flexDirection: 'row', marginBottom: 20 },
  timelineContainer: { alignItems: 'center', marginRight: 12, paddingTop: 4 },
  timelineLine: { width: 1, height: 40, backgroundColor: '#CCC', marginVertical: 4 },
  detailsContainer: { flex: 1 },
  routeLabel: { fontSize: 10, fontWeight: '700', color: '#999', marginBottom: 4 },
  routeValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  passengerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  passengerText: { fontSize: 13, color: '#333', fontWeight: '500' },

  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  fareLabel: { fontSize: 11, fontWeight: '700', color: '#999' },
  fareAmount: { fontSize: 18, fontWeight: '700', color: '#095C37' },

  completeBtn: { backgroundColor: '#FFD700', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  completeBtnText: { color: '#333', fontSize: 15, fontWeight: '700' },
  completeBtnDisabled: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD' },
  completeBtnTextDisabled: { color: '#999' },

  cancelBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E24B4A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { color: '#E24B4A', fontSize: 15, fontWeight: '700' },

  reportBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#095C37', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  reportBtnText: { color: '#095C37', fontSize: 15, fontWeight: '700' },
});