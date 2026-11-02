import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Screen from '../components/ui/Screen';
import AppHeader from '../components/ui/AppHeader';
import Button from '../components/ui/Button';
import { Card, Divider, Money } from '../components/ui/Surfaces';
import KeyboardAwareScrollView from '../components/ui/KeyboardAwareScrollView';
import RouteMap from '../components/RouteMap';
import TripStops from '../components/TripStops';
import Plate from '../components/Plate';
import { PersonRow } from '../components/RideDetails';
import RatingPrompt, { Stars } from '../components/RatingPrompt';
import ReportPrompt from '../components/ReportPrompt';
import useAccountHistory from '../hooks/useAccountHistory';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { fareSummary, placeName } from '../i18n/messages';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

const MAP_HEIGHT = 220;

// One past trip from the history, for passengers and drivers alike: the route
// on the map, when it was booked and ended, the stops, the fare and how it was
// worked out, and the other person on the trip. A passenger can rate the
// driver or book the same drop-off again; a driver can report the passenger.
// The trip is read from the history list, which reloads after a rating or
// report; a copy saved on the phone has no map, people or fare details.
export default function TripDetailsScreen({ navigation, route }) {
  const { user } = useApp();
  const { rides, reload, fromCache } = useAccountHistory();
  const { t, language } = useI18n();
  const [rating, setRating] = useState(false);
  const opened = route.params?.ride;
  // The saved copy is trimmed, so it never replaces the trip that was opened.
  const ride = (!fromCache && rides.find((item) => item.id === opened?.id)) || opened;
  const driver = user.role === 'driver';
  if (!ride) return null;

  const locale = language === 'fil' ? 'fil-PH' : 'en-PH';
  const when = (value) => (value ? new Date(value).toLocaleString(locale, { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);
  const completed = ride.status === 'completed';
  const pickup = ride.trip.pickup?.coordinate ? ride.trip.pickup : null;
  const dropoff = ride.trip.dropoff?.coordinate ? ride.trip.dropoff : null;
  // Drivers see only the trip, not who the passenger was.
  const other = driver ? null : ride.driver;
  const times = [
    [t('trip.booked'), when(ride.createdAt)],
    completed ? [t('trip.completedAt'), when(ride.completedAt)] : [t('trip.cancelledAt'), when(ride.cancelledAt)],
  ].filter(([, value]) => value);
  const facts = [ride.route?.durationLabel, ride.route?.distanceLabel, ride.passengers ? t('trip.riders', { count: ride.passengers }) : null].filter(Boolean);

  return <Screen>
    <AppHeader title={t('trip.detailsTitle')} subtitle={when(ride.createdAt)} onBack={() => navigation.goBack()} />
    <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {(pickup || dropoff) && <View style={styles.map} pointerEvents="none">
        <RouteMap pickup={pickup} destination={dropoff} route={ride.route} />
      </View>}

      <Card style={styles.card}>
        <Text style={[TYPE.subheading, { color: completed ? COLORS.success : COLORS.danger }]}>{t(`ride.status.${ride.status}`)}</Text>
        {ride.cancellationReason ? <Text style={[TYPE.caption, styles.reason]}>{ride.cancellationReason}</Text> : null}
        {times.map(([label, value]) => <View key={label} style={styles.timeRow}>
          <Text style={[TYPE.caption, styles.flex]}>{label}</Text>
          <Text style={TYPE.captionStrong}>{value}</Text>
        </View>)}
        <Divider style={styles.divider} />
        <TripStops pickup={placeName(t, ride.trip.pickup)} dropoff={placeName(t, ride.trip.dropoff)} lines={3} />
        {ride.note ? <Text style={[TYPE.body, styles.note]}>{ride.note}</Text> : null}
        {facts.length ? <Text style={[TYPE.caption, styles.facts]}>{facts.join(' · ')}</Text> : null}
        <Divider style={styles.divider} />
        <View style={styles.fareRow}>
          <Text style={[TYPE.bodyStrong, styles.flex]}>{t('trip.fare')}</Text>
          {completed ? <Money amount={ride.fare} size={24} color={COLORS.brand} /> : <Text style={TYPE.caption}>{t('history.noFare')}</Text>}
        </View>
        {completed && ride.fareDetails ? <Text style={[TYPE.caption, styles.fareSummary]}>{fareSummary(t, ride.fareDetails)}</Text> : null}
      </Card>

      {other && <Card style={styles.card}>
        <Text style={[TYPE.captionStrong, styles.label]}>{t('trip.yourDriver')}</Text>
        <PersonRow person={other} />
        {other.plate ? <Plate plate={other.plate} toda={other.toda} size="sm" style={styles.plate} /> : null}
      </Card>}

      {/* A passenger rates the driver once the trip ends; a driver reports the passenger instead. */}
      {!driver && ride.ratable && (ride.myRating
        ? <Card style={styles.card}>
          <Text style={[TYPE.captionStrong, styles.label]}>{t('trip.yourRating')}</Text>
          <Stars value={ride.myRating.stars} size={20} />
          {ride.myRating.comment ? <Text style={[TYPE.body, styles.note]}>{ride.myRating.comment}</Text> : null}
        </Card>
        : rating ? <RatingPrompt ride={ride} style={styles.card} onSkip={() => setRating(false)} onRated={() => { setRating(false); reload(); }} />
        : <Button label={t('rating.rate')} icon="star-outline" variant="outline" onPress={() => setRating(true)} style={styles.card} />)}
      {driver && ride.reportable && <ReportPrompt ride={ride} onDone={reload} style={styles.card} />}
      {!driver && dropoff && <Button label={t('history.rebook')} icon="replay" variant="tonal" style={styles.card}
        onPress={() => navigation.navigate('Passenger', { destination: ride.trip.dropoff })} />}
    </KeyboardAwareScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xxl },
  map: { height: MAP_HEIGHT, borderRadius: RADIUS.lg, overflow: 'hidden' },
  card: { marginTop: SPACE.md },
  reason: { marginTop: SPACE.xs },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.sm },
  divider: { marginVertical: SPACE.md },
  note: { marginTop: SPACE.sm },
  facts: { marginTop: SPACE.sm },
  fareRow: { flexDirection: 'row', alignItems: 'center' },
  fareSummary: { marginTop: SPACE.xs },
  label: { color: COLORS.inkSecondary, marginBottom: SPACE.sm },
  plate: { marginTop: SPACE.md, alignSelf: 'flex-start' },
});
