import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Divider } from './ui/Surfaces';
import { Bone, Skeleton } from './ui/Skeleton';
import { RADIUS, SPACE } from '../theme';

// The skeletons of the app's screens (components/ui/Skeleton.js), each shaped
// like the content it stands in for. Grey shapes only.

// Trips (HistoryScreen): cards with the date and status, the two stops, the fare.
export function TripCardsSkeleton({ count = 3 }) {
  return (
    <Skeleton>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} style={styles.card}>
          <View style={styles.spread}><Bone width="45%" height={12} /><Bone width={64} height={12} /></View>
          <StopsBones />
          <View style={[styles.spread, styles.footer]}><Bone width={72} height={22} /><Bone width={96} height={32} radius={RADIUS.pill} /></View>
        </Card>
      ))}
    </Skeleton>
  );
}

// Bookings (BookingsScreen): cards with the passenger, how far, the stops, the button.
export function BookingCardsSkeleton({ count = 2 }) {
  return (
    <Skeleton>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} style={styles.card}>
          <Bone width="40%" height={16} />
          <Bone width="30%" height={12} style={styles.gap} />
          <StopsBones />
          <View style={[styles.spread, styles.footer]}><Bone width={72} height={22} /><Bone width={110} height={40} radius={RADIUS.pill} /></View>
        </Card>
      ))}
    </Skeleton>
  );
}

// The two stops of a trip (TripStops): a dot and a line each.
function StopsBones() {
  return (
    <View style={styles.stops}>
      {['70%', '55%'].map((width) => (
        <View key={width} style={styles.stop}><Bone width={10} height={10} radius={5} /><Bone width={width} height={14} /></View>
      ))}
    </View>
  );
}

// Home's recent places: rows with an icon and the place's name and distance.
export function RecentPlacesSkeleton({ count = 3 }) {
  return (
    <Skeleton>
      {Array.from({ length: count }, (_, index) => (
        <View key={index}>
          {index > 0 && <Divider inset={52} />}
          <View style={styles.recentRow}>
            <Bone width={40} height={40} radius={RADIUS.md} />
            <View style={styles.recentText}><Bone width="65%" height={14} /><Bone width="25%" height={11} style={styles.gapSmall} /></View>
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

// The trip chat: a few bubbles on either side.
export function ChatBubblesSkeleton() {
  return (
    <Skeleton style={styles.bubbles}>
      <Bone width="55%" height={40} radius={RADIUS.lg} style={styles.theirs} />
      <Bone width="45%" height={40} radius={RADIUS.lg} style={styles.mine} />
      <Bone width="60%" height={40} radius={RADIUS.lg} style={styles.theirs} />
    </Skeleton>
  );
}

// One number, such as a total on the Drive or Profile screen: a bar in a box
// as tall as the number's line, so nothing moves when the number arrives.
export function ValueSkeleton({ width = 40, height = 18, lineHeight = 26 }) {
  return <Skeleton style={[styles.value, { height: lineHeight }]}><Bone width={width} height={height} /></Skeleton>;
}

const styles = StyleSheet.create({
  card: { marginTop: SPACE.md },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { marginTop: SPACE.md, minHeight: 40 },
  gap: { marginTop: SPACE.sm },
  gapSmall: { marginTop: SPACE.xs + 2 },
  stops: { marginTop: SPACE.md, gap: SPACE.md },
  stop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md },
  recentText: { flex: 1, marginLeft: SPACE.md },
  value: { justifyContent: 'center' },
  bubbles: { gap: SPACE.md },
  theirs: { alignSelf: 'flex-start' },
  mine: { alignSelf: 'flex-end' },
});
