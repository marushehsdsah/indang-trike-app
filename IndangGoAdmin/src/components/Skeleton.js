// =============================================================
// components/Skeleton.js
// -------------------------------------------------------------
// Skeleton loading: grey shapes standing in for a screen's data
// while its first load runs, with a soft light sweeping across
// them. Grey shapes only, never made-up names or numbers.
// - SkeletonSwap: the skeleton while loading, then the content.
//   It stays unseen for the first 0.3 s, so a quick load never
//   flashes it, and content replacing a skeleton fades in.
// - Skeleton + Bone: build a skeleton; a Skeleton's Bones sweep
//   together, and screen readers hear one "Loading".
// - DashboardSkeleton, AccountListSkeleton, TripListSkeleton,
//   DriverReviewSkeleton: each screen's shape.
// With the phone's "Remove animations" on, nothing moves.
//
// HOW TO EDIT:
// - The grey is colors.skeleton (theme/colors.js); the timings
//   are the constants below.
// =============================================================

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '../theme/colors';

// One sweep, then a short pause before the next.
const SWEEP_MS = 1000;
const PAUSE_MS = 400;
// A load quicker than this never shows its skeleton.
export const SHOW_AFTER_MS = 300;
const APPEAR_MS = 150;
// How long the content that replaces a skeleton takes to fade in.
const FADE_MS = 200;
const GLOW = ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.8)', 'rgba(255, 255, 255, 0)'];

// Whether "Remove animations" is on.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription?.remove(); };
  }, []);
  return reduced;
}

// The sweep's progress (0 to 1) shared by a Skeleton's Bones, or null when
// nothing moves.
const Sweep = createContext(null);

export function Skeleton({ children, style }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    // Runs on the native side, so it costs the JavaScript nothing per frame.
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(PAUSE_MS),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, progress]);
  return (
    <View style={style} accessible accessibilityRole="progressbar" accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <Sweep.Provider value={reduced ? null : progress}>{children}</Sweep.Provider>
    </View>
  );
}

// One grey shape. width and height are numbers or percentages.
export function Bone({ width = '100%', height = 12, radius = 6, style }) {
  const progress = useContext(Sweep);
  const [size, setSize] = useState(0);
  const band = Math.min(Math.max(size * 0.6, 48), 200);
  const translateX = useMemo(() => progress?.interpolate({ inputRange: [0, 1], outputRange: [-band, size] }), [progress, band, size]);
  return (
    <View onLayout={(event) => setSize(event.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton, overflow: 'hidden' }, style]}>
      {translateX && size > 0 ? (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: band, transform: [{ translateX }] }}>
          <LinearGradient colors={GLOW} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

// Fades its children in once mounted, after `delay` ms; at once with "Remove
// animations" on (still after the delay).
export function FadeIn({ children, style, delay = 0, duration = FADE_MS }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: 1, delay, duration: reduced ? 0 : duration, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity, delay, duration, reduced]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

// `skeleton` while `loading` (a first load, with nothing to show yet), then
// `children`. style: for the wrappers, such as { flex: 1 } around a list.
export function SkeletonSwap({ loading, skeleton, children, style }) {
  // Whether the skeleton became visible during this load.
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setAppeared(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [loading]);
  // The keys keep React from reusing the skeleton's (already shown) wrapper
  // for the content, which would then never fade in.
  if (loading) return <FadeIn key="skeleton" style={style} delay={SHOW_AFTER_MS} duration={APPEAR_MS}>{skeleton}</FadeIn>;
  return appeared ? <FadeIn key="content" style={style}>{children}</FadeIn> : children;
}

// ---- Each screen's shape --------------------------------------

const rows = (count) => Array.from({ length: count }, (_, index) => index);

// Dashboard: the three stat cards and the Recent Trips card.
export function DashboardSkeleton() {
  return (
    <Skeleton>
      <View style={styles.statsRow}>
        {rows(3).map((index) => (
          <View key={index} style={styles.statCard}><Bone width={36} height={22} /><Bone width="70%" height={10} style={styles.gap} /></View>
        ))}
      </View>
      <View style={styles.bigCard}>
        <Bone width="40%" height={14} />
        {rows(3).map((index) => (
          <View key={index} style={styles.tableRow}>
            <Bone width="22%" height={12} />
            <View style={styles.flex}><Bone width="70%" height={12} /><Bone width="50%" height={10} style={styles.gapSmall} /></View>
            <Bone width={64} height={20} radius={10} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

// Accounts and Account Approval: cards with an avatar, a name and its details.
export function AccountListSkeleton({ count = 5 }) {
  return (
    <Skeleton style={styles.list}>
      {rows(count).map((index) => (
        <View key={index} style={styles.rowCard}>
          <Bone width={42} height={42} radius={21} />
          <View style={styles.rowText}>
            <Bone width="55%" height={14} />
            <Bone width="45%" height={10} style={styles.gap} />
            <Bone width="65%" height={10} style={styles.gapSmall} />
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

// Trips: cards with the trip ID and status, then its people, route and time.
export function TripListSkeleton({ count = 4 }) {
  return (
    <Skeleton style={styles.list}>
      {rows(count).map((index) => (
        <View key={index} style={styles.card}>
          <View style={styles.spread}><Bone width="35%" height={14} /><Bone width={72} height={20} radius={10} /></View>
          <View style={styles.divider} />
          {['55%', '50%', '80%', '40%'].map((width) => <Bone key={width} width={width} height={10} style={styles.gapSmall} />)}
        </View>
      ))}
    </Skeleton>
  );
}

// Driver Review: who (avatar, name, status) and the sign-up details.
export function DriverReviewSkeleton() {
  return (
    <Skeleton style={styles.review}>
      <View style={[styles.card, styles.identity]}>
        <Bone width={60} height={60} radius={30} />
        <Bone width="50%" height={18} style={styles.gap} />
        <Bone width={80} height={20} radius={10} style={styles.gap} />
      </View>
      <View style={[styles.card, styles.details]}>
        <Bone width="40%" height={14} />
        {rows(6).map((index) => (
          <View key={index} style={[styles.spread, styles.detailRow]}><Bone width="30%" height={10} /><Bone width="35%" height={10} /></View>
        ))}
      </View>
    </Skeleton>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { marginTop: 8 },
  gapSmall: { marginTop: 6 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
  },
  bigCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },
  list: { paddingTop: 12 },
  rowCard: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  rowText: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  review: { paddingHorizontal: 20, paddingTop: 10 },
  identity: { alignItems: 'center', paddingVertical: 22, borderRadius: 16 },
  details: { marginTop: 4, borderRadius: 16, padding: 16 },
  detailRow: { paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
});
