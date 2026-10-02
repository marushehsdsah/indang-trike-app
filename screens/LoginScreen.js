import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { COLORS, SPACE, TYPE } from '../theme';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, error: sessionError, online, restore } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const login = async () => {
    if (submitting) return;
    setSubmitting(true); setError(null);
    try { await signIn(account, password); }
    catch (failure) { setError(failure.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Screen background={COLORS.surface}>
      <AppHeader title={t('login.title')} subtitle={t('login.subtitle')} onBack={() => navigation.replace('Splash')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label={t('field.phone')}
            icon="phone-outline"
            placeholder="0912 345 6789"
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="telephoneNumber"
            value={account}
            onChangeText={setAccount}
          />
          <Field
            label={t('field.password')}
            icon="lock-outline"
            placeholder={t('field.passwordPlaceholder')}
            secure
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />

          {(error || sessionError) && <Text accessibilityRole="alert" style={[TYPE.body, styles.error]}>{error || sessionError}</Text>}
          {!online && <Text style={[TYPE.caption, styles.note]}>{t('login.offline')}</Text>}
          {sessionError && <Button label={t('login.retrySession')} variant="text" size="sm" onPress={restore} style={styles.note} />}
          <Button label={t('login.submit')} variant="hire" trailingIcon="arrow-right" loading={submitting} onPress={login} />

          <View style={styles.footer}>
            <Text style={TYPE.body}>{t('login.newHere')} </Text>
            <Pressable onPress={() => navigation.replace('Register')} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12 }}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={[TYPE.bodyStrong, styles.link]}>{t('login.createAccount')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg },
  error: { color: COLORS.danger, marginBottom: SPACE.md },
  note: { marginBottom: SPACE.md },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: SPACE.xxl },
  link: { color: COLORS.brand },
  pressed: { opacity: 0.6 },
});
