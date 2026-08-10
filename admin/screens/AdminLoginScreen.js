// =============================================================
// admin/screens/AdminLoginScreen.js  (ADMIN ONLY)
// -------------------------------------------------------------
// Renamed from LoginScreen.js (standalone admin project) to avoid
// colliding with the trike app's own LoginScreen.js.
//
// NON-FUNCTIONAL NOTE: no real authentication — Login just calls
// navigation.replace('AdminWelcome'). 'AdminWelcome' is a route
// name inside THIS nested navigator (AdminNavigator.js), not the
// outer AppNavigator.
// =============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import adminColors from '../theme/adminColors';

export default function AdminLoginScreen({ navigation }) {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleLogin = () => {
    // TODO: replace with a real authentication call.
    navigation.replace('AdminWelcome');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={{ backgroundColor: adminColors.brandYellow }}
      >
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <Ionicons name="car" size={30} color={adminColors.brandGreenDark} />
          </View>
          <Text style={styles.brandTitle}>Admin</Text>
          <Text style={styles.brandSubtitle}>Your neighborhood ride, faster.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Admin ID</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-circle-outline" size={20} color={adminColors.brandGreenDark} />
            <TextInput
              style={styles.input}
              placeholder="e.g. 8821"
              placeholderTextColor={adminColors.placeholder}
              value={adminId}
              onChangeText={setAdminId}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Password</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} color={adminColors.brandGreenDark} />
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor={adminColors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
            />
            <TouchableOpacity
              onPress={() => setIsPasswordVisible((prev) => !prev)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color={adminColors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.85}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>

          
        </View>

        <Text style={styles.copyright}>
          <Feather name="shield" size={10} /> Secure neighborhood transit{'\n'}
          © 2026 Indang Go
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingBottom: 30 },
  brandSection: { alignItems: 'center', paddingTop: 60, paddingBottom: 30 },
  logoCircle: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: adminColors.card,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  brandTitle: { fontSize: 22, fontWeight: '800', color: adminColors.brandGreenDark },
  brandSubtitle: { fontSize: 13, color: adminColors.brandGreenDark, marginTop: 4 },
  card: {
    width: '88%', backgroundColor: adminColors.card, borderRadius: 20, padding: 22,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  label: { fontSize: 13, fontWeight: '600', color: adminColors.textPrimary, marginBottom: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  forgotText: { fontSize: 12, color: adminColors.brandGreen, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: adminColors.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 6, gap: 8,
  },
  input: { flex: 1, fontSize: 15, color: adminColors.textPrimary },
  loginButton: {
    backgroundColor: adminColors.brandGreenDark, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
  },
  loginButtonText: { color: adminColors.textOnDark, fontSize: 16, fontWeight: '700' },
  createAccountRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  mutedText: { color: adminColors.textSecondary, fontSize: 13 },
  createAccountText: { color: adminColors.brandGreen, fontSize: 13, fontWeight: '700' },
  footerText: { fontSize: 11, color: adminColors.brandGreenDark, opacity: 0.7, marginTop: 6 },
  copyright: { fontSize: 10, color: '#999', textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
