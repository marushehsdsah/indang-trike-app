import React from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Money } from './ui/Surfaces';
import IconButton from './ui/IconButton';
import TripStops from './TripStops';
import { COLORS, SPACE, TYPE } from '../theme';
import { userName } from '../utils/rideState';
import { useI18n } from '../i18n';
import { fareSummary, placeName } from '../i18n/messages';

// The other person on the trip, with message and call buttons when the server
// shared their number.
export function PersonRow({ person, subtitle, style }) {
  const { t } = useI18n();
  if (!person) return null;
  const contact = (scheme) => Linking.openURL(`${scheme}:${person.phone}`)
    .catch(() => Alert.alert(t('contact.unableTitle'), scheme === 'tel' ? t('contact.noPhoneApp') : t('contact.noSmsApp')));
  return (
    <View style={[styles.person, style]}>
      <Avatar name={userName(person)} size={44} />
      <View style={styles.personText}>
        <Text style={TYPE.subheading} numberOfLines={1}>{userName(person)}</Text>
        {subtitle ? <Text style={TYPE.caption} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {person.phone && <>
        <IconButton icon="message-text-outline" label={t('contact.sms', { name: userName(person) })} tone="tint" raised={false} onPress={() => contact('sms')} />
        <IconButton icon="phone" label={t('contact.call', { name: userName(person) })} tone="brand" raised={false} onPress={() => contact('tel')} />
      </>}
    </View>
  );
}

// Everything about the booked trip: stops, the rider's note, riders, fare.
export function TripFacts({ ride, style }) {
  const { t } = useI18n();
  return (
    <View style={style}>
      <TripStops pickup={placeName(t, ride.trip.pickup)} dropoff={placeName(t, ride.trip.dropoff)} lines={2} />
      {ride.note ? (
        <View style={styles.note}>
          <MaterialCommunityIcons name="message-reply-text-outline" size={18} color={COLORS.inkSecondary} />
          <Text style={[TYPE.body, styles.noteText]}>{ride.note}</Text>
        </View>
      ) : null}
      <View style={styles.facts}>
        <Text style={[TYPE.caption, styles.factText]}>
          {[ride.route?.durationLabel, ride.route?.distanceLabel].filter(Boolean).join(' · ')}
          {'  ·  '}{t('trip.riders', { count: ride.passengers })}
        </Text>
        <View style={styles.fare}>
          <Money amount={ride.fare} size={22} color={COLORS.brand} />
          <Text style={TYPE.caption}>{t('trip.cash')}</Text>
        </View>
      </View>
      {ride.fareDetails ? <Text style={[TYPE.caption, styles.fareSummary]}>{fareSummary(t, ride.fareDetails)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  personText: { flex: 1, marginLeft: SPACE.xs },
  note: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACE.md, gap: SPACE.sm },
  noteText: { flex: 1 },
  facts: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  factText: { flex: 1 },
  fare: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  fareSummary: { marginTop: SPACE.xs },
});
