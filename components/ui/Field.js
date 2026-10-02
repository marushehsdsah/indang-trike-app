import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, HIT_SLOP, RADIUS, SPACE, TYPE } from '../../theme';
import { useI18n } from '../../i18n';

// Labelled text input. The outline carries the state (idle, focused, invalid),
// so a field never needs a second element to read as wrong.
export default function Field({
  label,
  icon,
  error,
  hint,
  prefix,
  secure = false,
  style,
  inputStyle,
  ...inputProps
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={[TYPE.label, styles.label]}>{label}</Text> : null}
      <View style={[styles.control, focused && styles.controlFocused, error && styles.controlError]}>
        {icon && <MaterialCommunityIcons name={icon} size={20} color={focused ? COLORS.brand : COLORS.inkMuted} style={styles.icon} />}
        {prefix ? (
          <>
            <Text style={[TYPE.body, styles.prefix]}>{prefix}</Text>
            <View style={styles.prefixDivider} />
          </>
        ) : null}
        <TextInput
          style={[TYPE.body, styles.input, inputStyle]}
          placeholderTextColor={COLORS.inkMuted}
          secureTextEntry={secure && !revealed}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {secure && (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('field.hidePassword') : t('field.showPassword')}
          >
            <MaterialCommunityIcons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.inkSecondary} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={[TYPE.caption, styles.error]}>{error}</Text> : hint ? <Text style={[TYPE.caption, styles.hint]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: SPACE.lg },
  label: { marginBottom: SPACE.sm },
  control: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.lineStrong,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, minHeight: 56,
  },
  controlFocused: { borderColor: COLORS.brand, borderWidth: 2 },
  controlError: { borderColor: COLORS.danger, borderWidth: 2 },
  icon: { marginRight: SPACE.sm + 2 },
  prefix: { color: COLORS.inkSecondary },
  prefixDivider: { width: 1, height: 22, backgroundColor: COLORS.lineStrong, marginHorizontal: SPACE.sm + 2 },
  input: { flex: 1, paddingVertical: SPACE.sm },
  error: { color: COLORS.danger, marginTop: SPACE.xs + 2 },
  hint: { marginTop: SPACE.xs + 2 },
});
