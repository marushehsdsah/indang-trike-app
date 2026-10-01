import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { SegmentedControl } from '../components/ui/Surfaces';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { SERVICE_AREA_NAME } from '../data/indangMap';
import { successFeedback, warningFeedback } from '../utils/feedback';
import { getApiBaseUrl, submitRegistration } from '../utils/registration';

const API_BASE_URL = getApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  scriptUrl: NativeModules.SourceCode?.scriptURL,
  platform: Platform.OS,
});

export default function RegisterScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [isChecked, setChecked] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [role, setRole] = useState('passenger');
  const [plate, setPlate] = useState('');
  const [toda, setToda] = useState('');
  const [capacity, setCapacity] = useState('4');

  const handleSignUp = async () => {
    if (isSubmitting) return;

    setSubmitting(true);
    try {
      const result = await submitRegistration(
        {
          firstName,
          lastName,
          email,
          phone,
          password,
          confirmPassword,
          acceptedTerms: isChecked,
          role, plate, toda, capacity: Number(capacity),
        },
        { apiBaseUrl: API_BASE_URL },
      );

      successFeedback();
      Alert.alert('Account created', result.message || 'Your account was created successfully.', [
        { text: 'Continue to Login', onPress: () => navigation.replace('Login') },
      ]);
    } catch (error) {
      warningFeedback();
      Alert.alert('Unable to sign up', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen background={COLORS.surface}>
      <AppHeader title="Create account" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Splash'))} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={TYPE.title}>{role === 'driver' ? 'Join as a driver' : 'Let’s get you riding'}</Text>
          <Text style={[TYPE.bodyMuted, styles.subtitle]}>
            {role === 'driver' ? `Receive ride requests and guide passengers around ${SERVICE_AREA_NAME}.` : `Book a trike with a real driver in ${SERVICE_AREA_NAME}.`}
          </Text>
          <SegmentedControl value={role} onChange={setRole} options={[{ value: 'passenger', label: 'Passenger' }, { value: 'driver', label: 'Driver' }]} style={{ marginBottom: SPACE.xl }} />

          <View style={styles.nameRow}>
            <Field
              label="First name"
              placeholder="Juan"
              autoCapitalize="words"
              textContentType="givenName"
              value={firstName}
              onChangeText={setFirstName}
              style={styles.nameField}
            />
            <Field
              label="Last name"
              placeholder="Dela Cruz"
              autoCapitalize="words"
              textContentType="familyName"
              value={lastName}
              onChangeText={setLastName}
              style={[styles.nameField, styles.nameFieldLast]}
            />
          </View>

          <Field
            label="Email address"
            icon="mail"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />

          <Field
            label="Mobile number"
            icon="phone"
            prefix="+63"
            placeholder="912 345 6789"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
          />

          <Field
            label="Password"
            icon="lock"
            placeholder="At least 8 characters"
            secure
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />

          {role === 'driver' && <>
            <Field label="Vehicle plate" placeholder="Your registered plate" value={plate} onChangeText={setPlate} autoCapitalize="characters" maxLength={24} />
            <Field label="TODA" placeholder="Your association" value={toda} onChangeText={setToda} maxLength={80} />
            <Field label="Passenger capacity (1–4)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={1} />
          </>}

          <Field
            label="Confirm password"
            icon="lock"
            placeholder="Re-enter your password"
            secure
            textContentType="newPassword"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Pressable
            style={styles.terms}
            onPress={() => setChecked((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            accessibilityLabel="Accept the Terms of Service and Privacy Policy"
          >
            <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
              {isChecked && <Feather name="check" size={14} color={COLORS.onBrand} />}
            </View>
            <Text style={[TYPE.caption, styles.termsText]}>
              I agree to the <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
            </Text>
          </Pressable>

          <Button
            label="Create account"
            trailingIcon="arrow-right"
            onPress={handleSignUp}
            loading={isSubmitting}
            accessibilityLabel="Sign Up"
          />

          <View style={styles.footer}>
            <Text style={TYPE.caption}>Already have an account? </Text>
            <Pressable
              onPress={() => navigation.replace('Login')}
              accessibilityRole="button"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={[TYPE.captionStrong, styles.footerLink]}>Log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm },
  subtitle: { marginTop: SPACE.xs + 2, marginBottom: SPACE.xxl },

  nameRow: { flexDirection: 'row' },
  nameField: { flex: 1 },
  nameFieldLast: { marginLeft: SPACE.md },

  terms: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACE.xl },
  checkbox: {
    width: 22, height: 22, borderRadius: RADIUS.sm - 2,
    borderWidth: 1.5, borderColor: COLORS.lineStrong,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACE.md, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  termsText: { flex: 1 },
  termsLink: { color: COLORS.brand, fontWeight: '700' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACE.xl },
  footerLink: { color: COLORS.brand },
  pressed: { opacity: 0.6 },
});
