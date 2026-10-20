import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, BackHandler, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IconButton from './ui/IconButton';
import { Avatar, Chip } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { MAX_MESSAGE_LENGTH, QUICK_REPLIES, canChat } from '../utils/chat';
import { formatMessageTime, messageState } from '../utils/chatThread';
import { settleSheet } from '../utils/sheetGesture';
import { userName } from '../utils/rideState';
import { COLORS, ELEVATION, HIT_SLOP, RADIUS, SPACE, TYPE } from '../theme';

// What a message says in this phone's language: a quick reply is stored as its key.
export const messageText = (t, message) => (message.preset ? t(`chat.quick.${message.preset}`) : message.text);

function Bubble({ message, mine, showState, onRetry }) {
  const { t } = useI18n();
  const state = messageState(message), failed = state === 'failed';
  const meta = failed ? [message.error, t('chat.failed')].filter(Boolean).join(' ')
    : [formatMessageTime(message.sentAt), showState ? t(`chat.state.${state}`) : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable onPress={failed ? onRetry : undefined} disabled={!failed} accessibilityRole={failed ? 'button' : undefined}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, failed && styles.bubbleFailed]}>
        <Text style={[TYPE.body, mine && !failed && styles.textMine]}>{messageText(t, message)}</Text>
      </Pressable>
      <Text style={[TYPE.caption, styles.meta, failed && styles.metaFailed]}>{meta}</Text>
    </View>
  );
}

