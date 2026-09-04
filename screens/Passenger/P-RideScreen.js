// P-RideScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker } from 'react-native-maps';
import BottomNav from '../../components/BottomNav';

const cancellationReasons = [
  { id: 'driver_delay', label: 'Driver is taking too long' },
  { id: 'changed_mind', label: 'Changed my mind' },
  { id: 'accidental_booking', label: 'Accidental booking' },
  { id: 'other', label: 'Other' },
];

export default function ActiveRideScreen({ navigation, route }) {
  // Prototype State Machine:
  // 0 = Heading to Pickup
  // 1 = In Transit
  // 2 = Destination Reached
  const [rideState, setRideState] = useState(0);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [comment, setComment] = useState('');

  const [showCancellationModal, setShowCancellationModal] =
    useState(false);

  const [selectedCancellationReason, setSelectedCancellationReason] =
    useState(null);

  const [isCancelling, setIsCancelling] = useState(false);

  const pickup =
    route?.params?.pickup || 'CvSU Main Campus';

  const destination =
    route?.params?.destination ||
    'Harasan Cuevas Compound';

  const passengers =
    route?.params?.passengers || 1;

  const stars = [1, 2, 3, 4, 5];

  // =========================================
  // CYCLE RIDE STATE
  // =========================================
  const cycleRideState = () => {
    if (rideState < 2) {
      setRideState(rideState + 1);
    }
  };

  // =========================================
  // OPEN RATING MODAL
  // =========================================
  const completeRide = () => {
    setSelectedRating(0);
    setComment('');
    setShowRatingModal(true);
  };

  // =========================================
  // SUBMIT RATING
  // =========================================
  const submitRating = () => {
    setShowRatingModal(false);

    navigation.navigate('History', {
      newRide: true,
    });
  };

  // =========================================
  // CONFIRM CANCELLATION
  // =========================================
  const confirmCancellation = async () => {
    if (
      !selectedCancellationReason ||
      isCancelling
    ) {
      return;
    }

    setIsCancelling(true);

    const reason = cancellationReasons.find(
      (item) =>
        item.id === selectedCancellationReason
    );

    const cancellation = {
      id: `CANC-${Date.now()}`,
      reasonId: reason.id,
      reason: reason.label,
      createdAt: new Date().toISOString(),
      ride: {
        pickup,
        destination,
        passengers,
      },
    };

    try {
      const existing =
        await AsyncStorage.getItem(
          'cancellationLogs'
        );

      const logs = existing
        ? JSON.parse(existing)
        : [];

      await AsyncStorage.setItem(
        'cancellationLogs',
        JSON.stringify([
          cancellation,
          ...logs,
        ])
      );

      setShowCancellationModal(false);

      navigation.replace('Passenger', {
        cancellation,
      });
    } catch (error) {
      Alert.alert(
        'Unable to save cancellation',
        'Please try again.'
      );

      setIsCancelling(false);
    }
  };

  // =========================================
  // RIDE STATUS
  // =========================================
  const getStatusConfig = () => {
    switch (rideState) {
      case 0:
        return {
          text: 'Heading to Pickup',
          dot: '#FFD700',
        };

      case 1:
        return {
          text: 'Heading to Destination',
          dot: '#378ADD',
        };

      case 2:
        return {
          text: 'Destination Reached',
          dot: '#4ade80',
        };

      default:
        return {
          text: 'Heading to Pickup',
          dot: '#FFD700',
        };
    }
  };

  const status = getStatusConfig();

  const isCompleteEnabled =
    rideState === 2;

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* =========================================
          HEADER
      ========================================= */}
      <View style={styles.header}>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
        >
          <Feather
            name="menu"
            size={24}
            color="#333"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Indang GO
        </Text>

        <TouchableOpacity>
          <Feather
            name="bell"
            size={24}
            color="#333"
          />
        </TouchableOpacity>

      </View>

      {/* =========================================
          MAP
      ========================================= */}
      <View style={styles.mapContainer}>

        <MapView
          style={styles.map}
          initialRegion={{
            latitude: 14.1953,
            longitude: 120.8767,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          pitchEnabled={false}
        >

          <Marker
            coordinate={{
              latitude: 14.1953,
              longitude: 120.8767,
            }}
          >
            <MaterialCommunityIcons
              name="map-marker"
              size={40}
              color="#378ADD"
            />
          </Marker>

        </MapView>

        {/* STATUS PILL */}
        <TouchableOpacity
          style={styles.statusPill}
          onPress={cycleRideState}
          activeOpacity={0.8}
        >

          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: status.dot,
              },
            ]}
          />

          <Text style={styles.statusText}>
            {status.text}
          </Text>

        </TouchableOpacity>

      </View>

      {/* =========================================
          BOTTOM SHEET
      ========================================= */}
      <View style={styles.bottomSheet}>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 20,
          }}
        >

          <View style={styles.dragIndicator} />

          {/* =====================================
              DRIVER PROFILE + MESSAGE
          ===================================== */}
          <View style={styles.profileRow}>

            {/* DRIVER PROFILE CARD */}
            <View style={styles.driverCard}>

              <View style={styles.avatarContainer}>
                <MaterialCommunityIcons
                  name="account"
                  size={26}
                  color="#095C37"
                />
              </View>

              <View style={styles.driverInfo}>

                <Text style={styles.driverName}>
                  Kuya Virgilio
                </Text>

                <Text style={styles.driverStats}>
                  ★ 4.9 · 1.2k trips
                </Text>

              </View>

            </View>

            {/* MESSAGE BUTTON CARD */}
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() =>
                navigation.navigate('Messaging')
              }
              activeOpacity={0.8}
            >

              <MaterialCommunityIcons
                name="message-processing-outline"
                size={24}
                color="#FFFFFF"
              />

            </TouchableOpacity>

          </View>

          {/* =====================================
              VEHICLE DETAILS
          ===================================== */}
          <View style={styles.vehicleDetailsRow}>

            {/* TODA REGISTRATION CARD */}
            <View style={styles.vehicleCard}>

              <View style={styles.vehicleIconContainer}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={22}
                  color="#095C37"
                />
              </View>

              <View style={styles.vehicleInfo}>

                <Text style={styles.detailLabel}>
                  TODA REGISTRATION
                </Text>

                <Text style={styles.detailValue}>
                  TODA-1235
                </Text>

              </View>

            </View>

            {/* TRICYCLE PLATE CARD */}
            <View style={styles.vehicleCard}>

              <View style={styles.vehicleIconContainer}>
                <MaterialCommunityIcons
                  name="card-text-outline"
                  size={22}
                  color="#095C37"
                />
              </View>

              <View style={styles.vehicleInfo}>

                <Text style={styles.detailLabel}>
                  TRICYCLE PLATE
                </Text>

                <Text style={styles.detailValue}>
                  CVSU-1992
                </Text>

              </View>

            </View>

          </View>

          {/* =====================================
              ROUTE SUMMARY
          ===================================== */}
          <View style={styles.routeCard}>

            <View style={styles.timelineContainer}>

              <MaterialCommunityIcons
                name="circle-slice-8"
                size={16}
                color="#095C37"
              />

              <View style={styles.timelineLine} />

              <MaterialCommunityIcons
                name="map-marker-outline"
                size={18}
                color="#967000"
              />

            </View>

            <View style={styles.detailsContainer}>

              {/* PICKUP */}
              <View>

                <Text style={styles.routeLabel}>
                  PICKUP
                </Text>

                <Text style={styles.routeValue}>
                  {pickup}
                </Text>

              </View>

              {/* DROP-OFF */}
              <View
                style={{
                  marginTop: 16,
                  marginBottom: 16,
                }}
              >

                <Text style={styles.routeLabel}>
                  DROP-OFF
                </Text>

                <Text style={styles.routeValue}>
                  {destination}
                </Text>

              </View>

              {/* PASSENGER COUNT */}
              <View style={styles.passengerRow}>

                <Feather
                  name="users"
                  size={16}
                  color="#095C37"
                  style={{
                    marginRight: 8,
                  }}
                />

                <Text style={styles.passengerText}>
                  Number of Passenger: {passengers}
                </Text>

              </View>

            </View>

          </View>

          {/* =====================================
              FARE
          ===================================== */}
          <View style={styles.fareRow}>

            <Text style={styles.fareLabel}>
              ESTIMATED FARE
            </Text>

            <Text style={styles.fareAmount}>
              ₱45.00
            </Text>

          </View>

          {/* =====================================
              COMPLETE BOOKING
          ===================================== */}
          <TouchableOpacity
            style={[
              styles.completeBtn,
              !isCompleteEnabled &&
                styles.completeBtnDisabled,
            ]}
            disabled={!isCompleteEnabled}
            onPress={completeRide}
          >

            <Text
              style={[
                styles.completeBtnText,
                !isCompleteEnabled &&
                  styles.completeBtnTextDisabled,
              ]}
            >
              Complete Booking
            </Text>

          </TouchableOpacity>

          {/* =====================================
              CANCEL / REPORT
          ===================================== */}
          {rideState < 2 ? (

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() =>
                setShowCancellationModal(true)
              }
            >

              <Text style={styles.cancelBtnText}>
                Cancel Ride
              </Text>

            </TouchableOpacity>

          ) : (

            <TouchableOpacity
              style={styles.reportBtn}
            >

              <Text style={styles.reportBtnText}>
                Report Driver
              </Text>

            </TouchableOpacity>

          )}

        </ScrollView>

      </View>

      {/* =========================================
          CANCELLATION MODAL
      ========================================= */}
      <Modal
        visible={showCancellationModal}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setShowCancellationModal(false)
        }
      >

        <View style={styles.cancellationOverlay}>

          <View style={styles.cancellationSheet}>

            <View style={styles.dragIndicator} />

            <Text style={styles.cancellationTitle}>
              Cancel Ride?
            </Text>

            <View style={styles.warningRow}>

              <Feather
                name="alert-triangle"
                size={21}
                color="#B65353"
              />

              <Text style={styles.warningText}>
                A fee may apply if you cancel after
                2 minutes of acceptance.
              </Text>

            </View>

            <Text style={styles.cancellationPrompt}>
              Please select a reason:
            </Text>

            <View style={styles.reasonGrid}>

              {cancellationReasons.map(
                (reason) => {

                  const isSelected =
                    selectedCancellationReason ===
                    reason.id;

                  return (
                    <TouchableOpacity
                      key={reason.id}
                      style={[
                        styles.reasonOption,
                        isSelected &&
                          styles.reasonOptionSelected,
                      ]}
                      onPress={() =>
                        setSelectedCancellationReason(
                          reason.id
                        )
                      }
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: isSelected,
                      }}
                    >

                      <Text
                        style={styles.reasonText}
                      >
                        {reason.label}
                      </Text>

                      <View
                        style={[
                          styles.radio,
                          isSelected &&
                            styles.radioSelected,
                        ]}
                      >

                        {isSelected && (
                          <View
                            style={styles.radioDot}
                          />
                        )}

                      </View>

                    </TouchableOpacity>
                  );
                }
              )}

            </View>

            {/* KEEP RIDE */}
            <TouchableOpacity
              style={styles.keepButton}
              onPress={() =>
                setShowCancellationModal(false)
              }
            >

              <Text style={styles.keepButtonText}>
                Keep Ride
              </Text>

            </TouchableOpacity>

            {/* CONFIRM CANCELLATION */}
            <TouchableOpacity
              style={[
                styles.confirmCancellationButton,
                !selectedCancellationReason &&
                  styles.confirmButtonDisabled,
              ]}
              onPress={confirmCancellation}
              disabled={
                !selectedCancellationReason ||
                isCancelling
              }
            >

              <Text
                style={styles.confirmCancellationText}
              >
                {isCancelling
                  ? 'Cancelling...'
                  : 'Confirm Cancellation'}
              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>

      {/* =========================================
          RATING MODAL
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

            {/* STARS */}
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

            {/* FEEDBACK */}
            <TextInput
              style={styles.commentInput}
              multiline
              numberOfLines={5}
              placeholder="Share feedback about driver behavior, vehicle condition, or route safety..."
              placeholderTextColor="#8A8F98"
              value={comment}
              onChangeText={setComment}
              textAlignVertical="top"
            />

            {/* ACTION BUTTONS */}
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

      {/* =========================================
          BOTTOM NAVIGATION
      ========================================= */}
      <BottomNav
        active="bookings"
        navigation={navigation}
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
    backgroundColor: '#F8F9FA',
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
      Platform.OS === 'android'
        ? 20
        : 10,
    backgroundColor: '#F8F9FA',
    zIndex: 10,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#095C37',
  },

  // =========================================
  // MAP
  // =========================================
  mapContainer: {
    flex: 1,
    position: 'relative',
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // =========================================
  // STATUS PILL
  // =========================================
  statusPill: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: '#095C37',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },

  statusText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // =========================================
  // BOTTOM SHEET
  // =========================================
  bottomSheet: {
    height: '60%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 12,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 15,
  },

  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#CCC',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },

  // =========================================
  // DRIVER PROFILE + CHAT
  // =========================================
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  driverCard: {
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

  driverInfo: {
    justifyContent: 'center',
    flex: 1,
  },

  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
  },

  driverStats: {
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
  // VEHICLE DETAILS CARDS
  // =========================================
  vehicleDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },

  vehicleCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  vehicleIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E8F1EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#777777',
    marginBottom: 3,
  },

  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#222222',
  },

  // =========================================
  // ROUTE CARD
  // =========================================
  routeCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 20,
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

  detailsContainer: {
    flex: 1,
  },

  routeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#999',
    marginBottom: 4,
  },

  routeValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },

  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },

  passengerText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },

  // =========================================
  // FARE
  // =========================================
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },

  fareLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
  },

  fareAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#095C37',
  },

  // =========================================
  // COMPLETE BUTTON
  // =========================================
  completeBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },

  completeBtnText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },

  completeBtnDisabled: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
  },

  completeBtnTextDisabled: {
    color: '#999',
  },

  // =========================================
  // CANCEL BUTTON
  // =========================================
  cancelBtn: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E24B4A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },

  cancelBtnText: {
    color: '#E24B4A',
    fontSize: 15,
    fontWeight: '700',
  },

  // =========================================
  // REPORT BUTTON
  // =========================================
  reportBtn: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#095C37',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },

  reportBtnText: {
    color: '#095C37',
    fontSize: 15,
    fontWeight: '700',
  },

  // =========================================
  // CANCELLATION MODAL
  // =========================================
  cancellationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },

  cancellationSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 30,
    paddingTop: 12,
    paddingBottom: 24,
  },

  cancellationTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111',
    marginBottom: 16,
  },

  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 28,
  },

  warningText: {
    flex: 1,
    color: '#A84F4F',
    fontSize: 16,
    lineHeight: 23,
    marginLeft: 14,
  },

  cancellationPrompt: {
    fontSize: 17,
    fontWeight: '700',
    color: '#343434',
    marginBottom: 18,
  },

  reasonGrid: {
    gap: 12,
  },

  reasonOption: {
    minHeight: 64,
    backgroundColor: '#F0F2F3',
    borderRadius: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  reasonOptionSelected: {
    backgroundColor: '#E2F0E5',
    borderWidth: 1,
    borderColor: '#2D5A34',
  },

  reasonText: {
    flex: 1,
    color: '#303030',
    fontSize: 17,
  },

  radio: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D4D4CB',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },

  radioSelected: {
    borderColor: '#2D5A34',
  },

  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2D5A34',
  },

  keepButton: {
    backgroundColor: '#FFD83D',
    borderRadius: 12,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 34,
  },

  keepButtonText: {
    color: '#4A4100',
    fontSize: 18,
    fontWeight: '700',
  },

  confirmCancellationButton: {
    backgroundColor: '#B65353',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  confirmButtonDisabled: {
    backgroundColor: '#E4E4E4',
  },

  confirmCancellationText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // =========================================
  // RATING MODAL
  // =========================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

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