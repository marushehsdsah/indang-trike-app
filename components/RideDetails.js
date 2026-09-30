import React from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { Avatar, Divider } from './ui/Surfaces';
import IconButton from './ui/IconButton';
import { COLORS, SPACE, TYPE } from '../theme';
import { formatFare, userName } from '../utils/rideState';

export default function RideDetails({ ride, driver = false }) {
  const person = driver ? ride.passenger : ride.driver;
  const contact = (scheme) => Linking.openURL(`${scheme}:${person.phone}`).catch(() => Alert.alert('Unable to open', `No ${scheme === 'tel' ? 'phone' : 'SMS'} app is available.`));
  return <>
    {person && <View style={styles.row}>
      <Avatar name={userName(person)} size={44} />
      <View style={styles.person}><Text style={TYPE.subheading}>{userName(person)}</Text>
        <Text style={TYPE.caption}>{driver ? 'Your passenger' : `${person.plate || ''} · ${person.toda || ''}`}</Text></View>
      {person.phone && <><IconButton icon="message-text-outline" label="Send SMS" tone="tint" size={40} onPress={() => contact('sms')} />
        <IconButton icon="phone-outline" label="Call" tone="brand" size={40} onPress={() => contact('tel')} /></>}
    </View>}
    <View style={styles.stops}>
      <Text style={TYPE.overline}>PICKUP</Text><Text style={TYPE.body}>{ride.trip.pickup.name}</Text>
      <Text style={[TYPE.overline, { marginTop: SPACE.md }]}>DROP-OFF</Text><Text style={TYPE.body}>{ride.trip.dropoff.name}</Text>
      {ride.note ? <Text style={[TYPE.caption, { marginTop: SPACE.md }]}>Pickup note: {ride.note}</Text> : null}
    </View>
    <Divider />
    <View style={styles.row}>
      <View style={{ flex: 1 }}><Text style={TYPE.overline}>ESTIMATED TRIP</Text><Text style={TYPE.caption}>{ride.route?.durationLabel} · {ride.route?.distanceLabel}</Text></View>
      <View style={{ marginHorizontal: SPACE.md }}><Text style={TYPE.overline}>RIDERS</Text><Text style={TYPE.body}>{ride.passengers}</Text></View>
      <View><Text style={TYPE.overline}>CASH FARE</Text><Text style={[TYPE.subheading, { color: COLORS.brand }]}>{formatFare(ride.fare)}</Text></View>
    </View>
  </>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.md }, person: { flex: 1 }, stops: { paddingVertical: SPACE.md } });