// The trip chat. It opens over the lower part of the trip screen, so the map
// stays in view above it; dragging its top edge up (or tapping it) fills the
// screen and adds a call button, and dragging down steps back to half, then
// closes. One-tap quick replies sit right above the typing box.
export default function ChatSheet({ ride, person, asDriver, onClose }) {
  const { user, chat, viewChat, sendChat, retryChat, connected, online } = useApp();
  const { t } = useI18n();
  const insets = useSafeAreaInsets(), { height } = useWindowDimensions(), keyboardHeight = useKeyboardHeight();
  const [text, setText] = useState(''), [error, setError] = useState(null), [mode, setMode] = useState('half');
  const listRef = useRef(null);
  useEffect(() => {
    viewChat(ride.id).catch((failure) => setError(failure.message));
    return () => { viewChat(null); };
  }, [ride.id, viewChat]);
  // Back closes the chat, not the trip screen.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]);

  // Full: the whole window above the keyboard. Half: 70% of the screen, or,
  // above the keyboard, all but a strip of map under the status bar.
  const fullHeight = height - keyboardHeight;
  const halfHeight = keyboardHeight ? fullHeight - insets.top - SPACE.xxxl * 2 : Math.round(height * 0.7);
  const full = mode === 'full';
  const sheetHeight = useRef(new Animated.Value(full ? fullHeight : halfHeight)).current;
  // The gesture handlers are made once, so they read the current sizes here.
  const live = useRef({});
  live.current = { mode, onClose, heights: { full: fullHeight, half: halfHeight } };
  const settle = (next) => {
    if (next === 'closed') {
      Animated.timing(sheetHeight, { toValue: 0, duration: 160, useNativeDriver: false }).start(() => live.current.onClose());
      return;
    }
    Animated.spring(sheetHeight, { toValue: live.current.heights[next], useNativeDriver: false, bounciness: 0, speed: 18 }).start();
    if (next !== live.current.mode) setMode(next);
  };
  // A new size (the keyboard opening or closing) is eased into, not jumped to.
  useEffect(() => { settle(mode); }, [fullHeight, halfHeight]);
  const drag = useRef({ start: 0 });
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (event, { dx, dy }) => Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx),
    onPanResponderGrant: () => sheetHeight.stopAnimation((value) => { drag.current.start = value; }),
    onPanResponderMove: (event, { dy }) => sheetHeight.setValue(Math.min(live.current.heights.full, Math.max(0, drag.current.start - dy))),
    onPanResponderRelease: (event, { dy, vy }) => settle(settleSheet(live.current.mode, dy, vy)),
    onPanResponderTerminate: (event, { dy, vy }) => settle(settleSheet(live.current.mode, dy, vy)),
  }), []);
  // Near the top the sheet loses its rounded corners and makes room for the
  // status bar, so full screen reads as a page of its own.
  const topSpace = sheetHeight.interpolate({ inputRange: [fullHeight - insets.top - 1, fullHeight], outputRange: [0, insets.top], extrapolate: 'clamp' });
  const corner = sheetHeight.interpolate({ inputRange: [fullHeight - SPACE.xxxl, fullHeight], outputRange: [RADIUS.card, 0], extrapolate: 'clamp' });

  const open = canChat(ride.status), name = userName(person);
  const messages = chat.rideId === ride.id ? chat.messages : [];
  const lastMine = [...messages].reverse().find((message) => message.senderId === user.id);
  const send = (content) => { setError(null); sendChat(ride.id, content); };
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setText(''); send({ text: value });
  };
  const contact = (scheme) => Linking.openURL(`${scheme}:${person.phone}`)
    .catch(() => Alert.alert(t('contact.unableTitle'), scheme === 'tel' ? t('contact.noPhoneApp') : t('contact.noSmsApp')));

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      {/* The tint covers the whole screen, behind the sheet too, so the map
          seen past its rounded corners is tinted like the rest. */}
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('chat.close')} />
      <Animated.View style={[styles.sheet, { height: sheetHeight, borderTopLeftRadius: corner, borderTopRightRadius: corner,
        paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SPACE.md }]}>
        <View {...pan.panHandlers}>
          <Animated.View style={{ height: topSpace }} />
          <Pressable onPress={() => settle(full ? 'half' : 'full')} hitSlop={{ top: SPACE.sm, bottom: SPACE.sm }} style={styles.handleArea}
            accessibilityRole="button" accessibilityLabel={t(full ? 'chat.collapse' : 'chat.expand')}>
            <View style={styles.handle} />
          </Pressable>
          <View style={styles.header}>
            <Avatar name={name} size={40} />
            <View style={styles.headerText}>
              <Text style={TYPE.subheading} numberOfLines={1}>{name}</Text>
              <Text style={TYPE.caption} numberOfLines={1}>{asDriver ? t('chat.yourPassenger') : [t('chat.yourDriver'), person.plate].filter(Boolean).join(' · ')}</Text>
            </View>
            {full && person.phone && <IconButton icon="phone" tone="tint" raised={false} label={t('contact.call', { name })} onPress={() => contact('tel')} />}
            <IconButton icon="close" tone="quiet" raised={false} label={t('chat.close')} onPress={onClose} />
          </View>
        </View>

        {/* The newest message stays in view as messages arrive and as the
            keyboard or a drag resizes the list. */}
        <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}>
          <Text style={[TYPE.caption, styles.centered]}>{t('chat.privacy', { name: person.firstName || name })}</Text>
          {!messages.length && <Text style={[TYPE.bodyMuted, styles.centered]}>{t(open ? 'chat.empty' : 'chat.emptyClosed')}</Text>}
          {messages.map((message) => {
            const mine = message.senderId === user.id, state = messageState(message);
            return <Bubble key={`${message.senderId}:${message.clientId}`} message={message} mine={mine}
              showState={mine && (message === lastMine || (state !== 'sent' && state !== 'seen'))}
              onRetry={() => retryChat(ride.id, message.clientId)} />;
          })}
        </ScrollView>

        {error && <Text style={[TYPE.caption, styles.error]}>{error}</Text>}
        {open ? <>
          {(!online || !connected) && <View style={styles.offline}>
            <MaterialCommunityIcons name="wifi-off" size={18} color={COLORS.warning} />
            <View style={styles.offlineText}>
              <Text style={[TYPE.caption, styles.warning]}>{t('chat.offline')}</Text>
              {person.phone && <Pressable onPress={() => contact('sms')} hitSlop={HIT_SLOP} accessibilityRole="button">
                <Text style={[TYPE.captionStrong, styles.link]}>{t('chat.textInstead')}</Text>
              </Pressable>}
            </View>
          </View>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={styles.replies} contentContainerStyle={styles.repliesContent} accessibilityLabel={t('chat.quickReplies')}>
            {QUICK_REPLIES[asDriver ? 'driver' : 'passenger'].map((preset) => (
              <Chip key={preset} tone="map" label={t(`chat.quick.${preset}`)} onPress={() => send({ preset })} />
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput style={[TYPE.body, styles.input]} value={text} onChangeText={setText} placeholder={t('chat.placeholder')}
              placeholderTextColor={COLORS.inkMuted} maxLength={MAX_MESSAGE_LENGTH} multiline accessibilityLabel={t('chat.placeholder')} />
            <IconButton icon="send" tone="brand" raised={false} label={t('chat.send')} disabled={!text.trim()} onPress={submit} />
          </View>
        </> : <View style={styles.closed}>
          <MaterialCommunityIcons name="lock-outline" size={18} color={COLORS.inkSecondary} />
          <Text style={[TYPE.caption, styles.closedText]}>{t('chat.closed')}</Text>
        </View>}
      </Animated.View>
      {keyboardHeight > 0 && <View style={[styles.keyboard, { height: keyboardHeight }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(16, 24, 20, 0.3)' },
  sheet: { backgroundColor: COLORS.surface, overflow: 'hidden', ...ELEVATION.floating },
  handleArea: { alignItems: 'center', paddingTop: SPACE.sm, paddingBottom: SPACE.md },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.lineStrong },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.line,
  },
  headerText: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: SPACE.lg, gap: SPACE.md },
  centered: { textAlign: 'center' },
  row: { maxWidth: '82%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: SPACE.md + 2, paddingVertical: SPACE.sm + 2, borderRadius: RADIUS.lg },
  bubbleMine: { backgroundColor: COLORS.brand, borderBottomRightRadius: SPACE.xs },
  bubbleTheirs: { backgroundColor: COLORS.surfaceAlt, borderBottomLeftRadius: SPACE.xs },
  bubbleFailed: { backgroundColor: COLORS.dangerTint },
  textMine: { color: COLORS.onBrand },
  meta: { marginTop: 2 },
  metaFailed: { color: COLORS.danger },
  error: { color: COLORS.danger, paddingHorizontal: SPACE.lg, marginBottom: SPACE.xs },
  offline: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, marginHorizontal: SPACE.lg, marginBottom: SPACE.sm,
    padding: SPACE.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.warningTint,
  },
  offlineText: { flex: 1, gap: SPACE.xs },
  warning: { color: COLORS.warning },
  link: { color: COLORS.brand, textDecorationLine: 'underline' },
  replies: { flexGrow: 0 },
  repliesContent: { gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.xs },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm },
  input: {
    flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm + 2,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.lineStrong, backgroundColor: COLORS.surface,
  },
  closed: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginHorizontal: SPACE.lg, padding: SPACE.md,
    borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceAlt,
  },
  closedText: { flex: 1 },
  keyboard: { backgroundColor: COLORS.surface },
});
