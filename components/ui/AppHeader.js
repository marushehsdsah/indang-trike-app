import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, HIT_SLOP, SPACE, TYPE } from '../../theme';
import { tapFeedback } from '../../utils/feedback';

// One header for every screen: optional back arrow, a title, and one action.
// Sits inside Screen's safe area, so it never collides with the status bar.
export default function AppHeader({ title, subtitle, onBack, action, style }) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.side}>
        {onBack && (
          <Pressable
            onPress={() => {
              tapFeedback();
              onBack();
            }}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Feather name="arrow-left" size={22} color={COLORS.ink} />
          </Pressable>
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={TYPE.subheading} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[TYPE.caption, styles.subtitle]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      <View style={[styles.side, styles.sideEnd]}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md, minHeight: 56,
  },
  // Equal side columns keep the title optically centred whatever they hold.
  side: { width: 44, justifyContent: 'center' },
  sideEnd: { alignItems: 'flex-end' },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  pressed: { opacity: 0.6 },
  titleBlock: { flex: 1, alignItems: 'center' },
  subtitle: { marginTop: 2 },
});
