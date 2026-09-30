import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { Avatar, Card } from '../components/ui/Surfaces';
import BottomNav from '../components/BottomNav';
import ConnectionBanner from '../components/ConnectionBanner';
import { useApp } from '../context/AppContext';
import useAccountHistory from '../hooks/useAccountHistory';
import { formatFare, userName } from '../utils/rideState';
import { COLORS, SPACE, TYPE } from '../theme';

export default function ProfileScreen({ navigation }) {
  const { user, request, refresh, signOut } = useApp(), { stats } = useAccountHistory();
  const [editing, setEditing] = useState(!user.profileComplete), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  useEffect(() => { setForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, plate: user.plate || '', toda: user.toda || '', capacity: String(user.capacity || 4) }); },
    [user.id, user.firstName, user.lastName, user.email, user.plate, user.toda, user.capacity]);
  const field = (key) => ({ value: form[key] || '', onChangeText: (value) => setForm((previous) => ({ ...previous, [key]: value })) });
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await request('/me', { ...form, capacity: Number(form.capacity) }, 'PATCH');
      await refresh(); setEditing(false);
      if (!user.profileComplete) navigation.navigate(user.role === 'driver' ? 'Driver' : 'Passenger');
    } catch (failure) { Alert.alert('Unable to save', failure.message); }
    finally { setBusy(false); }
  };
  return <Screen>
    <AppHeader title="Your profile" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ConnectionBanner />
        <Card>
          <View style={styles.row}><Avatar name={userName(user)} size={54} /><View style={{ flex: 1 }}><Text style={TYPE.heading}>{userName(user)}</Text><Text style={TYPE.caption}>{user.phone} · {user.role}</Text></View></View>
          <View style={[styles.row, { marginTop: SPACE.lg, justifyContent: 'space-between' }]}>
            <View><Text style={TYPE.subheading}>{stats?.trips ?? '—'}</Text><Text style={TYPE.caption}>Completed trips</Text></View>
            <View><Text style={TYPE.subheading}>{stats ? formatFare(stats.totalFare) : '—'}</Text><Text style={TYPE.caption}>{user.role === 'driver' ? 'Cash fares earned' : 'Trip fares'}</Text></View>
          </View>
        </Card>
        <Card style={styles.section}>
          {!user.profileComplete && <Text style={[TYPE.body, { marginBottom: SPACE.lg }]}>Complete your profile to start using IndangGO.</Text>}
          {editing ? <>
            <Field label="First name" {...field('firstName')} maxLength={80} />
            <Field label="Last name" {...field('lastName')} maxLength={80} />
            <Field label="Email" {...field('email')} autoCapitalize="none" keyboardType="email-address" />
            {user.role === 'driver' && <>
              <Field label="Vehicle plate" {...field('plate')} autoCapitalize="characters" maxLength={24} />
              <Field label="TODA" {...field('toda')} maxLength={80} />
              <Field label="Passenger capacity (1–4)" {...field('capacity')} keyboardType="number-pad" maxLength={1} />
            </>}
            <Button label="Save profile" loading={busy} onPress={save} />
            {user.profileComplete && <Button label="Cancel editing" variant="ghost" onPress={() => setEditing(false)} />}
          </> : <>
            <Text style={TYPE.body}>{user.email}</Text>
            {user.role === 'driver' && <Text style={[TYPE.caption, { marginTop: SPACE.sm }]}>{user.plate} · {user.toda} · {user.capacity} passengers</Text>}
            <Button label="Edit profile" variant="secondary" onPress={() => setEditing(true)} style={{ marginTop: SPACE.lg }} />
          </>}
        </Card>
        <Text style={[TYPE.caption, { marginVertical: SPACE.lg }]}>Location is used while this app is open. Drivers must keep the app open to receive requests and share live trip location.</Text>
        <Button label="Log out" variant="danger" onPress={() => signOut().catch(() => Alert.alert('Logged out on this device', 'The server could not be reached. Your local session has been removed.'))} />
      </ScrollView>
    </KeyboardAvoidingView>
    <BottomNav active="profile" navigation={navigation} />
  </Screen>;
}
const styles = StyleSheet.create({ content: { padding: SPACE.lg, paddingBottom: SPACE.xxxl }, row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md }, section: { marginTop: SPACE.lg } });
