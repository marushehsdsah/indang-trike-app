import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import { Card, Badge, EmptyState, SegmentedControl } from '../components/ui/Surfaces';
import BottomNav from '../components/BottomNav';
import ConnectionBanner from '../components/ConnectionBanner';
import useAccountHistory from '../hooks/useAccountHistory';
import { useApp } from '../context/AppContext';
import { formatFare, STATUS_LABELS } from '../utils/rideState';
import { COLORS, SPACE, TYPE } from '../theme';

export default function HistoryScreen({ navigation }) {
  const { user } = useApp(), { rides, loading, error, fromCache, reload } = useAccountHistory();
  const [filter, setFilter] = useState('all');
  const visible = rides.filter((ride) => filter === 'all' || ride.status === filter);
  return <Screen>
    <AppHeader title={user.role === 'driver' ? 'Your trips' : 'Your rides'} />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <ConnectionBanner />
      {fromCache && <Text style={[TYPE.caption, { marginBottom: SPACE.sm }]}>Showing your rides saved on this phone.</Text>}
      <SegmentedControl value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} />
      {error ? <><Text style={[TYPE.body, { color: COLORS.danger, marginVertical: SPACE.lg }]}>{error}</Text><Button label="Retry" onPress={reload} /></>
        : !loading && visible.length === 0 ? <EmptyState icon="history" title="No trips here yet" message="Your actual bookings will appear here." />
        : visible.map((ride) => <Card key={ride.id} style={styles.card}>
          <View style={styles.row}><Text style={[TYPE.caption, { flex: 1 }]}>{new Date(ride.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text>
            <Badge label={STATUS_LABELS[ride.status]} tone={ride.status === 'completed' ? 'success' : 'danger'} /></View>
          <Text style={[TYPE.overline, styles.space]}>PICKUP</Text><Text style={TYPE.body}>{ride.trip.pickup.name}</Text>
          <Text style={[TYPE.overline, styles.space]}>DROP-OFF</Text><Text style={TYPE.body}>{ride.trip.dropoff.name}</Text>
          <View style={[styles.row, styles.space]}>
            <Text style={[TYPE.subheading, { flex: 1 }]}>{ride.status === 'completed' ? formatFare(ride.fare) : 'No fare collected'}</Text>
            {user.role !== 'driver' && <Button label="Rebook" size="sm" full={false} variant="secondary" onPress={() => navigation.navigate('Booking', { destination: ride.trip.dropoff })} />}
          </View>
        </Card>)}
    </ScrollView>
    <BottomNav active="history" navigation={navigation} />
  </Screen>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xxl }, card: { marginTop: SPACE.lg }, row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }, space: { marginTop: SPACE.md } });
