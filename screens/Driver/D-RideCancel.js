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
  ScrollView
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import BottomNav from '../../components/BottomNav';

const DRAG_RANGE = 220; 

export default function ActiveRideScreen({ navigation }) {
  const [isCancelled, setIsCancelled] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const translateY = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  useEffect(() => {
    setIsCancelled(true);
  }, []);

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
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="bell" size={24} color="#1C274C" />
        </TouchableOpacity>
      </View>

      {/* CONDITIONAL RENDER: Cancelled Screen vs Active Map Screen */}
      {isCancelled ? (
        <ScrollView contentContainerStyle={styles.cancelledContainer} showsVerticalScrollIndicator={false}>
          {/* Top Cancelled Badge Icon */}
          <View style={styles.badgeContainer}>
            <MaterialCommunityIcons name="rickshaw" size={32} color="#83D68B" />
          </View>

          <Text style={styles.cancelledTitle}>Ride Cancelled</Text>

          {/* Trip Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons name="text-box-outline" size={20} color="#333" />
              <Text style={styles.summaryHeaderText}>Trip Summary</Text>
            </View>

            <View style={styles.passengerRow}>
              <Feather name="user" size={18} color="#333" style={{ marginRight: 10 }} />
              <View>
                <Text style={styles.summaryLabel}>Passenger</Text>
                <Text style={styles.summaryValueBold}>Jame Barrios</Text>
              </View>
            </View>

            {/* Route Timeline */}
            <View style={styles.timelineRow}>
              <View style={styles.timelineContainer}>
                <View style={styles.greenDot} />
                <View style={styles.dottedLine} />
                <View style={styles.amberDot} />
              </View>

              <View style={styles.routeTextContainer}>
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.summaryLabel}>Pickup</Text>
                  <Text style={styles.summaryValue}>CvSU Main Campus Gate</Text>
                </View>
                <View>
                  <Text style={styles.summaryLabel}>Destination</Text>
                  <Text style={styles.summaryValue}>Harasan Cuevas Compound</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.transactionRow}>
              <Text style={styles.transactionLabel}>Transaction ID</Text>
              <Text style={styles.transactionValue}>#CANC-293848</Text>
            </View>
          </View>

          {/* Back to Home Button */}
          <TouchableOpacity 
            style={styles.backHomeBtn} 
            onPress={() => navigation.replace('Driver')}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={20} color="#2D5A34" style={{ marginRight: 8 }} />
            <Text style={styles.backHomeText}>Back to Home</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* Active Map View */
        <View style={styles.mainContent}>
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

          <Animated.View 
            style={[
              styles.bottomSheet, 
              { transform: [{ translateY }] }
            ]}
          >
            <View style={styles.dragTouchArea}>
              <TouchableOpacity 
                activeOpacity={0.8} 
                onPress={() => snapTo(isCollapsed ? 0 : DRAG_RANGE, !isCollapsed)}
                style={styles.dragHandleWrapper}
                {...panResponder.panHandlers}
              >
                <View style={styles.dragIndicator} />
              </TouchableOpacity>

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

                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => navigation.navigate('Messaging')}
                >
                  <MaterialCommunityIcons name="message-processing-outline" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.expandableContent}>
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

              <View style={styles.noticeBanner}>
                <Feather name="info" size={16} color="#666" style={{ marginRight: 8 }} />
                <Text style={styles.noticeText}>
                  The ride will auto-cancel and deduct if the passenger does not show up.
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>
      )}

      {!isCancelled && (
        <BottomNav active="home" navigation={navigation} homeRoute="Driver" />
      )}
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

  /* Active Ride Screen Map & Sheet Styles */
  mainContent: {
    flex: 1,
    position: 'relative',
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
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#095C37',
  },
  amberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8B6B00',
  },
  timelineLine: {
    width: 1,
    height: 32,
    backgroundColor: '#CCC',
    marginVertical: 4,
  },
  dottedLine: {
    width: 1,
    height: 28,
    borderWidth: 1,
    borderColor: '#CCC',
    borderStyle: 'dashed',
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

  /* Ride Cancelled Screen Styles */
  cancelledContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  badgeContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2D5A34',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cancelledTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 24,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginLeft: 8,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#777',
    fontWeight: '500',
  },
  summaryValueBold: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginTop: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#EAEAEA',
    marginVertical: 14,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  transactionValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
  },
  cancellationFeeBox: {
    width: '100%',
    backgroundColor: '#FFF8D6',
    borderWidth: 1,
    borderColor: '#EAD170',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  feeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#715A00',
    marginBottom: 6,
  },
  feeDescription: {
    fontSize: 12,
    color: '#665300',
    lineHeight: 18,
  },
  backHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  backHomeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D5A34',
  },
});