import React from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Money } from './ui/Surfaces';
import IconButton from './ui/IconButton';
import TripStops from './TripStops';
import { RatingBadge } from './RatingPrompt';
import { COLORS, SPACE, TYPE } from '../theme';
import { userName } from '../utils/rideState';
import { useI18n } from '../i18n';
import { fareSummary, placeName } from '../i18n/messages';

// The trip chat button, marked with the unread count.
export function ChatButton({ name, unread = 0, onPress, raised = false }) {
  const { t } = useI18n();
  return (
    <View>
      <IconButton icon="chat-outline" tone="brand" raised={raised} onPress={onPress}
        label={unread ? t('chat.openUnread', { name, count: unread }) : t('chat.open', { name })} />
      {unread > 0 && <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
      </View>}
    </View>
  );
}

// The other person on the trip, with message and call buttons when the server
// shared their number. With onChat the message button opens the trip chat,
// marked with the unread count; the chat offers a text message when offline.
export function PersonRow({ person, subtitle, style, onChat, unread = 0 }) {
  const { t } = useI18n();
  if (!person) return null;
  const contact = (scheme) => Linking.openURL(`${scheme}:${person.phone}`)
    .catch(() => Alert.alert(t('contact.unableTitle'), scheme === 'tel' ? t('contact.noPhoneApp') : t('contact.noSmsApp')));
  const name = userName(person);
  return (
    <View style={[styles.person, style]}>
      <Avatar name={userName(person)} size={44} />
      <View style={styles.personText}>
        <View style={styles.nameRow}>
          <Text style={[TYPE.subheading, styles.name]} numberOfLines={1}>{userName(person)}</Text>
          {/* Their average, so each side knows who they are about to ride with. */}
          {person.rating && <RatingBadge rating={person.rating} />}
        </View>
        {subtitle ? <Text style={TYPE.caption} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {onChat && <ChatButton name={name} unread={unread} onPress={onChat} />}
      {person.phone && <>
        {!onChat && <IconButton icon="message-text-outline" label={t('contact.sms', { name })} tone="tint" raised={false} onPress={() => contact('sms')} />}
        <IconButton icon="phone" label={t('contact.call', { name })} tone={onChat ? 'tint' : 'brand'} raised={false} onPress={() => contact('tel')} />
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  name: { flexShrink: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  personText: { flex: 1, marginLeft: SPACE.xs },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.danger, borderWidth: 2, borderColor: COLORS.surface,
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '700' },
  note: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACE.md, gap: SPACE.sm },
  noteText: { flex: 1 },
  facts: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  factText: { flex: 1 },
  fare: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  fareSummary: { marginTop: SPACE.xs },
});
