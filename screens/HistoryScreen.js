import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import { Card, EmptyState, Money, SegmentedControl } from '../components/ui/Surfaces';
import BottomNav from '../components/BottomNav';
import ConnectionBanner from '../components/ConnectionBanner';
import TripStops from '../components/TripStops';
import useAccountHistory from '../hooks/useAccountHistory';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { COLORS, SPACE, TYPE } from '../theme';

export default function HistoryScreen({ navigation }) {
  const { user } = useApp(), { rides, loading, error, fromCache, reload } = useAccountHistory();
  const { t, language } = useI18n();
  const [filter, setFilter] = useState('all');
  const driver = user.role === 'driver';
  const visible = rides.filter((ride) => filter === 'all' || ride.status === filter);
  const locale = language === 'fil' ? 'fil-PH' : 'en-PH';
  return <Screen>
    <AppHeader title={t(driver ? 'history.driverTitle' : 'history.title')} subtitle={fromCache ? t('history.fromCache') : null} />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} colors={[COLORS.brand]} />}>
      <ConnectionBanner />
      <SegmentedControl value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('history.all') }, { value: 'completed', label: t('history.completed') }, { value: 'cancelled', label: t('history.cancelled') },
      ]} />
      {error ? <View style={styles.error}>
        <Text style={[TYPE.body, styles.errorText]}>{error}</Text>
        <Button label={t('common.retry')} variant="brand" size="md" onPress={reload} />
      </View>
        : !loading && visible.length === 0 ? <EmptyState icon="history" title={t('history.emptyTitle')} message={t(driver ? 'history.emptyDriver' : 'history.emptyPassenger')} />
        : visible.map((ride) => {
          const completed = ride.status === 'completed';
          return <Card key={ride.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={[TYPE.caption, styles.flex]}>{new Date(ride.createdAt).toLocaleString(locale, { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
              <Text style={[TYPE.captionStrong, { color: completed ? COLORS.success : COLORS.danger }]}>{t(`ride.status.${ride.status}`)}</Text>
            </View>
            <TripStops pickup={ride.trip.pickup.name} dropoff={ride.trip.dropoff.name} style={styles.stops} />
            <View style={[styles.row, styles.footer]}>
              <View style={styles.flex}>
                {completed ? <Money amount={ride.fare} size={22} /> : <Text style={TYPE.caption}>{t('history.noFare')}</Text>}
              </View>
              {!driver && ride.trip.dropoff.coordinate && <Button label={t('history.rebook')} icon="replay" size="sm" full={false} variant="tonal"
                onPress={() => navigation.navigate('Passenger', { destination: ride.trip.dropoff })} />}
            </View>
          </Card>;
        })}
    </ScrollView>
    <BottomNav active="history" navigation={navigation} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xxl },
  flex: { flex: 1 },
  card: { marginTop: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  stops: { marginTop: SPACE.md },
  footer: { marginTop: SPACE.md, minHeight: 40 },
  error: { marginTop: SPACE.xl, gap: SPACE.md },
  errorText: { color: COLORS.danger },
});
