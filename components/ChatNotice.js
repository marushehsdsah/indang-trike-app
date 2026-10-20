import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { messageText } from './ChatSheet';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { messageFeedback } from '../utils/feedback';
import { userName } from '../utils/rideState';
import { COLORS, ELEVATION, RADIUS, SPACE, TYPE } from '../theme';

const NOTICE_MS = 8000;

// A chat message that came in while the chat was closed, for a few seconds or
// until tapped (onOpen opens the chat). Only the screen in view shows it, so
// the phone buzzes once.
export default function ChatNotice({ onOpen, style }) {
  const { user, ride, chatNotice, dismissChatNotice } = useApp();
  const { t } = useI18n();
  const focused = useIsFocused();
  const notice = focused && chatNotice && ride?.id === chatNotice.rideId ? chatNotice : null;
  const key = notice?.message.id ?? null;
  useEffect(() => {
    if (!key) return undefined;
    messageFeedback();
    const timer = setTimeout(dismissChatNotice, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [key, dismissChatNotice]);
  if (!notice) return null;

  const person = user.role === 'driver' ? ride.passenger : ride.driver;
  const name = person ? person.firstName || userName(person) : t(user.role === 'driver' ? 'chat.yourPassenger' : 'chat.yourDriver');
  const body = messageText(t, notice.message);
  return (
    <Pressable onPress={() => { dismissChatNotice(); onOpen(); }} accessibilityRole="button" accessibilityLiveRegion="polite"
      accessibilityLabel={t('chat.noticeA11y', { name, message: body })}
      style={({ pressed }) => [styles.notice, pressed && styles.pressed, style]}>
      <MaterialCommunityIcons name="chat" size={22} color={COLORS.onBrand} />
      <View style={styles.text}>
        <Text style={[TYPE.captionStrong, styles.from]} numberOfLines={1}>{t('chat.newFrom', { name })}</Text>
        <Text style={[TYPE.bodyStrong, styles.body]} numberOfLines={2}>{body}</Text>
      </View>
      <Text style={[TYPE.button, styles.reply]}>{t('chat.reply')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.brand, ...ELEVATION.floating,
  },
  pressed: { opacity: 0.9 },
  text: { flex: 1 },
  from: { color: COLORS.brandTint },
  body: { color: COLORS.onBrand },
  reply: { color: COLORS.accent },
});
