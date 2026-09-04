import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';

export default function EditProfileScreen({ navigation }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    gender: 'Male',
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const value = await SecureStore.getItemAsync('indang_user_profile');
        if (value) {
          const profile = JSON.parse(value);
          setForm({
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            phone: profile.phone || '',
            email: profile.email || '',
            gender: profile.gender || 'Male',
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.firstName || !form.lastName || !form.phone || !form.email) {
      Alert.alert('Incomplete profile', 'Please fill out all required fields.');
      return;
    }

    const nextProfile = {
      ...form,
      role: 'driver',
    };

    await SecureStore.setItemAsync('indang_user_profile', JSON.stringify(nextProfile));
    Alert.alert('Profile updated', 'Your profile has been saved.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color="#1E1E1E" />
        </TouchableOpacity>

        <Text style={styles.title}>Edit Profile</Text>

        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            <Feather name="user" size={72} color="#7C8A82" />
          </View>
          <View style={styles.cameraBadge}>
            <Feather name="camera" size={18} color="#FFF" />
          </View>
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>First Name*</Text>
          <TextInput
            style={styles.input}
            value={form.firstName}
            onChangeText={(value) => updateField('firstName', value)}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Last Name*</Text>
          <TextInput
            style={styles.input}
            value={form.lastName}
            onChangeText={(value) => updateField('lastName', value)}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Mobile Number*</Text>
          <TextInput
            style={styles.input}
            value={form.phone}
            onChangeText={(value) => updateField('phone', value)}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Email*</Text>
          <TextInput
            style={styles.input}
            value={form.email}
            onChangeText={(value) => updateField('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Gender*</Text>
          <View style={styles.selectWrap}>
            <TextInput
              style={[styles.input, styles.selectInput]}
              value={form.gender}
              onChangeText={(value) => updateField('gender', value)}
            />
            <Feather name="chevron-down" size={22} color="#2D3A36" />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F5',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 18 : 12,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E1E1E',
  },
  saveText: {
    color: '#095C37',
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 18,
    position: 'relative',
  },
  avatarCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#DCE8F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7E2EA',
  },
  cameraBadge: {
    position: 'absolute',
    right: 6,
    bottom: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#095C37',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F5F7F5',
  },
  fieldWrap: {
    marginBottom: 18,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E1E1E',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F0F2F0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9DDD9',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    color: '#1E1E1E',
  },
  selectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#095C37',
    paddingRight: 12,
  },
  selectInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginTop: 40,
  },
});
