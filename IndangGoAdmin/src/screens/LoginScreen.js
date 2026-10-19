// =============================================================
// screens/LoginScreen.js
// -------------------------------------------------------------
// Login screen: Admin ID field + Password field with a show/hide
// eye toggle, a Login button, and a back button (top left) that
// returns to the IndangGO app's splash screen.
//
// NON-FUNCTIONAL NOTE:
// There is no real authentication here. Pressing "Login" simply
// calls navigation.replace('Welcome'), which moves the app to the
// Welcome/Splash screen. `replace` (not `navigate`) is used so
// Login isn't left underneath in the stack — the user can't swipe
// or press back into it once they're through. Swap the body of
// handleLogin() for a real API call when you're ready.
//
// HOW TO EDIT:
// - App name / tagline text is in the JSX below ("Indang Go Admin").
// - Colors come from ../theme/colors.js.
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
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function LoginScreen({ navigation }) {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // The IndangGO app's navigator, which shows these admin screens as one
  // of its routes. Run on its own (App.js) there is none, and the back
  // button is hidden.
  const appNavigation = navigation.getParent();

  const handleLogin = () => {
    // TODO: replace with a real authentication call.
    // For this design mockup, any tap on Login just "succeeds".
    navigation.replace('Welcome');
  };

  // Starts the app over at its splash screen, so back can't return here.
  const handleBack = () => {
    appNavigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  };

  return (
    // Android draws edge-to-edge, so the window no longer shrinks for the
    // keyboard; padding keeps the form scrollable above it on both platforms.
    // "handled" lets the first tap on Login log in while the keyboard is open,
    // instead of only closing the keyboard.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={{ backgroundColor: colors.brandYellow }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Top brand section ---- */}
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <Ionicons name="car" size={30} color={colors.brandGreenDark} />
          </View>
          <Text style={styles.brandTitle}>Admin</Text>
          <Text style={styles.brandSubtitle}>Your neighborhood ride, faster.</Text>
        </View>

        {/* ---- Login card ---- */}
        <View style={styles.card}>
          <Text style={styles.label}>Admin ID</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-circle-outline" size={20} color={colors.brandGreenDark} />
            <TextInput
              style={styles.input}
              placeholder="e.g. 8821"
              placeholderTextColor={colors.placeholder}
              value={adminId}
              onChangeText={setAdminId}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Password</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.forgotText}>Forgot?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.brandGreenDark} />
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor={colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
            />
            {/* ---- Show / hide password toggle ---- */}
            <TouchableOpacity
              onPress={() => setIsPasswordVisible((prev) => !prev)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.85}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>Secure neighborhood transit</Text>
        <Text style={styles.footerText}>© 2026 Indang Go</Text>
      </ScrollView>

      {/* ---- Back to the app's splash screen (stays put while scrolling) ---- */}
      {appNavigation && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.brandGreenDark} />
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 30,
  },
  brandSection: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brandGreenDark,
  },
  brandSubtitle: {
    fontSize: 13,
    color: colors.brandGreenDark,
    marginTop: 4,
  },
  card: {
    width: '88%',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  forgotText: {
    fontSize: 12,
    color: colors.brandGreen,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  loginButton: {
    backgroundColor: colors.brandGreenDark,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  loginButtonText: {
    color: colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.brandGreenDark,
    opacity: 0.7,
    marginTop: 6,
  },
});
