import React, { useEffect, useState } from 'react';
import {
  Alert, NativeModules, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetch } from 'expo/fetch';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import KeyboardAwareScrollView from '../components/ui/KeyboardAwareScrollView';
import TodaPicker from '../components/TodaPicker';
import { SegmentedControl } from '../components/ui/Surfaces';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { useI18n } from '../i18n';
import { successFeedback, warningFeedback } from '../utils/feedback';
import { cleanLocalPhone, getApiBaseUrl, requestRegistrationCode, sanitizeName, submitRegistration, validateRegistration } from '../utils/registration';

const API_BASE_URL = getApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  scriptUrl: NativeModules.SourceCode?.scriptURL,
  platform: Platform.OS,
});

export default function RegisterScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
  // After the form is sent, the email the code went to; the screen then asks
  // for the code. resendAt is when another code may be asked for.
  const [codeSentTo, setCodeSentTo] = useState(null);
  // The email of the last code sent; it stays set after "Change my details".
  const [sentEmail, setSentEmail] = useState(null);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const resendWait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (!codeSentTo || resendWait === 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [codeSentTo, resendWait === 0]);

  const form = {
    firstName, lastName, email, phone, password, confirmPassword, acceptedTerms: isChecked,
    role, plate, toda, capacity: Number(capacity),
  };

  const sendCode = async () => {
    if (isSubmitting) return;

    // Back from "Change my details" within the minute, with the same email: the
    // code already sent still works (the server would refuse a new one yet),
    // so return to it. Changed details are checked again on submit.
    if (email.trim().toLowerCase() === sentEmail && Date.now() < resendAt) {
      const invalid = validateRegistration(form);
      if (invalid) { warningFeedback(); Alert.alert(t('register.unable'), invalid); return; }
      setCodeSentTo(sentEmail); setNow(Date.now());
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestRegistrationCode(form, { apiBaseUrl: API_BASE_URL, fetchImpl: fetch });
      const sentTo = result.email || email.trim().toLowerCase();
      setCodeSentTo(sentTo); setSentEmail(sentTo);
      setCode(''); setResendAt(Date.now() + 60000); setNow(Date.now());
    } catch (error) {
      warningFeedback();
      Alert.alert(t('register.unable'), error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (isSubmitting) return;

    setSubmitting(true);
    try {
      const result = await submitRegistration({ ...form, code }, { apiBaseUrl: API_BASE_URL, fetchImpl: fetch });

      successFeedback();
      Alert.alert(t('register.createdTitle'), result.message || t('register.createdMessage'), [
        { text: t('register.continueToLogin'), onPress: () => navigation.replace('Login') },
      ]);
    } catch (error) {
      warningFeedback();
      Alert.alert(t('register.unable'), error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen background={COLORS.surface}>
      <AppHeader
        title={t(codeSentTo ? 'register.codeTitle' : 'register.title')}
        onBack={() => (codeSentTo ? setCodeSentTo(null) : navigation.canGoBack() ? navigation.goBack() : navigation.replace('Splash'))}
      />

      <KeyboardAwareScrollView style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {codeSentTo ? <>
          <Text style={[TYPE.body, styles.subtitle]}>{t('register.codeSent', { email: codeSentTo })}</Text>
          <Field
            label={t('field.code')}
            icon="email-check-outline"
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
            autoFocus
          />
          <Button
            label={t('register.submit')}
            variant="hire"
            trailingIcon="arrow-right"
            onPress={handleSignUp}
            loading={isSubmitting}
          />
          <Button
            label={resendWait ? t('register.resendIn', { seconds: resendWait }) : t('register.resend')}
            variant="text"
            size="sm"
            disabled={resendWait > 0 || isSubmitting}
            onPress={sendCode}
            style={styles.codeAction}
          />
          <Button label={t('register.editDetails')} variant="text" size="sm" onPress={() => setCodeSentTo(null)} />
        </> : <>
        <SegmentedControl value={role} onChange={setRole} options={[{ value: 'passenger', label: t('register.passenger') }, { value: 'driver', label: t('register.driver') }]} />
        <Text style={[TYPE.bodyMuted, styles.subtitle]}>{t(role === 'driver' ? 'register.driverPitch' : 'register.passengerPitch')}</Text>

        <View style={styles.nameRow}>
          <Field
            label={t('field.firstName')}
            placeholder="Juan"
            autoCapitalize="words"
            textContentType="givenName"
            value={firstName}
            onChangeText={(text) => setFirstName(sanitizeName(text))}
            style={styles.nameField}
          />
          <Field
            label={t('field.lastName')}
            placeholder="Dela Cruz"
            autoCapitalize="words"
            textContentType="familyName"
            value={lastName}
            onChangeText={(text) => setLastName(sanitizeName(text))}
            style={[styles.nameField, styles.nameFieldLast]}
          />
        </View>

        <Field
          label={t('field.email')}
          icon="email-outline"
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />

        <Field
          label={t('field.phone')}
          icon="phone-outline"
          prefix="+63"
          placeholder="912 345 6789"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          value={phone}
          maxLength={10}
          onChangeText={(text) => setPhone(cleanLocalPhone(text))}
        />

        <Field
          label={t('field.password')}
          icon="lock-outline"
          placeholder={t('field.newPasswordPlaceholder')}
          secure
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />

        {role === 'driver' && <>
          <Field label={t('field.plate')} placeholder={t('field.platePlaceholder')} value={plate} onChangeText={setPlate} autoCapitalize="characters" maxLength={24} />
          <TodaPicker value={toda} onChange={setToda} />
          <Field label={t('field.capacity')} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={1} />
        </>}

        <Field
          label={t('field.confirmPassword')}
          icon="lock-outline"
          placeholder={t('field.confirmPasswordPlaceholder')}
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
          accessibilityLabel={t('register.termsA11y')}
        >
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
            {isChecked && <MaterialCommunityIcons name="check-bold" size={16} color={COLORS.onBrand} />}
          </View>
          <Text style={[TYPE.body, styles.termsText]}>{t('register.terms')}</Text>
        </Pressable>

        <Button
          label={t('register.sendCode')}
          variant="hire"
          trailingIcon="arrow-right"
          onPress={sendCode}
          loading={isSubmitting}
        />
        </>}

        <View style={styles.footer}>
          <Text style={TYPE.body}>{t('register.haveAccount')} </Text>
          <Pressable
            onPress={() => navigation.replace('Login')}
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12 }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={[TYPE.bodyStrong, styles.footerLink]}>{t('register.logIn')}</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm },
  subtitle: { marginTop: SPACE.md, marginBottom: SPACE.xl },

  nameRow: { flexDirection: 'row' },
  nameField: { flex: 1 },
  nameFieldLast: { marginLeft: SPACE.md },

  terms: { flexDirection: 'row', alignItems: 'center', minHeight: 48, marginBottom: SPACE.xl },
  checkbox: {
    width: 24, height: 24, borderRadius: RADIUS.sm - 2,
    borderWidth: 2, borderColor: COLORS.inkSecondary,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACE.md,
  },
  checkboxChecked: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  termsText: { flex: 1 },

  codeAction: { marginTop: SPACE.md },

  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: SPACE.xl },
  footerLink: { color: COLORS.brand },
  pressed: { opacity: 0.6 },
});
