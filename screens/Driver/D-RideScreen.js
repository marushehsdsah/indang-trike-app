// D-RideScreen.js

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
  Modal,
  TextInput,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import BottomNav from '../../components/BottomNav';

// Total downward translation distance when collapsed
const DRAG_RANGE = 220;

export default function ActiveRideScreen({ navigation }) {
  const [secondsLeft, setSecondsLeft] = useState(40);
  const [destinationSecondsLeft, setDestinationSecondsLeft] = useState(30);

  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);

  const [selectedRating, setSelectedRating] = useState(0);
  const [comment, setComment] = useState('');

  const [isCollapsed, setIsCollapsed] = useState(false);

  const stars = [1, 2, 3, 4, 5];

  // Translation value
  const translateY = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  // -----------------------------------
  // AUTO-CANCEL COUNTDOWN
  // -----------------------------------
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  // -----------------------------------
  // DESTINATION REACHED COUNTDOWN
  // -----------------------------------
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

  // -----------------------------------
  // FORMAT TIME
  // -----------------------------------
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;

    return `${mins.toString().padStart(2, '0')}:${remainingSecs
      .toString()
      .padStart(2, '0')}`;
  };

  // -----------------------------------
  // OPEN RATING MODAL
  // -----------------------------------
  const completeRide = () => {
    setSelectedRating(0);
    setComment('');
    setShowRatingModal(true);
  };

  // -----------------------------------
  // SUBMIT RATING
  // -----------------------------------
  const submitRating = () => {
    setShowRatingModal(false);

    navigation.navigate('History', {
      newRide: true,
    });
  };

  // -----------------------------------
  // SNAP BOTTOM SHEET
  // -----------------------------------
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

  // -----------------------------------
  // PAN RESPONDER
  // -----------------------------------
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

  // -----------------------------------
  // MAP REGION
  // -----------------------------------
  const cvsuRegion = {
    latitude: 14.198758,
    longitude: 120.881493,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* =========================================
          HEADER
      ========================================= */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />

        <Text style={styles.headerTitle}>Indang GO</Text>

        <TouchableOpacity>
          <Feather name="bell" size={24} color="#1C274C" />
        </TouchableOpacity>
      </View>

      {/* =========================================
          MAIN CONTENT
      ========================================= */}
      <View style={styles.mainContent}>
        {/* =========================================
            MAP
        ========================================= */}
        <MapView
          style={StyleSheet.absoluteFillObject}
          initialRegion={cvsuRegion}
          showsUserLocation={true}
          pitchEnabled={false}
        >
          <Marker
            coordinate={{
              latitude: 14.198758,
              longitude: 120.881493,
            }}
          >
            <View style={styles.markerContainer}>
              <View style={styles.coreDot} />
            </View>
          </Marker>
        </MapView>

        {/* =========================================
            BOTTOM SHEET
        ========================================= */}
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          {/* DRAG HEADER */}
          <View style={styles.dragTouchArea}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                snapTo(
                  isCollapsed ? 0 : DRAG_RANGE,
                  !isCollapsed
                )
              }
              style={styles.dragHandleWrapper}
              {...panResponder.panHandlers}
            >
              <View style={styles.dragIndicator} />
            </TouchableOpacity>

            {/* =====================================
                PASSENGER PROFILE
            ===================================== */}
            <View style={styles.profileRow}>
              <View style={styles.passengerCard}>
                <View style={styles.avatarContainer}>
                  <Feather
                    name="user"
                    size={24}
                    color="#095C37"
                  />
                </View>

                <View style={styles.passengerInfo}>
                  <Text style={styles.passengerName}>
                    Jame Barrios
                  </Text>

                  <Text style={styles.passengerStats}>
                    ★ 4.9 · 1.2k trips
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.chatButton}
                onPress={() =>
                  navigation.navigate('Messaging')
                }
              >
                <MaterialCommunityIcons
                  name="message-processing-outline"
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* =========================================
              EXPANDABLE CONTENT
          ========================================= */}
          <View style={styles.expandableContent}>
            {/* ROUTE CARD */}
            <View style={styles.routeCard}>
              <View style={styles.timelineContainer}>
                <View style={styles.greenDot} />

                <View style={styles.timelineLine} />

                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={18}
                  color="#967000"
                />
              </View>

              <View style={styles.routeTextContainer}>
                <View>
                  <Text style={styles.routeLabel}>
                    PICKUP
                  </Text>

                  <Text style={styles.routeLocation}>
                    CvSU Main Campus
                  </Text>
                </View>

                <View
                  style={{
                    marginTop: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text style={styles.routeLabel}>
                    DROP-OFF
                  </Text>

                  <Text style={styles.routeLocation}>
                    Harasan Cuevas Compound
                  </Text>
                </View>

                <View style={styles.passengerCountRow}>
                  <Feather
                    name="users"
                    size={16}
                    color="#333"
                    style={{ marginRight: 8 }}
                  />

                  <Text style={styles.passengerCountText}>
                    Number of Passenger: 1
                  </Text>
                </View>
              </View>
            </View>

            {/* =====================================
                AUTO CANCEL BANNER
            ===================================== */}
            <View style={styles.noticeBanner}>
              <Feather
                name="info"
                size={16}
                color="#666"
                style={{ marginRight: 8 }}
              />

              <Text style={styles.noticeText}>
                The ride will auto-cancel and deduct{'\n'}
                in{' '}
                <Text style={styles.timerText}>
                  {formatTime(secondsLeft)}
                </Text>{' '}
                if the passenger does not show up.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* =========================================
            DESTINATION REACHED MODAL
        ========================================= */}
        <Modal
          visible={showDestinationModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() =>
            setShowDestinationModal(false)
          }
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {/* MODAL HEADER */}
              <View style={styles.modalHeaderBanner}>
                <View style={styles.checkCircle}>
                  <Feather
                    name="check"
                    size={18}
                    color="#095C37"
                  />
                </View>

                <Text style={styles.modalHeaderTitle}>
                  Destination Reached
                </Text>
              </View>

              {/* MODAL BODY */}
              <View style={styles.modalBody}>
                {/* FARE CARD */}
                <View style={styles.fareCard}>
                  <View style={styles.fareHeaderRow}>
                    <Text style={styles.fareLabel}>
                      Estimated Fare
                    </Text>

                    <View style={styles.infoBadge}>
                      <Feather
                        name="info"
                        size={10}
                        color="#665300"
                        style={{ marginRight: 3 }}
                      />

                      <Text style={styles.infoBadgeText}>
                        Includes base fare
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.fareAmount}>
                    ₱45.00
                  </Text>
                </View>

                {/* PASSENGER INFORMATION */}
                <View style={styles.modalPassengerRow}>
                  <View style={styles.modalAvatarContainer}>
                    <Feather
                      name="user"
                      size={22}
                      color="#095C37"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalPassengerName}>
                      Jame Barrios
                    </Text>

                    <Text style={styles.modalPassengerStats}>
                      ★ 4.9 · 1.2 km away
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="shield-check-outline"
                    size={22}
                    color="#095C37"
                  />
                </View>

                {/* ROUTE SUMMARY */}
                <View style={styles.modalRouteBox}>
                  <View style={styles.timelineContainer}>
                    <View style={styles.greenRingDot} />

                    <View style={styles.modalTimelineLine} />

                    <MaterialCommunityIcons
                      name="map-marker-outline"
                      size={16}
                      color="#8B6B00"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View>
                      <Text style={styles.routeLabel}>
                        PICKUP
                      </Text>

                      <Text style={styles.modalRouteLocation}>
                        CvSU Main Campus
                      </Text>
                    </View>

                    <View
                      style={{
                        marginTop: 12,
                        marginBottom: 12,
                      }}
                    >
                      <Text style={styles.routeLabel}>
                        DROP-OFF
                      </Text>

                      <Text style={styles.modalRouteLocation}>
                        Harasan Cuevas Compound
                      </Text>
                    </View>

                    <View
                      style={styles.modalPassengerCountRow}
                    >
                      <Feather
                        name="users"
                        size={15}
                        color="#333"
                        style={{ marginRight: 6 }}
                      />

                      <Text style={styles.passengerCountText}>
                        Number of Passenger: 1
                      </Text>
                    </View>
                  </View>
                </View>

                {/* END TRIP BUTTON */}
                <TouchableOpacity
                  style={styles.endTripBtn}
                  onPress={() => {
                    setShowDestinationModal(false);
                    setSelectedRating(0);
                    setComment('');
                    setShowRatingModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.endTripBtnText}>
                    End Trip
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* =========================================
            RATING MODAL
            SAME DESIGN AS P-RideScreen
        ========================================= */}
        <Modal
          visible={showRatingModal}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setShowRatingModal(false)
          }
        >
          <View style={styles.modalOverlay}>
            <View style={styles.ratingModal}>
              {/* TITLE */}
              <Text style={styles.ratingTitle}>
                Rate your trip
              </Text>

              {/* SUBTITLE */}
              <Text style={styles.ratingSubtitle}>
                How was your trip? Share with us!
              </Text>

              {/* ===================================
                  STAR RATING
              =================================== */}
              <View style={styles.starRow}>
                {stars.map((star) => (
                  <TouchableOpacity
                    key={star}
                    activeOpacity={0.8}
                    onPress={() =>
                      setSelectedRating(star)
                    }
                  >
                    <MaterialCommunityIcons
                      name={
                        selectedRating >= star
                          ? 'star'
                          : 'star-outline'
                      }
                      size={34}
                      color={
                        selectedRating >= star
                          ? '#FFD700'
                          : '#D5D7DB'
                      }
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* ===================================
                  FEEDBACK INPUT
              =================================== */}
              <TextInput
                style={styles.commentInput}
                multiline
                numberOfLines={5}
                placeholder="Share feedback about passenger behavior, pricing, or route safety..."
                placeholderTextColor="#8A8F98"
                value={comment}
                onChangeText={setComment}
                textAlignVertical="top"
              />

              {/* ===================================
                  ACTION BUTTONS
              =================================== */}
              <View style={styles.ratingActions}>
                {/* SKIP */}
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={() =>
                    setShowRatingModal(false)
                  }
                >
                  <Text style={styles.skipButtonText}>
                    Skip
                  </Text>
                </TouchableOpacity>

                {/* SUBMIT */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    !selectedRating &&
                      styles.submitButtonDisabled,
                  ]}
                  disabled={!selectedRating}
                  onPress={submitRating}
                >
                  <Text
                    style={[
                      styles.submitButtonText,
                      !selectedRating &&
                        styles.submitButtonTextDisabled,
                    ]}
                  >
                    Submit Rating
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>

      {/* =========================================
          BOTTOM NAVIGATION
      ========================================= */}
      <BottomNav
        active="bookings"
        navigation={navigation}
        homeRoute="Driver"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // =========================================
  // SAFE AREA
  // =========================================
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },

  // =========================================
  // HEADER
  // =========================================
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical:
      Platform.OS === 'android' ? 16 : 12,
    backgroundColor: '#FAFAFA',
    zIndex: 10,
  },

  headerSpacer: {
    width: 24,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#095C37',
  },

  // =========================================
  // MAIN CONTENT
  // =========================================
  mainContent: {
    flex: 1,
    position: 'relative',
  },

  // =========================================
  // MAP MARKER
  // =========================================
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

  // =========================================
  // BOTTOM SHEET
  // =========================================
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
    shadowOffset: {
      width: 0,
      height: -3,
    },
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

  // =========================================
  // PASSENGER CARD
  // =========================================
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

  // =========================================
  // ROUTE DETAILS
  // =========================================
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

  // =========================================
  // NOTICE BANNER
  // =========================================
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

  // =========================================
  // DESTINATION MODAL
  // =========================================
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
    shadowOffset: {
      width: 0,
      height: 4,
    },
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

  // =========================================
  // FARE CARD
  // =========================================
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

  // =========================================
  // MODAL PASSENGER
  // =========================================
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

  // =========================================
  // MODAL ROUTE
  // =========================================
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

  // =========================================
  // END TRIP BUTTON
  // =========================================
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

  // =========================================
  // RATING MODAL
  // SAME AS P-RideScreen
  // =========================================
  ratingModal: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  ratingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
  },

  ratingSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },

  // =========================================
  // STAR RATING
  // =========================================
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },

  // =========================================
  // COMMENT INPUT
  // =========================================
  commentInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    color: '#1F2937',
    fontSize: 14,
    marginBottom: 18,
  },

  // =========================================
  // RATING ACTIONS
  // =========================================
  ratingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  // =========================================
  // SKIP BUTTON
  // =========================================
  skipButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFF',
  },

  skipButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },

  // =========================================
  // SUBMIT BUTTON
  // =========================================
  submitButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#095C37',
    paddingVertical: 12,
    alignItems: 'center',
  },

  submitButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },

  submitButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  submitButtonTextDisabled: {
    color: '#9CA3AF',
  },
});