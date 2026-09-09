import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '../../components/BottomNav';

export default function PassengerScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity><Feather name="bell" size={24} color="#333" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={styles.greetingContainer}>
          <Text style={styles.welcomeText}>Welcome back, Jame!</Text>
          <Text style={styles.subText}>Where are we going today?</Text>
        </View>

        {/* Green Action Card */}
        <View style={styles.actionCard}>
          <View style={styles.pill}><Text style={styles.pillText}>Quick Action</Text></View>
          <Text style={styles.actionTitle}>Get a ride in{'\n'}seconds</Text>
          
          <TouchableOpacity 
            style={styles.bookBtn} 
            onPress={() => navigation.navigate('Booking')}
          >
            <MaterialCommunityIcons name="rickshaw" size={20} color="#333" style={{ marginRight: 8 }} />
            <Text style={styles.bookBtnText}>Book a Tricycle</Text>
          </TouchableOpacity>
          
          {/* Background decoration icon */}
          <MaterialCommunityIcons name="bus-side" size={120} color="rgba(255,255,255,0.1)" style={styles.bgIcon} />
        </View>

        {/* Yellow Safety Banner */}
        <View style={styles.safetyBanner}>
          <Feather name="bell" size={20} color="#333" style={{ marginTop: 2 }} />
          <View style={styles.safetyTextContainer}>
            <Text style={styles.safetyTitle}>Safety first!</Text>
            <Text style={styles.safetySub}>Always verify your driver's ID before boarding.</Text>
          </View>
        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNav active="home" navigation={navigation} />
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
    backgroundColor: '#F8F9FA'
  },
  headerSpacer: { width: 24, height: 24 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#095C37' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 30 },
  
  greetingContainer: { marginTop: 10, marginBottom: 24 },
  welcomeText: { fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 4 },
  subText: { fontSize: 14, color: '#666' },

  actionCard: {
    backgroundColor: '#095C37',
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
    marginBottom: 20,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  pillText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  actionTitle: { fontSize: 26, fontWeight: '700', color: '#FFF', marginBottom: 24, lineHeight: 32, zIndex: 2 },
  bookBtn: {
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    zIndex: 2,
  },
  bookBtnText: { fontSize: 15, fontWeight: '700', color: '#333' },
  bgIcon: { position: 'absolute', right: -20, bottom: -20, zIndex: 1, transform: [{ scaleX: -1 }] },

  safetyBanner: {
    backgroundColor: '#FDE47F',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  safetyTextContainer: { marginLeft: 12, flex: 1 },
  safetyTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 2 },
  safetySub: { fontSize: 13, color: '#555', lineHeight: 18 },
});