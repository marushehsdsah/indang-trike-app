import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import IconButton from '../components/ui/IconButton';
import KeyboardAwareScrollView from '../components/ui/KeyboardAwareScrollView';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { SERVICE_AREA_NAME } from '../data/indangMap';

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
    <View style={styles.screen}>
      <StatusBar style="light" />
      {/* Hero and card scroll together: the card's negative offset overlaps a
          sibling, which Android will not clip the way it clips scroll content. */}
      <KeyboardAwareScrollView style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[COLORS.brand, COLORS.brandDark]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + SPACE.xxl }]}
        >
          <IconButton icon="arrow-left" label={t('common.back')} tone="brand" raised={false} onPress={() => navigation.replace('Splash')}
            style={[styles.back, { top: insets.top + SPACE.sm }]} />
          <View style={styles.mark}>
            <MaterialCommunityIcons name="rickshaw" size={34} color={COLORS.brand} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">Indang<Text style={styles.heroTitleGo}>GO</Text></Text>
          <Text style={styles.heroSub}>{t('login.tagline')}</Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={TYPE.title}>{t('login.welcome')}</Text>
            <Text style={[TYPE.bodyMuted, styles.cardSub]}>{t('login.cardIntro', { area: SERVICE_AREA_NAME })}</Text>
            <Field
              label={t('field.phone')}
              icon="phone-outline"
              placeholder="09123456789"
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="telephoneNumber"
              maxLength={11}
              value={account}
              onChangeText={(text) => { setAccount(text.replace(/\D/g, '').slice(0, 11)); setError(null); }}
            />
            <Field
              label={t('field.password')}
              icon="lock-outline"
              placeholder={t('field.passwordPlaceholder')}
              secure
              textContentType="password"
              value={password}
              maxLength={72}
              onChangeText={(text) => { setPassword(text); setError(null); }}
              style={styles.lastField}
            />
            <Pressable onPress={() => navigation.replace('ForgotPassword', { phone: account })} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12 }}
              style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}>
              <Text style={[TYPE.captionStrong, styles.link]}>{t('login.forgotPassword')}</Text>
            </Pressable>

            {(error || sessionError) && <Text accessibilityRole="alert" style={[TYPE.caption, styles.error]}>{error || sessionError}</Text>}
            {!online && <Text style={[TYPE.caption, styles.note]}>{t('login.offline')}</Text>}
            {sessionError && <Button label={t('login.retrySession')} variant="text" size="sm" onPress={restore} style={styles.note} />}
            <Button label={t('login.submit')} variant="brand" trailingIcon="arrow-right" loading={submitting} onPress={login} />
          </View>

          <View style={styles.footer}>
            <Text style={TYPE.caption}>{t('login.newHere')} </Text>
            <Pressable onPress={() => navigation.replace('Register')} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12 }}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={[TYPE.captionStrong, styles.link]}>{t('login.createAccount')}</Text>
            </Pressable>
          </View>

          <View style={styles.legal}>
            <View style={styles.legalRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={13} color={COLORS.inkMuted} />
              <Text style={[TYPE.caption, styles.legalText, styles.legalIconText]}>{t('login.secure')}</Text>
            </View>
            <Text style={[TYPE.caption, styles.legalText]}>© {new Date().getFullYear()} IndangGO</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  flex: { flex: 1 },
  // Centred brand block; the card overlaps its flat bottom edge.
  hero: {
    alignItems: 'center',
    paddingHorizontal: SPACE.xxl, paddingBottom: SPACE.xxxl + SPACE.xxxl,
  },
  back: { position: 'absolute', left: SPACE.md },
  mark: {
    width: 64, height: 64, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md,
  },
  heroTitle: { ...TYPE.title, color: COLORS.onBrand },
  // The splash screen's wordmark: "GO" in the yellow accent.
  heroTitleGo: { color: COLORS.accent },
  heroSub: { ...TYPE.body, color: 'rgba(255,255,255,0.78)', marginTop: SPACE.xs, textAlign: 'center' },
  cardSub: { marginTop: SPACE.xs, marginBottom: SPACE.xl },

  body: { paddingHorizontal: SPACE.xl, marginTop: -SPACE.xxxl },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACE.xl,
    shadowColor: '#0E1512', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 6,
  },
  lastField: { marginBottom: SPACE.sm },
  forgot: { alignSelf: 'flex-end', paddingVertical: SPACE.sm, marginBottom: SPACE.md },
  link: { color: COLORS.brand },
  error: { color: COLORS.danger, marginBottom: SPACE.md },
  note: { marginBottom: SPACE.md },
  pressed: { opacity: 0.6 },

  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: SPACE.xxl },
  legal: { alignItems: 'center', marginTop: SPACE.xxl },
  legalRow: { flexDirection: 'row', alignItems: 'center' },
  legalText: { color: COLORS.inkMuted, fontSize: 11, lineHeight: 16 },
  legalIconText: { marginLeft: 3 },
});
