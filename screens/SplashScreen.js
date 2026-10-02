import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Button from '../components/ui/Button';
import LanguageToggle from '../components/LanguageToggle';
import { useI18n } from '../i18n';
import { COLORS, FONTS, SPACE, TYPE } from '../theme';

// First screen for someone without an account: the name, what it does, the
// language, and the two ways in.
export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACE.xxxl, paddingBottom: insets.bottom + SPACE.xxl }]}>
      <StatusBar style="light" />
      <Text style={styles.wordmark} accessibilityRole="header">Indang<Text style={styles.wordmarkGo}>GO</Text></Text>

      <View style={styles.pitch}>
        <Text style={styles.headline}>{t('splash.headline')}</Text>
        <Text style={styles.subhead}>{t('splash.subhead')}</Text>
      </View>

      <LanguageToggle tone="onBrand" style={styles.language} />
      <Button label={t('splash.getStarted')} variant="hire" onPress={() => navigation.replace('Register')} style={styles.primary} />
      <Button label={t('splash.haveAccount')} variant="onBrand" onPress={() => navigation.replace('Login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.brand, paddingHorizontal: SPACE.xxl },
  wordmark: { fontFamily: FONTS.bold, fontSize: 40, lineHeight: 46, color: COLORS.onBrand },
  wordmarkGo: { color: COLORS.accent },
  pitch: { flex: 1, justifyContent: 'center' },
  headline: { ...TYPE.display, fontSize: 40, lineHeight: 46, color: COLORS.onBrand },
  subhead: { ...TYPE.body, fontSize: 17, lineHeight: 25, color: 'rgba(255,255,255,0.88)', marginTop: SPACE.lg, maxWidth: 340 },
  language: { marginBottom: SPACE.xl },
  primary: { marginBottom: SPACE.md },
});
