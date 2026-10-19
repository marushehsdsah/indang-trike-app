import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { COLORS, SPACE, TYPE } from '../theme';
import { useI18n } from '../i18n';
import { requestApi } from '../services/api';
import { successFeedback, warningFeedback } from '../utils/feedback';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Forgot password in three steps: the account's email gets a 6-digit code,
// the code is checked, then a new password replaces the old one (which also
// logs the account out of every phone).
export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const resendWait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (resendWait === 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendWait === 0]);

  const cleanEmail = email.trim().toLowerCase();
  const run = async (action) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); }
    catch (failure) { warningFeedback(); setError(failure.message); }
    finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    if (!EMAIL_PATTERN.test(cleanEmail)) throw new Error(t('forgot.invalidEmail'));
    await requestApi('/password/code', { body: { email: cleanEmail } });
    setCode(''); setResendAt(Date.now() + 60000); setNow(Date.now()); setStep('code');
  });
  const checkCode = () => run(async () => {
    if (!/^\d{6}$/.test(code)) throw new Error(t('forgot.codeLength'));
    await requestApi('/password/verify', { body: { email: cleanEmail, code } });
    setStep('password');
  });
  const changePassword = () => run(async () => {
    if (password.length < 8) throw new Error(t('forgot.passwordShort'));
    if (password !== confirmPassword) throw new Error(t('forgot.passwordMismatch'));
    try { await requestApi('/password/reset', { body: { email: cleanEmail, code, password } }); }
    catch (failure) {
      // The code expired or ran out of tries while the new password was typed.
      if (failure.status === 400 || failure.status === 429) { setStep('code'); setCode(''); }
      throw failure;
    }
    successFeedback();
    Alert.alert(t('forgot.doneTitle'), t('forgot.doneMessage'), [{ text: t('register.continueToLogin'), onPress: () => navigation.replace('Login') }]);
  });

  const back = () => {
    setError(null);
    if (step === 'password') setStep('code');
    else if (step === 'code') setStep('email');
    else navigation.replace('Login');
  };

  return (
    <Screen background={COLORS.surface}>
      <AppHeader title={t(step === 'password' ? 'forgot.newPasswordTitle' : 'forgot.title')} onBack={back} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'email' && <>
            <Text style={[TYPE.bodyMuted, styles.intro]}>{t('forgot.emailIntro')}</Text>
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
              autoFocus
            />
          </>}

          {step === 'code' && <>
            <Text style={[TYPE.body, styles.intro]}>{t('forgot.codeSent', { email: cleanEmail })}</Text>
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
          </>}

          {step === 'password' && <>
            <Text style={[TYPE.bodyMuted, styles.intro]}>{t('forgot.passwordIntro')}</Text>
            <Field
              label={t('field.newPassword')}
              icon="lock-outline"
              placeholder={t('field.newPasswordPlaceholder')}
              secure
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              autoFocus
            />
            <Field
              label={t('field.confirmPassword')}
              icon="lock-outline"
              placeholder={t('field.confirmPasswordPlaceholder')}
              secure
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </>}

          {error && <Text accessibilityRole="alert" style={[TYPE.body, styles.error]}>{error}</Text>}

          {step === 'email' && <Button label={t('forgot.sendCode')} variant="hire" trailingIcon="arrow-right" loading={busy} onPress={sendCode} />}
          {step === 'code' && <>
            <Button label={t('forgot.verify')} variant="hire" trailingIcon="arrow-right" loading={busy} onPress={checkCode} />
            <Button
              label={resendWait ? t('register.resendIn', { seconds: resendWait }) : t('register.resend')}
              variant="text"
              size="sm"
              disabled={resendWait > 0 || busy}
              onPress={sendCode}
              style={styles.secondary}
            />
          </>}
          {step === 'password' && <Button label={t('forgot.save')} variant="hire" trailingIcon="check" loading={busy} onPress={changePassword} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg },
  intro: { marginBottom: SPACE.xl },
  error: { color: COLORS.danger, marginBottom: SPACE.md },
  secondary: { marginTop: SPACE.md },
});
