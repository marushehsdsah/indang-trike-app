import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';
import BottomNav from '../../components/BottomNav';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState({
    firstName: 'Russ',
    lastName: 'Getubig',
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const value = await SecureStore.getItemAsync('indang_user_profile');
        if (value) {
          const savedProfile = JSON.parse(value);
          setProfile({
            firstName: savedProfile.firstName || 'Russ',
            lastName: savedProfile.lastName || 'Getubig',
          });
        }
      } catch (error) {
        console.log('Profile load error:', error);
      }
    };

    loadProfile();
  }, []);

  const accountItems = [
    { label: 'Settings', icon: 'settings', iconColor: '#095C37' },
    { label: 'Support', icon: 'help-circle', iconColor: '#095C37' },
    { label: 'Logout', icon: 'log-out', iconColor: '#095C37' },
  ];

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const handleLogout = () => {
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <Text style={styles.pageTitle}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.profileHeaderCard}>
          <View style={styles.avatarWrap}>
            <Feather name="user" size={90} color="#95A9A0" />
          </View>

          <Text style={styles.name}>{`${profile.firstName} ${profile.lastName}`}</Text>

          <TouchableOpacity style={styles.editButton} activeOpacity={0.85} onPress={handleEditProfile}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>My Account</Text>

        <View style={styles.listCard}>
          {accountItems.map((item) => (
            <TouchableOpacity 
            key={item.label} 
            style={styles.listRow} 
            activeOpacity={0.7}
            onPress={item.label === 'Logout' ? handleLogout : () => {}}
            >
              <View style={styles.iconBubble}>
                <Feather name={item.icon} size={22} color={item.iconColor} />
                
              </View>

              <Text style={styles.listText}>{item.label}</Text>

              <Feather name="chevron-right" size={22} color="#6B7280" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNav active="profile" navigation={navigation} homeRoute="Driver" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F5',
  },
  headerContainer: {
    paddingTop: Platform.OS === 'android' ? 18 : 12,
    paddingBottom: 10,
    backgroundColor: '#F5F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E1E1E',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  profileHeaderCard: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 20,
  },
  avatarWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#DCE8F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8E1EA',
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 18,
  },
  editButton: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 2,
    borderColor: '#095C37',
    borderRadius: 18,
    backgroundColor: '#F4F7F5',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#095C37',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2B2B2B',
    marginTop: 18,
    marginBottom: 12,
    marginLeft: 4,
  },
  listCard: {
    backgroundColor: '#F3F4F2',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E7E9E7',
    paddingVertical: 6,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7E9E7',
    backgroundColor: '#F9FAF8',
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E6F0EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#1F1F1F',
  },
});