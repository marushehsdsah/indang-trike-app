import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import KeyboardAwareScrollView from '../components/ui/KeyboardAwareScrollView';
import { COLORS, SPACE, TYPE } from '../theme';
import { useI18n } from '../i18n';
import { requestApi } from '../services/api';
import { successFeedback, warningFeedback } from '../utils/feedback';
import { normalizePhilippinePhone } from '../utils/registration';

// Forgot password in three steps: the email of the account with the mobile
// number typed on Log in gets a 6-digit code (sent as soon as the screen opens),
// the code is checked, then a new password replaces the old one (which also
// logs the account out of every phone). The email is shown only masked.
export default function ForgotPasswordScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState(route?.params?.phone ?? '');
  const [maskedEmail, setMaskedEmail] = useState('');
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

  const run = async (action) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); }
    catch (failure) { warningFeedback(); setError(failure.message); }
    finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    if (!normalizePhilippinePhone(phone)) throw new Error(t('forgot.invalidPhone'));
    const sent = await requestApi('/password/code', { body: { phone } });
    setMaskedEmail(sent.email); setCode(''); setResendAt(Date.now() + 60000); setNow(Date.now()); setStep('code');
  });
  // A number typed on Log in gets its code straight away.
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSent.current || !normalizePhilippinePhone(phone)) return;
    autoSent.current = true;
    sendCode();
  }, []);
  const checkCode = () => run(async () => {
    if (!/^\d{6}$/.test(code)) throw new Error(t('forgot.codeLength'));
    await requestApi('/password/verify', { body: { phone, code } });
    setStep('password');
  });
  const changePassword = () => run(async () => {
    if (password.length < 8) throw new Error(t('forgot.passwordShort'));
    if (password !== confirmPassword) throw new Error(t('forgot.passwordMismatch'));
    try { await requestApi('/password/reset', { body: { phone, code, password } }); }
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
    else if (step === 'code') setStep('phone');
    else navigation.replace('Login');
  };

  return (
    <Screen background={COLORS.surface}>
      <AppHeader title={t(step === 'password' ? 'forgot.newPasswordTitle' : 'forgot.title')} onBack={back} />
      <KeyboardAwareScrollView style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'phone' && <>
          <Text style={[TYPE.bodyMuted, styles.intro]}>{t(busy ? 'forgot.sending' : 'forgot.phoneIntro')}</Text>
          <Field
            label={t('field.phone')}
            icon="phone-outline"
            placeholder="09123456789"
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            maxLength={11}
            value={phone}
            onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 11))}
          />
        </>}

        {step === 'code' && <>
          <Text style={[TYPE.body, styles.intro]}>{t('forgot.codeSent', { email: maskedEmail })}</Text>
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

        {step === 'phone' && <Button label={t('forgot.sendCode')} variant="hire" trailingIcon="arrow-right" loading={busy} onPress={sendCode} />}
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
      </KeyboardAwareScrollView>
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
