import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export default function SplashScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={{ fontSize: 36 }}>🛺</Text>
      </View>
      <Text style={styles.title}>IndangGO</Text>
      <Text style={styles.sub}>
        Your tricycle ride-hailing app for Indang, Cavite. Fast, safe, and reliable transport at your fingertips.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('Login')}>
        <Text style={styles.btnText}>Get started</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => navigation.replace('Login')}>
        <Text style={styles.btnOutlineText}>Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 32, fontWeight: '600', marginBottom: 12 },
  sub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  btn: { width: '100%', padding: 16, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', marginBottom: 12 },
  btnText: { color: COLORS.green, fontSize: 16, fontWeight: '600' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  btnOutlineText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});