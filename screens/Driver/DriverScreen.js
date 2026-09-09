import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, MaterialIcons, Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import BottomNav from '../../components/BottomNav';
import * as SecureStore from 'expo-secure-store';
import { createSocket } from '../../services/socket';

export default function DriverHomeScreen({ navigation }) {
  const [isOnline, setIsOnline] = useState(true);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const socketRef = useRef(null);
  const [driverProfile, setDriverProfile] = useState({});

  // Exact coordinates for Cavite State University - Main Campus (Indang)
  const cvsuRegion = {
    latitude: 14.198758, 
    longitude: 120.881493,
    latitudeDelta: 0.02, 
    longitudeDelta: 0.02,
  };

  useEffect(() => {
    let isMounted = true;
    const connectDriver = async () => {
      if (!isOnline) {
        setIncomingRequest(null);
        return;
      }

      const savedProfile = await SecureStore.getItemAsync('indang_user_profile');
      const profile = savedProfile ? JSON.parse(savedProfile) : {};
      if (!isMounted) return;
      setDriverProfile(profile);

      const socket = createSocket({ role: 'driver', userId: profile.id });
      socketRef.current = socket;
      socket.on('ride:request', (request) => {
        if (isMounted) setIncomingRequest(request);
      });
      socket.on('ride:cancelled', ({ rideId }) => {
        if (isMounted && rideId === incomingRequest?.id) setIncomingRequest(null);
      });
      socket.connect();
    };

    connectDriver();

    return () => {
      isMounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIncomingRequest(null);
    };
  }, [isOnline]);

  const handleAccept = () => {
    socketRef.current?.emit('ride:accept', {
      rideId: incomingRequest.id,
      driverId: driverProfile.id,
      driverName: `${driverProfile.firstName || ''} ${driverProfile.lastName || ''}`.trim(),
    });
    setIncomingRequest(null);
    navigation.replace('DriverActiveRide', incomingRequest);
  };

  const handleDecline = () => {
    socketRef.current?.emit('ride:decline', { rideId: incomingRequest.id });
    setIncomingRequest(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="user" size={24} color="#1C274C" />
        </TouchableOpacity>
      </View>

      {/* Main Map Area */}
      <View style={styles.mapContainer}>
        <MapView 
          style={styles.map} 
          initialRegion={cvsuRegion}
          showsUserLocation={true} 
          pitchEnabled={false}
        >
          <Marker coordinate={{ latitude: 14.198758, longitude: 120.881493 }}>
            <View style={styles.markerContainer}>
              <View style={styles.coreDot} />
            </View>
          </Marker>
        </MapView>

        {/* Top Status Toggle Pill */}
        <TouchableOpacity 
          style={styles.statusPill} 
          activeOpacity={0.8}
          onPress={() => setIsOnline(!isOnline)}
        >
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#095C37' : '#999' }]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </TouchableOpacity>

        {/* Floating Map Action Buttons */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapControlBtn}>
            <MaterialIcons name="my-location" size={22} color="#095C37" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapControlBtn}>
            <Ionicons name="layers-outline" size={22} color="#095C37" />
          </TouchableOpacity>
        </View>

        {/* Dynamic Incoming Request Overlay Card */}
        {incomingRequest && (
          <View style={styles.requestCardOverlay}>
            <View style={styles.requestCard}>
              
              {/* Header Banner */}
              <View style={styles.cardHeaderBanner}>
                <View style={styles.headerIconCircle}>
                  <MaterialCommunityIcons name="rickshaw" size={22} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.headerBannerTitle}>Incoming Request</Text>
                  <Text style={styles.headerBannerSub}>Quickly accept to start the trip</Text>
                </View>
              </View>

              <View style={styles.cardContent}>
                {/* Estimated Fare Box */}
                <View style={styles.fareBox}>
                  <View>
                    <Text style={styles.fareLabel}>Estimated Fare</Text>
                    <Text style={styles.fareAmount}>{incomingRequest.fare}</Text>
                  </View>
                  <View style={styles.fareNoteContainer}>
                    <Feather name="info" size={14} color="#555" style={{ marginRight: 4 }} />
                    <Text style={styles.fareNote}>Includes base fare</Text>
                  </View>
                </View>

                {/* Passenger Info Row */}
                <View style={styles.passengerProfileRow}>
                  <View style={styles.avatarContainer}>
                    <Feather name="user" size={24} color="#095C37" />
                  </View>
                  <View style={styles.passengerDetails}>
                    <Text style={styles.passengerName}>{incomingRequest.passengerName}</Text>
                    <Text style={styles.passengerSub}>
                      ★ {incomingRequest.rating} · {incomingRequest.distance}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="shield-check" size={22} color="#095C37" />
                </View>

                {/* Pickup & Drop-off Route Details */}
                <View style={styles.routeCard}>
                  <View style={styles.routeTimeline}>
                    <View style={styles.greenDot} />
                    <View style={styles.timelineDash} />
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color="#967000" />
                  </View>

                  <View style={styles.routeTextContainer}>
                    <View>
                      <Text style={styles.routeLabel}>PICKUP</Text>
                      <Text style={styles.routeLocation}>{incomingRequest.pickup}</Text>
                    </View>
                    <View style={{ marginTop: 12, marginBottom: 12 }}>
                      <Text style={styles.routeLabel}>DROP-OFF</Text>
                      <Text style={styles.routeLocation}>{incomingRequest.dropoff}</Text>
                    </View>
                    <View style={styles.passengerCountRow}>
                      <Feather name="users" size={16} color="#333" style={{ marginRight: 8 }} />
                      <Text style={styles.passengerCountText}>
                        Number of Passenger: {incomingRequest.passengers}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
                  <Text style={styles.acceptBtnText}>Accept Request</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        )}
      </View>

      {/* Bottom Navigation - Now Active on Home */}
      <BottomNav active="home" navigation={navigation} homeRoute="Driver" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'android' ? 16 : 12,
    backgroundColor: '#FAFAFA',
    zIndex: 10,
  },
  headerSpacer: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#095C37',
  },

  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
  },
  coreDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#095C37',
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 4,
  },

  statusPill: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    elevation: 4,
    zIndex: 5,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },

  mapControls: {
    position: 'absolute',
    right: 20,
    top: 90,
    zIndex: 5,
  },
  mapControlBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 3,
  },

  /* Request Card Styling */
  requestCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  requestCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  cardHeaderBanner: {
    backgroundColor: '#095C37',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerBannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerBannerSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  cardContent: {
    padding: 18,
  },

  /* Fare Box */
  fareBox: {
    backgroundColor: '#FFDC52',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fareLabel: {
    fontSize: 12,
    color: '#555555',
    fontWeight: '500',
  },
  fareAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#222222',
  },
  fareNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fareNote: {
    fontSize: 11,
    color: '#444444',
  },

  /* Passenger Info */
  passengerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EAEAEA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222222',
  },
  passengerSub: {
    fontSize: 13,
    color: '#666666',
    marginTop: 2,
  },

  /* Route Details Box */
  routeCard: {
    backgroundColor: '#F4F5F7',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    marginBottom: 20,
  },
  routeTimeline: {
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 4,
  },
  greenDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#095C37',
    backgroundColor: '#FFF',
  },
  timelineDash: {
    width: 1,
    height: 32,
    backgroundColor: '#CCC',
    marginVertical: 4,
  },
  routeTextContainer: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#777777',
  },
  routeLocation: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    marginTop: 2,
  },
  passengerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  passengerCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
  },

  /* Buttons */
  acceptBtn: {
    backgroundColor: '#FFDC52',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
  },
  declineBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555555',
  },
});