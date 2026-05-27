import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function RegisterScreen({ navigation }) {
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isConfirmVisible, setConfirmVisible] = useState(false);
  const [isChecked, setChecked] = useState(false);

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
          
          <View style={styles.titleContainer}>
            <Text style={styles.mainTitle}>Create Account</Text>
            <Text style={styles.subTitle}>Join our neighborhood of reliable rides.</Text>
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

          {/* Terms Checkbox */}
          <View style={styles.checkboxRow}>
            <TouchableOpacity style={[styles.checkbox, isChecked && styles.checkboxActive]} onPress={() => setChecked(!isChecked)}>
              {isChecked && <Feather name="check" size={14} color="#FFF" />}
            </TouchableOpacity>
            <Text style={styles.checkboxText}>
              By signing up, you agree to our <Text style={styles.linkText}>Terms of Service</Text> and <Text style={styles.linkText}>Privacy Policy</Text>.
            </Text>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity style={styles.signupBtn}>
            <Text style={styles.signupBtnText}>Sign Up</Text>
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
  
  titleContainer: { alignItems: 'center', marginTop: 10, marginBottom: 30 },
  mainTitle: { fontSize: 26, fontWeight: '700', color: '#333', marginBottom: 8 },
  subTitle: { fontSize: 13, color: '#666' },
  
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