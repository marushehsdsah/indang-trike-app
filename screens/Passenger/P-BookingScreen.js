import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const fallbackLocations = [
  'CvSU Main Campus',
  'Harasan Cuevas Compound',
  'Indang Public Market',
  'Indang Municipal Hall',
  'Indang Church',
  'Tagaytay Highlands',
];

export default function BookingScreen({ navigation }) {
  const [passengers, setPassengers] = useState(1);
  const [pickup, setPickup] = useState('CvSU Main Campus');
  const [destination, setDestination] = useState('Harasan Cuevas Compound');
  const [activeLocation, setActiveLocation] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    const query = activeLocation === 'pickup' ? pickup : destination;
    if (!activeLocation || query.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const localMatches = fallbackLocations.filter((location) =>
        location.toLowerCase().includes(query.trim().toLowerCase())
      );
      setSuggestions(localMatches);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&q=${encodeURIComponent(query)}`,
          { signal: controller.signal, headers: { Accept: 'application/json' } }
        );
        const results = await response.json();
        const remoteMatches = results.map((result) => result.display_name);
        setSuggestions([...new Set([...localMatches, ...remoteMatches])].slice(0, 5));
      } catch (error) {
        if (error.name !== 'AbortError') setSuggestions(localMatches);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeLocation, pickup, destination]);

  const selectLocation = (location) => {
    if (activeLocation === 'pickup') setPickup(location);
    if (activeLocation === 'destination') setDestination(location);
    setActiveLocation(null);
    setSuggestions([]);
  };

  const adjustPassengers = (val) => {
    if (passengers + val > 0 && passengers + val <= 4) {
      setPassengers(passengers + val);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity><Feather name="bell" size={24} color="#333" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Booking Details</Text>

        {/* Location Card */}
        <View style={styles.card}>
          <View style={styles.locationRow}>
            <View style={styles.dotLineContainer}>
              <View style={[styles.dot, { backgroundColor: '#FFD700' }]} />
              <View style={styles.dottedLine} />
              <MaterialCommunityIcons name="map-marker" size={16} color="#095C37" style={{ marginLeft: -2 }} />
            </View>
            
            <View style={styles.inputStack}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PICKUP LOCATION</Text>
                <View style={[styles.inputWrapper, activeLocation === 'pickup' && styles.activeInputWrapper]}>
                  <TextInput
                    style={styles.input}
                    value={pickup}
                    onChangeText={setPickup}
                    onFocus={() => setActiveLocation('pickup')}
                    placeholder="Search pickup location"
                  />
                  {activeLocation === 'pickup' && suggestions.length > 0 && (
                    <View style={styles.suggestionsList}>
                      {suggestions.map((location) => (
                        <TouchableOpacity key={location} style={styles.suggestion} onPress={() => selectLocation(location)}>
                          <Feather name="map-pin" size={15} color="#095C37" />
                          <Text style={styles.suggestionText} numberOfLines={2}>{location}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>WHERE TO?</Text>
                <View style={[styles.inputWrapper, activeLocation === 'destination' && styles.activeInputWrapper]}>
                  <TextInput
                    style={styles.input}
                    value={destination}
                    onChangeText={setDestination}
                    onFocus={() => setActiveLocation('destination')}
                    placeholder="Search destination"
                  />
                  {activeLocation === 'destination' && suggestions.length > 0 && (
                    <View style={styles.suggestionsList}>
                      {suggestions.map((location) => (
                        <TouchableOpacity key={location} style={styles.suggestion} onPress={() => selectLocation(location)}>
                          <Feather name="map-pin" size={15} color="#095C37" />
                          <Text style={styles.suggestionText} numberOfLines={2}>{location}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Passengers Card */}
        <View style={styles.cardRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="users" size={20} color="#666" />
            <Text style={styles.cardRowTitle}>Number of{'\n'}Passengers</Text>
          </View>
          <View style={styles.counterControl}>
            <TouchableOpacity onPress={() => adjustPassengers(-1)} style={styles.counterBtn}>
              <Feather name="minus" size={16} color="#333" />
            </TouchableOpacity>
            <Text style={styles.counterText}>{passengers}</Text>
            <TouchableOpacity onPress={() => adjustPassengers(1)} style={styles.counterBtn}>
              <Feather name="plus" size={16} color="#333" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Type of Ride */}
        <Text style={styles.sectionLabel}>Type of Ride</Text>
        <View style={[styles.card, styles.rideTypeCard]}>
          <View style={styles.rideIconBg}>
            <MaterialCommunityIcons name="rickshaw" size={24} color="#095C37" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.rideTitle}>Standard Trike</Text>
            <Text style={styles.rideSub}>Direct & Private Ride</Text>
          </View>
          <MaterialCommunityIcons name="radiobox-marked" size={24} color="#095C37" />
        </View>

        {/* Note */}
        <Text style={styles.sectionLabel}>Note</Text>
        <View style={styles.noteWrapper}>
          <TextInput 
            style={styles.noteInput} 
            placeholder="E.g., Wait near the green bench, or carry heavy grocery bags..." 
            placeholderTextColor="#AAA"
            multiline
            numberOfLines={3}
          />
        </View>
        
        {/* Extra space for absolute bottom sheet */}
        <View style={{ height: 220 }} />
      </ScrollView>

      {/* Floating Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.dragIndicator} />
        
        <View style={styles.fareRow}>
          <View>
            <Text style={styles.fareLabel}>Estimated Fare</Text>
            <Text style={styles.fareAmount}>₱45.00</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="info" size={14} color="#666" style={{ marginRight: 4 }} />
            <Text style={styles.fareInfo}>Includes base fare</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={() => navigation.navigate('Searching', { pickup, destination, passengers })}
        >
          <Text style={styles.confirmBtnText}>Confirm & Book Tricycle</Text>
          <Feather name="chevron-right" size={20} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingVertical: Platform.OS === 'android' ? 20 : 10,
    backgroundColor: '#F8F9FA'
  },
  headerSpacer: { width: 24, height: 24 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#095C37' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 20 },
  
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16 },
  locationRow: { flexDirection: 'row' },
  dotLineContainer: { width: 24, alignItems: 'center', paddingTop: 16 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dottedLine: { width: 1, flex: 1, backgroundColor: '#DDD', marginVertical: 4, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DDD' },
  inputStack: { flex: 1, marginLeft: 8 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#666', marginBottom: 4 },
  inputWrapper: { borderWidth: 1, borderColor: '#EEE', borderRadius: 10, paddingHorizontal: 12, height: 46, justifyContent: 'center', position: 'relative' },
  activeInputWrapper: { zIndex: 10 },
  input: { fontSize: 14, color: '#333' },
  suggestionsList: { position: 'absolute', top: 72, left: 0, right: 0, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 10, zIndex: 20, elevation: 5 },
  suggestion: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F1F1' },
  suggestionText: { flex: 1, marginLeft: 8, fontSize: 12, color: '#333' },

  cardRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center', justifyContent: 'space-between' },
  cardRowTitle: { fontSize: 13, fontWeight: '600', color: '#333', marginLeft: 12 },
  counterControl: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#EEE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  counterBtn: { padding: 8 },
  counterText: { fontSize: 16, fontWeight: '700', marginHorizontal: 12, color: '#333' },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12, marginLeft: 4 },
  rideTypeCard: { flexDirection: 'row', alignItems: 'center' },
  rideIconBg: { backgroundColor: '#E1F5EE', padding: 12, borderRadius: 12 },
  rideTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  rideSub: { fontSize: 12, color: '#666', marginTop: 2 },

  noteWrapper: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, minHeight: 100 },
  noteInput: { fontSize: 14, color: '#333', textAlignVertical: 'top' },

  bottomSheet: {
    position: 'absolute', bottom: 0, width: '100%',
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 24, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 15,
  },
  dragIndicator: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  fareLabel: { fontSize: 12, color: '#666', marginBottom: 2 },
  fareAmount: { fontSize: 24, fontWeight: '800', color: '#095C37' },
  fareInfo: { fontSize: 11, color: '#666' },
  
  confirmBtn: { backgroundColor: '#FFD700', borderRadius: 12, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#333', marginRight: 4 },
  
  cancelBtn: { backgroundColor: '#FFF', borderRadius: 12, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E24B4A' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#E24B4A' },
});