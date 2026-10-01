import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Button from '../components/ui/Button';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { SERVICE_AREA_NAME } from '../data/indangMap';

const HIGHLIGHTS = [
  { icon: 'map-marker-path', label: 'Road-accurate routes' },
  { icon: 'wifi-off', label: 'Offline route guidance' },
  { icon: 'account-group-outline', label: 'Passenger and driver accounts' },
];

export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={[COLORS.brand, COLORS.brandDark]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.content, { paddingTop: insets.top + SPACE.xxxl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <View style={styles.brandRow}>
          <View style={styles.mark}>
            <MaterialCommunityIcons name="rickshaw" size={26} color={COLORS.brand} />
          </View>
          <Text style={styles.wordmark}>IndangGO</Text>
        </View>

        <View style={styles.pitch}>
          <Text style={styles.headline}>Tricycle rides{'\n'}across {SERVICE_AREA_NAME}.</Text>
          <Text style={styles.subhead}>
            Book a trike, follow the real road route, and know the fare before you ride.
          </Text>
        </View>

        <View style={styles.highlights}>
          {HIGHLIGHTS.map(({ icon, label }) => (
            <View key={label} style={styles.highlight}>
              <MaterialCommunityIcons name={icon} size={16} color={COLORS.accent} />
              <Text style={styles.highlightText}>{label}</Text>
            </View>
          ))}
        </View>

        <Button label="Get started" onPress={() => navigation.replace('Register')} style={styles.primary} />
        <Button label="I already have an account" variant="outlineLight" onPress={() => navigation.replace('Login')} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACE.xxl },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  mark: {
    width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  wordmark: { ...TYPE.heading, color: COLORS.onBrand, marginLeft: SPACE.md },

  // The pitch takes the space between the brand row and the actions.
  pitch: { flex: 1, justifyContent: 'center' },
  headline: { ...TYPE.display, fontSize: 38, lineHeight: 44, color: COLORS.onBrand },
  subhead: { ...TYPE.body, color: 'rgba(255,255,255,0.78)', marginTop: SPACE.lg, maxWidth: 320 },

  highlights: { marginBottom: SPACE.xxl },
  highlight: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md },
  highlightText: { ...TYPE.caption, color: 'rgba(255,255,255,0.85)', marginLeft: SPACE.sm + 2 },

  primary: { marginBottom: SPACE.md },
});
