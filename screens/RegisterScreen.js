import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function RegisterScreen({ navigation }) {
  const [role, setRole] = useState('passenger'); // 'passenger' | 'driver'
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isConfirmVisible, setConfirmVisible] = useState(false);
  const [isChecked, setChecked] = useState(false);

  // Driver-specific state
  const [todaNumber, setTodaNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Indang GO</Text>
        <TouchableOpacity>
          <Feather name="help-circle" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Title */}
          <View style={styles.titleContainer}>
            <Text style={styles.mainTitle}>Create Account</Text>
            <Text style={styles.subTitle}>
              {role === 'driver' 
                ? 'Start your journey as a professional tricycle partner today.' 
                : 'Join our neighborhood of reliable rides.'}
            </Text>
          </View>

          {/* Role Selection Segmented Control */}
          <View style={styles.roleContainer}>
            <TouchableOpacity 
              style={[styles.roleBtn, role === 'passenger' && styles.roleBtnActive]} 
              onPress={() => setRole('passenger')}
            >
              <Feather name="user" size={18} color={role === 'passenger' ? '#FFF' : '#666'} style={{ marginRight: 8 }} />
              <Text style={[styles.roleText, role === 'passenger' && styles.roleTextActive]}>Passenger</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.roleBtn, role === 'driver' && styles.roleBtnActive]} 
              onPress={() => setRole('driver')}
            >
              <Feather name="truck" size={18} color={role === 'driver' ? '#FFF' : '#666'} style={{ marginRight: 8 }} />
              <Text style={[styles.roleText, role === 'driver' && styles.roleTextActive]}>Driver</Text>
            </TouchableOpacity>
          </View>

          {/* First Name */}
          <Text style={styles.label}>First Name</Text>
          <View style={styles.inputContainer}>
            <Feather name="user" size={20} color="#999" style={styles.icon} />
            <TextInput style={styles.input} placeholder="Juan" placeholderTextColor="#999" />
          </View>

          {/* Last Name */}
          <Text style={styles.label}>Last Name</Text>
          <View style={styles.inputContainer}>
            <Feather name="user" size={20} color="#999" style={styles.icon} />
            <TextInput style={styles.input} placeholder="Dela Cruz" placeholderTextColor="#999" />
          </View>

          {/* Email */}
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputContainer}>
            <Feather name="mail" size={20} color="#999" style={styles.icon} />
            <TextInput style={styles.input} placeholder="name@example.com" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" />
          </View>

          {/* Phone Number */}
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.inputContainer}>
            <Feather name="phone" size={18} color="#999" style={styles.icon} />
            <Text style={styles.prefix}>+63</Text>
            <View style={styles.divider} />
            <TextInput style={styles.input} placeholder="912 345 6789" placeholderTextColor="#999" keyboardType="number-pad" />
          </View>

          {/* Password */}
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

          {/* Confirm Password */}
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputContainer}>
            <Feather name="lock" size={20} color="#999" style={styles.icon} />
            <TextInput 
              style={styles.input} 
              placeholder="Re-enter Your Password" 
              placeholderTextColor="#999" 
              secureTextEntry={!isConfirmVisible} 
            />
            <TouchableOpacity onPress={() => setConfirmVisible(!isConfirmVisible)}>
              <Feather name={isConfirmVisible ? "eye" : "eye-off"} size={20} color="#999" />
            </TouchableOpacity>
          </View>

          {/* --- DRIVER ONLY FIELDS --- */}
          {role === 'driver' && (
            <>
              {/* Vehicle Details */}
              <View>
                <Text style={styles.sectionHeader}>Vehicle Details</Text>
              </View>

              <Text style={styles.label}>TODA Registration Number</Text>
              <View style={styles.inputContainer}>
                <Feather name="file-text" size={20} color="#999" style={styles.icon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="TODA-XXXX" 
                  placeholderTextColor="#999" 
                  value={todaNumber}
                  onChangeText={setTodaNumber}
                  autoCapitalize="characters"
                />
              </View>

              <Text style={styles.label}>Tricycle Plate Number</Text>
              <View style={styles.inputContainer}>
                <Feather name="hash" size={20} color="#999" style={styles.icon} />
                <TextInput 
                  style={styles.input} 
                  placeholder="ABC-1234" 
                  placeholderTextColor="#999" 
                  value={plateNumber}
                  onChangeText={setPlateNumber}
                  autoCapitalize="characters"
                />
              </View>

              {/* Document Verification */}
              <View>
                <Text style={styles.sectionHeader}>Document Verification</Text>
              </View>

              <TouchableOpacity style={styles.uploadCard} activeOpacity={0.7}>
                <Feather name="credit-card" size={28} color="#999" style={{ marginBottom: 8 }} />
                <Text style={styles.uploadTitle}>Driver's License</Text>
                <Text style={styles.uploadSubtitle}>Tap to upload clear photo</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Terms Checkbox */}
          <View style={styles.checkboxRow}>
            <TouchableOpacity 
              style={[styles.checkbox, isChecked && styles.checkboxActive]} 
              onPress={() => setChecked(!isChecked)}
            >
              {isChecked && <Feather name="check" size={14} color="#FFF" />}
            </TouchableOpacity>
            <Text style={styles.checkboxText}>
              By signing up, you agree to our <Text style={styles.linkText}>Terms of Service</Text> and <Text style={styles.linkText}>Privacy Policy</Text>{role === 'driver' ? ' regarding registration as a driver for Indang TODA.' : '.'}
            </Text>
          </View>

          {/* Sign Up / Submit Button */}
          <TouchableOpacity style={styles.signupBtn}>
            <Text style={styles.signupBtnText}>
              {role === 'driver' ? 'Complete Registration' : 'Sign Up'}
            </Text>
            <Feather name="arrow-right" size={20} color="#333" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Already have an account?{' '}
              <Text style={styles.footerLink} onPress={() => navigation.navigate('Login')}>
                Back to Login
              </Text>
            </Text>
          </View>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 16,
    backgroundColor: '#F8F9FA'
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#095C37' },
  
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  
  titleContainer: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
  mainTitle: { fontSize: 26, fontWeight: '700', color: '#333', marginBottom: 8 },
  subTitle: { fontSize: 13, color: '#666', textAlign: 'center' },

  /* Role Selection Switcher */
  roleContainer: {
    flexDirection: 'row',
    backgroundColor: '#EAEAEA',
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBtnActive: {
    backgroundColor: '#095C37',
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  roleTextActive: {
    color: '#FFF',
  },

  /* Section Header Titles for Driver Mode */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#095C37',
    marginLeft: 8,
  },

  label: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 16,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#333' },
  prefix: { fontSize: 14, fontWeight: '600', color: '#333', marginRight: 8 },
  divider: { width: 1, height: 24, backgroundColor: '#E0E0E0', marginRight: 12 },

  /* License Upload Box */
  uploadCard: {
    borderWidth: 1.5,
    borderColor: '#C0C0C0',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: '#FFF',
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  uploadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  uploadSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, marginTop: 8 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#C0C0C0',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 2
  },
  checkboxActive: { backgroundColor: '#095C37', borderColor: '#095C37' },
  checkboxText: { flex: 1, fontSize: 12, color: '#666', lineHeight: 18 },
  linkText: { color: '#967000', fontWeight: '600' },
  
  signupBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  signupBtnText: { fontSize: 16, fontWeight: '700', color: '#333' },
  
  footer: { alignItems: 'center' },
  footerText: { fontSize: 13, color: '#666' },
  footerLink: { color: '#095C37', fontWeight: '700' },
});