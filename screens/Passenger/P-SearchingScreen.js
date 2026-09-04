import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform, Animated } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

export default function SearchingScreen({ navigation, route }) {
  // Setup the animation value for the pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pickup = route?.params?.pickup || 'CvSU Main Campus';
  const destination = route?.params?.destination || 'Harasan Cuevas Compound';
  const passengers = route?.params?.passengers || 1;

  useEffect(() => {
    // Create an endless looping animation that expands and fades out
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 2, // Scales up to 2x its size
        duration: 1500, // 1.5 seconds per pulse
        useNativeDriver: true, // Optimizes performance
      })
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    // Automatically transition to the Active Ride screen after 4 seconds
    const timer = setTimeout(() => {
      navigation.replace('ActiveRide', { pickup, destination, passengers });
    }, 4000);
    return () => clearTimeout(timer);
  }, [destination, navigation, passengers, pickup]);

  // Exact coordinates for Cavite State University - Main Campus (Indang)
  const cvsuRegion = {
    latitude: 14.198758, 
    longitude: 120.881493,
    latitudeDelta: 0.02, 
    longitudeDelta: 0.02,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="bell" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Active Interactive Map */}
      <View style={styles.mapContainer}>
        <MapView 
          style={styles.map} 
          initialRegion={cvsuRegion}
          showsUserLocation={false} 
          pitchEnabled={false}
        >
          {/* Custom Pulsing "My Location" Marker at CvSU */}
          <Marker coordinate={{ latitude: 14.198758, longitude: 120.881493 }}>
            <View style={styles.markerContainer}>
              <Animated.View style={[styles.pulseRing, {
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 2],
                    outputRange: [0.8, 0] // Fades out as it gets bigger
                  })
              }]} />
              <View style={styles.coreDot} />
            </View>
          </Marker>
        </MapView>
      </View>

      {/* Main Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.dragIndicator} />
        
        {/* Animated/Searching Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="rickshaw" size={32} color="#095C37" />
          </View>
        </View>

        <Text style={styles.searchingTitle}>Searching for nearby drivers...</Text>
        <Text style={styles.searchingSub}>Finding the near tricycle for your trip{'\n'}on your area</Text>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.timelineContainer}>
            <MaterialCommunityIcons name="circle-slice-8" size={16} color="#095C37" />
            <View style={styles.timelineLine} />
            <MaterialCommunityIcons name="map-marker-outline" size={18} color="#967000" />
          </View>
          
          <View style={styles.detailsContainer}>
            <View>
              <Text style={styles.detailLabel}>PICKUP</Text>
              <Text style={styles.detailValue}>{pickup}</Text>
            </View>
            <View style={{ marginTop: 16, marginBottom: 16 }}>
              <Text style={styles.detailLabel}>DROP-OFF</Text>
              <Text style={styles.detailValue}>{destination}</Text>
            </View>
            <View style={styles.passengerRow}>
              <Feather name="users" size={16} color="#095C37" style={{ marginRight: 8 }} />
              <Text style={styles.passengerText}>Number of Passenger: {passengers}</Text>
            </View>
          </View>
        </View>

        {/* Cancel Section */}
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancel Request</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          Requesting a ride helps local drivers earn more.{'\n'}Please cancel only if necessary.
        </Text>
      </View>
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
  
  // Map Styles
  mapContainer: {
    height: '45%', 
    width: '100%',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // Custom Marker Animation Styles
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  pulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#095C37',
  },
  coreDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#095C37',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  // Bottom Sheet Styles
  bottomSheet: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30, 
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  dragIndicator: { width: 40, height: 4, backgroundColor: '#CCC', borderRadius: 2, marginBottom: 30 },
  
  iconContainer: {
    width: 90, height: 90,
    borderRadius: 45,
    backgroundColor: '#095C37',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 46, height: 46,
    borderRadius: 23,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchingTitle: { fontSize: 18, fontWeight: '700', color: '#095C37', marginBottom: 8 },
  searchingSub: { fontSize: 12, color: '#666', textAlign: 'center', lineHeight: 18, marginBottom: 24 },

  summaryCard: {
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
    width: '100%',
    padding: 16,
    flexDirection: 'row',
    marginBottom: 'auto',
  },
  timelineContainer: {
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 4,
  },
  timelineLine: {
    width: 1,
    height: 40,
    backgroundColor: '#CCC',
    marginVertical: 4,
  },
  detailsContainer: { flex: 1 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: '#666', marginBottom: 4 },
  detailValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  passengerText: { fontSize: 13, color: '#333', fontWeight: '500' },

  cancelBtn: {
    width: '100%',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E24B4A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelBtnText: { color: '#E24B4A', fontSize: 15, fontWeight: '700' },
  footerNote: { fontSize: 10, color: '#666', textAlign: 'center', lineHeight: 14, marginBottom: Platform.OS === 'ios' ? 20 : 10 },
});