import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';

// The choice runs once the sheet has faded out, so a screen it opens (the
// camera, the gallery) does not open under a closing sheet.
const CLOSE_MS = 300;

// A sheet of choices from the bottom of the screen, for when an Android alert's
// three buttons are not enough. Each option is { label, icon, onPress, danger }.
export default function OptionSheet({ visible, title, options, onClose }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.md }]}>
        {title ? <Text style={[TYPE.subheading, styles.title]}>{title}</Text> : null}
        {options.map((option) => (
          <Pressable key={option.label} accessibilityRole="button" onPress={() => { onClose(); setTimeout(option.onPress, CLOSE_MS); }}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={option.icon} size={24} color={option.danger ? COLORS.danger : COLORS.ink} />
            <Text style={[TYPE.bodyStrong, option.danger && styles.danger]}>{option.label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={24} color={COLORS.inkSecondary} />
          <Text style={[TYPE.bodyStrong, styles.cancel]}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card, paddingTop: SPACE.lg, paddingHorizontal: SPACE.lg,
  },
  title: { marginBottom: SPACE.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56 },
  pressed: { opacity: 0.6 },
  danger: { color: COLORS.danger },
  cancel: { color: COLORS.inkSecondary },
});
