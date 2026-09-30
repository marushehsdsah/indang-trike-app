import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { useApp } from '../context/AppContext';

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, error: sessionError, restore } = useApp();
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Hero and card scroll together: the card's negative offset overlaps a
            sibling, which Android will not clip the way it clips scroll content. */}
        <ScrollView
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
            <View style={styles.mark}>
              <MaterialCommunityIcons name="rickshaw" size={24} color={COLORS.brand} />
            </View>
            <Text style={styles.heroTitle}>Welcome back</Text>
            <Text style={styles.heroSub}>Sign in to ride or drive around Indang.</Text>
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.card}>
              <Field
                label="Mobile number"
                icon="phone"
                placeholder="0912 345 6789"
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                value={account}
                onChangeText={setAccount}
              />
              <Field
                label="Password"
                icon="lock"
                placeholder="Your password"
                secure
                value={password}
                onChangeText={setPassword}
                style={styles.lastField}
              />

              {(error || sessionError) && <Text accessibilityRole="alert" style={[TYPE.caption, { color: COLORS.danger, marginBottom: SPACE.md }]}>{error || sessionError}</Text>}
              {sessionError && <Button label="Retry saved session" variant="ghost" size="sm" onPress={restore} />}
              <Button label="Log in" trailingIcon="arrow-right" loading={submitting} onPress={login} />
            </View>

            <View style={styles.footer}>
              <Text style={TYPE.caption}>New to IndangGO? </Text>
              <Pressable
                onPress={() => navigation.navigate('Register')}
                accessibilityRole="button"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[TYPE.captionStrong, styles.footerLink]}>Create an account</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: SPACE.xxl, paddingBottom: SPACE.xxxl + SPACE.xxl,
    borderBottomLeftRadius: RADIUS.xxl, borderBottomRightRadius: RADIUS.xxl,
  },
  mark: {
    width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg,
  },
  heroTitle: { ...TYPE.title, color: COLORS.onBrand },
  heroSub: { ...TYPE.body, color: 'rgba(255,255,255,0.78)', marginTop: SPACE.xs + 2 },

  body: { paddingHorizontal: SPACE.xl, marginTop: -SPACE.xxxl },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACE.xl,
    shadowColor: '#0E1512', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 6,
  },
  lastField: { marginBottom: SPACE.sm },
  forgot: { alignSelf: 'flex-end', paddingVertical: SPACE.sm, marginBottom: SPACE.md },
  forgotText: { color: COLORS.brand },
  pressed: { opacity: 0.6 },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACE.xxl },
  footerLink: { color: COLORS.brand },
});
