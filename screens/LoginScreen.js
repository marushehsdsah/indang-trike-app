import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }) {
  const [isPasswordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={styles.container}>
      {/* Background Green Header */}
      <View style={styles.greenHeader}>
        <SafeAreaView>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="truck-fast" size={32} color="#095C37" />
          </View>
          <Text style={styles.headerTitle}>Indang GO</Text>
          <Text style={styles.headerSub}>Your neighborhood ride, faster.</Text>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Overlapping White Card */}
          <View style={styles.card}>
            <Text style={styles.welcomeTitle}>Welcome</Text>
            <Text style={styles.welcomeSub}>Enter your details to catch a trike.</Text>

            {/* Phone/Email Input */}
            <Text style={styles.label}>Phone or Email</Text>
            <View style={styles.inputContainer}>
              <Feather name="at-sign" size={20} color="#999" style={styles.icon} />
              <TextInput 
                style={styles.input} 
                placeholder="e.g. +63 912 345 6789" 
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Password Input */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={20} color="#999" style={styles.icon} />
              <TextInput 
                style={styles.input} 
                placeholder="Enter Your Password" 
                placeholderTextColor="#999"
                secureTextEntry={!isPasswordVisible}
              />
              <TouchableOpacity onPress={() => setPasswordVisible(!isPasswordVisible)}>
                <Feather name={isPasswordVisible ? "eye" : "eye-off"} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity 
              style={styles.loginBtn} 
              onPress={() => navigation.replace('Passenger')}
            >
              <Text style={styles.loginBtnText}>Login</Text>
              <Feather name="arrow-right" size={20} color="#333" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            {/* ---- ADMIN ONLY ------------------------------------
                Link into the admin app. Navigates to "AdminApp",
                the nested AdminNavigator's entry point, which lands
                on the admin login screen. See navigation/AppNavigator.js
                and admin/AdminNavigator.js. */}
            <TouchableOpacity
              style={styles.adminLoginBtn}
              onPress={() => navigation.navigate('AdminApp')}
            >
              <Text style={styles.adminLoginText}>Admin Login</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              New to Indang Go?{' '}
              <Text 
                style={styles.footerLink} 
                onPress={() => navigation.navigate('Register')}
              >
                Create Account
              </Text>
            </Text>
            <Text style={styles.copyright}>
              <Feather name="shield" size={10} /> Secure neighborhood transit{'\n'}
              © 2026 Indang Go
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  greenHeader: {
    backgroundColor: '#095C37',
    height: '45%',
    width: '100%',
    position: 'absolute',
    top: 0,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  logoContainer: {
    backgroundColor: '#FFF',
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' },
  
  scrollContent: { flexGrow: 1, paddingTop: '55%', paddingHorizontal: 24, paddingBottom: 24 },
  
  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 6 },
  welcomeSub: { fontSize: 13, color: '#666', marginBottom: 24 },
  
  label: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 16,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#333' },
  
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 24 },
  forgotText: { fontSize: 12, fontWeight: '600', color: '#967000' },
  
  loginBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnText: { fontSize: 16, fontWeight: '700', color: '#333' },

  // ---- ADMIN ONLY ----
  adminLoginBtn: { alignSelf: 'center', marginTop: 18 },
  adminLoginText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
    textDecorationLine: 'underline',
  },
  
  footer: { marginTop: 32, alignItems: 'center' },
  footerText: { fontSize: 13, color: '#666' },
  footerLink: { color: '#095C37', fontWeight: '700' },
  copyright: { fontSize: 10, color: '#999', textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
