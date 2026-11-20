import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useReducedMotion from '../../hooks/useReducedMotion';
import { useI18n } from '../../i18n';
import { COLORS } from '../../theme';

// Skeleton loading: grey shapes standing in for content that is still on its
// way, with a soft light sweeping across them. Grey shapes only, never made-up
// names or numbers. With the phone's "Remove animations" on, nothing moves.

// One sweep, then a short pause before the next.
const SWEEP_MS = 1000;
const PAUSE_MS = 400;
// A load quicker than this never shows its skeleton, so it cannot flash.
export const SHOW_AFTER_MS = 300;
const APPEAR_MS = 150;
// How long the content that replaces a skeleton takes to fade in.
const FADE_MS = 200;
const GLOW = ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.75)', 'rgba(255, 255, 255, 0)'];

// The sweep's progress (0 to 1) shared by a Skeleton's Bones, or null when
// nothing moves.
const Sweep = createContext(null);

// A group of Bones that sweep together. Screen readers hear one "Loading" for
// the whole group instead of its shapes.
export function Skeleton({ children, style }) {
  const { t } = useI18n();
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
    <View style={style} accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} accessibilityState={{ busy: true }}>
      <Sweep.Provider value={reduced ? null : progress}>{children}</Sweep.Provider>
    </View>
  );
}

// One grey shape. width and height are numbers or percentages.
export function Bone({ width = '100%', height = 14, radius = 6, style }) {
  const progress = useContext(Sweep);
  const [size, setSize] = useState(0);
  // The light band is a little over half the shape's width, within limits.
  const band = Math.min(Math.max(size * 0.6, 48), 200);
  const translateX = useMemo(() => progress?.interpolate({ inputRange: [0, 1], outputRange: [-band, size] }), [progress, band, size]);
  return (
    <View onLayout={(event) => setSize(event.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: COLORS.line, overflow: 'hidden' }, style]}>
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

// Shows `skeleton` while `loading` (a first load, with nothing to show yet),
// then `children`. The skeleton holds its place unseen for SHOW_AFTER_MS, so a
// quick load never flashes it; content that replaces a skeleton that was seen
// fades in. style: for the wrappers, such as { flex: 1 } around a list.
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
