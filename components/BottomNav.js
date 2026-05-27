import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function BottomNav({ active, navigation }) {
  return (
    <View style={styles.bottomNav}>
      <TouchableOpacity 
        style={[styles.navItem, active === 'home' && styles.navItemActive]} 
        onPress={() => navigation.navigate('Passenger')}
      >
        <Feather name="home" size={20} color={active === 'home' ? '#FFF' : '#999'} />
        <Text style={[styles.navText, active === 'home' && styles.navTextActive]}>Home</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.navItem, active === 'bookings' && styles.navItemActive]} 
        onPress={() => navigation.navigate('Booking')}
      >
        <Feather name="file-text" size={20} color={active === 'bookings' ? '#FFF' : '#999'} />
        <Text style={[styles.navText, active === 'bookings' && styles.navTextActive]}>Bookings</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.navItem, active === 'history' && styles.navItemActive]}>
        <Feather name="clock" size={20} color={active === 'history' ? '#FFF' : '#999'} />
        <Text style={[styles.navText, active === 'history' && styles.navTextActive]}>History</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={[styles.navItem, active === 'profile' && styles.navItemActive]}>
        <Feather name="user" size={20} color={active === 'profile' ? '#FFF' : '#999'} />
        <Text style={[styles.navText, active === 'profile' && styles.navTextActive]}>Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: { 
    flexDirection: 'row', 
    backgroundColor: '#FFF', 
    paddingVertical: 12, 
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    justifyContent: 'space-between'
  },
  navItem: { 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: '#095C37',
  },
  navText: { 
    fontSize: 10, 
    color: '#999', 
    marginTop: 4,
    fontWeight: '500'
  },
  navTextActive: { 
    color: '#FFF', 
    fontWeight: '700' 
  },
});