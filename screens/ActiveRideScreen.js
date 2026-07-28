import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  Platform,
  Animated,
  PanResponder,
  Modal
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import BottomNav from '../components/BottomNav';

// Total downward translation distance when collapsed
const DRAG_RANGE = 220; 

export default function ActiveRideScreen({ navigation }) {
  const [secondsLeft, setSecondsLeft] = useState(40); // cancellation timer
  const [destinationSecondsLeft, setDestinationSecondsLeft] = useState(30); // destination reached timer
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Translation value (0 = Expanded, DRAG_RANGE = Collapsed)
  const translateY = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  // Violation countdown timer logic
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  // Destination reached trigger timer logic
  useEffect(() => {
    if (destinationSecondsLeft <= 0) {
      setShowDestinationModal(true);
      return;
    }

    const timer = setInterval(() => {
      setDestinationSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [destinationSecondsLeft]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Smooth Snap Helper
  const snapTo = (toValue, isCollapsedState) => {
    setIsCollapsed(isCollapsedState);
    lastOffset.current = toValue;
    
    Animated.spring(translateY, {
      toValue,
      velocity: 0.5,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  // PanResponder Gesture Handler
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        translateY.extractOffset();
      },
      onPanResponderMove: (_, gestureState) => {
        translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        
        if (gestureState.dy > 60 || gestureState.vy > 0.5) {
          snapTo(DRAG_RANGE, true); 
        } else if (gestureState.dy < -60 || gestureState.vy < -0.5) {
          snapTo(0, false); 
        } else {
          snapTo(lastOffset.current, isCollapsed); 
        }
      },
    })
  ).current;

  const cvsuRegion = {
    latitude: 14.198758, 
    longitude: 120.881493,
    latitudeDelta: 0.015, 
    longitudeDelta: 0.015,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="menu" size={24} color="#1C274C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="bell" size={24} color="#1C274C" />
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Full-Screen Map */}
        <MapView 
          style={StyleSheet.absoluteFillObject} 
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

        {/* Absolute Overlay Bottom Sheet */}
        <Animated.View 
          style={[
            styles.bottomSheet, 
            { transform: [{ translateY }] }
          ]}
        >
          {/* Draggable Touch Header */}
          <View style={styles.dragTouchArea} {...panResponder.panHandlers}>
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => snapTo(isCollapsed ? 0 : DRAG_RANGE, !isCollapsed)}
              style={styles.dragHandleWrapper}
            >
              <View style={styles.dragIndicator} />
            </TouchableOpacity>

            {/* Persistent Passenger Profile Row */}
            <View style={styles.profileRow}>
              <View style={styles.passengerCard}>
                <View style={styles.avatarContainer}>
                  <Feather name="user" size={24} color="#095C37" />
                </View>
                <View style={styles.passengerInfo}>
                  <Text style={styles.passengerName}>Jame Barrios</Text>
                  <Text style={styles.passengerStats}>★ 4.9 · 1.2k trips</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.chatButton}>
                <MaterialCommunityIcons name="message-processing-outline" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Collapsible Details Content */}
          <View style={styles.expandableContent}>
            {/* Pickup & Drop-Off Card */}
            <View style={styles.routeCard}>
              <View style={styles.timelineContainer}>
                <View style={styles.greenDot} />
                <View style={styles.timelineLine} />
                <MaterialCommunityIcons name="map-marker-outline" size={18} color="#967000" />
              </View>

              <View style={styles.routeTextContainer}>
                <View>
                  <Text style={styles.routeLabel}>PICKUP</Text>
                  <Text style={styles.routeLocation}>CvSU Main Campus</Text>
                </View>
                <View style={{ marginTop: 10, marginBottom: 10 }}>
                  <Text style={styles.routeLabel}>DROP-OFF</Text>
                  <Text style={styles.routeLocation}>Harasan Cuevas Compound</Text>
                </View>
                <View style={styles.passengerCountRow}>
                  <Feather name="users" size={16} color="#333" style={{ marginRight: 8 }} />
                  <Text style={styles.passengerCountText}>Number of Passenger: 1</Text>
                </View>
              </View>
            </View>

            {/* Auto-cancel Banner */}
            <View style={styles.noticeBanner}>
              <Feather name="info" size={16} color="#666" style={{ marginRight: 8 }} />
              <Text style={styles.noticeText}>
                The ride will auto-cancel and deduct{'\n'}
                in <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text> if the passenger does not show up.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* DESTINATION REACHED MODAL */}
        <Modal
          visible={showDestinationModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowDestinationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {/* Dark Green Banner Header */}
              <View style={styles.modalHeaderBanner}>
                <View style={styles.checkCircle}>
                  <Feather name="check" size={18} color="#095C37" />
                </View>
                <Text style={styles.modalHeaderTitle}>Destination Reached</Text>
              </View>

              {/* Modal Inner Content */}
              <View style={styles.modalBody}>
                {/* Fare Yellow Card */}
                <View style={styles.fareCard}>
                  <View style={styles.fareHeaderRow}>
                    <Text style={styles.fareLabel}>Estimated Fare</Text>
                    <View style={styles.infoBadge}>
                      <Feather name="info" size={10} color="#665300" style={{ marginRight: 3 }} />
                      <Text style={styles.infoBadgeText}>Includes base fare</Text>
                    </View>
                  </View>
                  <Text style={styles.fareAmount}>₱45.00</Text>
                </View>

                {/* Passenger Information */}
                <View style={styles.modalPassengerRow}>
                  <View style={styles.modalAvatarContainer}>
                    <Feather name="user" size={22} color="#095C37" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalPassengerName}>Jame Barrios</Text>
                    <Text style={styles.modalPassengerStats}>★ 4.9 · 1.2 km away</Text>
                  </View>
                  <MaterialCommunityIcons name="shield-check-outline" size={22} color="#095C37" />
                </View>

                {/* Route Summary Box */}
                <View style={styles.modalRouteBox}>
                  <View style={styles.timelineContainer}>
                    <View style={styles.greenRingDot} />
                    <View style={styles.modalTimelineLine} />
                    <MaterialCommunityIcons name="map-marker-outline" size={16} color="#8B6B00" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View>
                      <Text style={styles.routeLabel}>PICKUP</Text>
                      <Text style={styles.modalRouteLocation}>CvSU Main Campus</Text>
                    </View>
                    <View style={{ marginTop: 12, marginBottom: 12 }}>
                      <Text style={styles.routeLabel}>DROP-OFF</Text>
                      <Text style={styles.modalRouteLocation}>Harasan Cuevas Compound</Text>
                    </View>
                    <View style={styles.modalPassengerCountRow}>
                      <Feather name="users" size={15} color="#333" style={{ marginRight: 6 }} />
                      <Text style={styles.passengerCountText}>Number of Passenger: 1</Text>
                    </View>
                  </View>
                </View>

                {/* End Trip Action Button */}
                <TouchableOpacity 
                  style={styles.endTripBtn} 
                  onPress={() => {
                    setShowDestinationModal(false);
                    navigation.replace('Passenger');
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="flag-outline" size={20} color="#4A3B00" style={{ marginRight: 8 }} />
                  <Text style={styles.endTripBtnText}>End Trip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>

      {/* Bottom Navigation */}
      <BottomNav active="bookings" navigation={navigation} />
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#095C37',
  },
  mainContent: {
    flex: 1,
    position: 'relative',
  },

  /* Map Marker Styling */
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

  /* Overlay Bottom Sheet Styling */
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 10,
  },
  dragTouchArea: {
    paddingBottom: 4,
  },
  dragHandleWrapper: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dragIndicator: {
    width: 44,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginBottom: 8,
  },

  /* Passenger Card */
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  passengerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAEAEA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  passengerInfo: {
    justifyContent: 'center',
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
  },
  passengerStats: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  chatButton: {
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: '#2D5A34',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Expandable Route Details */
  expandableContent: {
    paddingTop: 2,
  },
  routeCard: {
    backgroundColor: '#F4F5F7',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    marginBottom: 10,
  },
  timelineContainer: {
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
  timelineLine: {
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
    fontSize: 13,
    fontWeight: '600',
    color: '#222222',
    marginTop: 2,
  },
  passengerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  passengerCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333333',
  },

  /* Notice Banner */
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8D8D8',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FAFAFA',
  },
  noticeText: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 15,
  },
  timerText: {
    fontWeight: '700',
    color: '#333333',
  },

  /* Destination Reached Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeaderBanner: {
    backgroundColor: '#2D5A34',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBody: {
    padding: 16,
  },
  fareCard: {
    backgroundColor: '#F5D742',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  fareHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A3B00',
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoBadgeText: {
    fontSize: 10,
    color: '#4A3B00',
    fontWeight: '500',
  },
  fareAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#222222',
    marginTop: 4,
  },
  modalPassengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAEAEA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modalPassengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
  },
  modalPassengerStats: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  modalRouteBox: {
    backgroundColor: '#F7F8FA',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    marginBottom: 16,
  },
  greenRingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#095C37',
    backgroundColor: '#FFF',
  },
  modalTimelineLine: {
    width: 1,
    height: 36,
    backgroundColor: '#CCC',
    marginVertical: 4,
  },
  modalRouteLocation: {
    fontSize: 13,
    fontWeight: '700',
    color: '#222222',
    marginTop: 2,
  },
  modalPassengerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
  },
  endTripBtn: {
    backgroundColor: '#F5D742',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTripBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3B3000',
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666666',
    textAlign: 'center',
    marginBottom: 12,
  },
});