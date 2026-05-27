import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function ProfileScreen({ navigation }) {
  const handleLogout = () => {
    // This acts as your "Back" to the login screen
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarText}>Juan</Text>
      </View>
      <Text style={styles.name}>Juan Dela Cruz</Text>
      <Text style={styles.phone}>0912-345-6789</Text>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', alignItems: 'center', padding: 30 },
  avatarPlaceholder: { width: 100, height: 100, backgroundColor: '#2ecc71', borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5 },
  phone: { fontSize: 16, color: '#7f8c8d', marginBottom: 40 },
  logoutButton: { backgroundColor: '#e74c3c', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});