import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { Avatar, Card, Money } from '../components/ui/Surfaces';
import BottomNav from '../components/BottomNav';
import ConnectionBanner from '../components/ConnectionBanner';
import OfflineMapCard from '../components/OfflineMapCard';
import TodaPicker from '../components/TodaPicker';
import LanguageToggle from '../components/LanguageToggle';
import Plate from '../components/Plate';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import useAccountHistory from '../hooks/useAccountHistory';
import { userName } from '../utils/rideState';
import { COLORS, FONTS, SPACE, TYPE } from '../theme';

export default function ProfileScreen({ navigation }) {
  const { user, request, refresh, signOut } = useApp(), { stats } = useAccountHistory();
  const { t } = useI18n();
  const [editing, setEditing] = useState(!user.profileComplete), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const driver = user.role === 'driver';
  useEffect(() => { setForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, plate: user.plate || '', toda: user.toda || '', capacity: String(user.capacity || 4) }); },
    [user.id, user.firstName, user.lastName, user.email, user.plate, user.toda, user.capacity]);
  const field = (key) => ({ value: form[key] || '', onChangeText: (value) => setForm((previous) => ({ ...previous, [key]: value })) });
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await request('/me', { ...form, capacity: Number(form.capacity) }, 'PATCH');
      await refresh(); setEditing(false);
      if (!user.profileComplete) navigation.navigate(driver ? 'Driver' : 'Passenger');
    } catch (failure) { Alert.alert(t('profile.unableToSave'), failure.message); }
    finally { setBusy(false); }
  };
  const logOut = () => signOut().catch(() => Alert.alert(t('profile.loggedOutTitle'), t('profile.loggedOutMessage')));
  return <Screen>
    <AppHeader title={t('profile.title')} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ConnectionBanner />
        <Card>
          <View style={styles.row}>
            <Avatar name={userName(user)} size={56} />
            <View style={styles.flex}>
              <Text style={TYPE.heading} numberOfLines={1}>{userName(user)}</Text>
              <Text style={TYPE.caption}>{user.phone} · {t(driver ? 'profile.roleDriver' : 'profile.rolePassenger')}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            <View style={styles.flex}>
              <Text style={styles.statValue}>{stats?.trips ?? '—'}</Text>
              <Text style={TYPE.caption}>{t('profile.completedTrips')}</Text>
            </View>
            <View style={styles.flex}>
              {stats ? <Money amount={stats.totalFare} size={24} /> : <Text style={styles.statValue}>—</Text>}
              <Text style={TYPE.caption}>{t(driver ? 'profile.cashEarned' : 'profile.farePaid')}</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          {!user.profileComplete && <Text style={[TYPE.body, styles.incomplete]}>{t('profile.complete')}</Text>}
          {editing ? <>
            <Field label={t('field.firstName')} {...field('firstName')} maxLength={80} />
            <Field label={t('field.lastName')} {...field('lastName')} maxLength={80} />
            <Field label={t('field.email')} {...field('email')} autoCapitalize="none" keyboardType="email-address" />
            {driver && <>
              <Field label={t('field.plate')} {...field('plate')} autoCapitalize="characters" maxLength={24} />
              <TodaPicker value={form.toda || ''} onChange={(value) => setForm((previous) => ({ ...previous, toda: value }))} />
              <Field label={t('field.capacity')} {...field('capacity')} keyboardType="number-pad" maxLength={1} />
            </>}
            <Button label={t('profile.save')} variant="brand" loading={busy} onPress={save} />
            {user.profileComplete && <Button label={t('profile.cancelEdit')} variant="text" onPress={() => setEditing(false)} style={styles.below} />}
          </> : <>
            <Text style={TYPE.body}>{user.email}</Text>
            {driver && <View style={styles.vehicle}>
              <Plate plate={user.plate} toda={user.toda} size="sm" />
              <Text style={[TYPE.caption, styles.flex]}>{t('profile.capacity', { count: user.capacity })}</Text>
            </View>}
            <Button label={t('profile.edit')} variant="outline" size="md" onPress={() => setEditing(true)} style={styles.below} />
          </>}
        </Card>

        <Card style={styles.section}>
          <Text style={[TYPE.subheading, styles.sectionTitle]}>{t('profile.language')}</Text>
          <LanguageToggle />
        </Card>

        <OfflineMapCard style={styles.section} />

        <View style={styles.privacy}>
          <MaterialCommunityIcons name="map-marker-account-outline" size={22} color={COLORS.inkSecondary} />
          <Text style={[TYPE.caption, styles.flex]}>{t(driver ? 'profile.privacyDriver' : 'profile.privacyPassenger')}</Text>
        </View>
        <Button label={t('profile.logOut')} variant="danger" size="md" onPress={logOut} />
      </ScrollView>
    </KeyboardAvoidingView>
    <BottomNav active="profile" navigation={navigation} />
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stats: { flexDirection: 'row', marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: 1, borderTopColor: COLORS.line },
  statValue: { fontFamily: FONTS.bold, fontSize: 24, lineHeight: 28, color: COLORS.ink },
  section: { marginTop: SPACE.md },
  sectionTitle: { marginBottom: SPACE.md },
  incomplete: { marginBottom: SPACE.lg },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.md },
  below: { marginTop: SPACE.md },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, marginVertical: SPACE.xl },
});
