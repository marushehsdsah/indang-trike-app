import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, HIT_SLOP, RADIUS, SPACE, TYPE } from '../../theme';

// Labelled text input. The border carries the state — idle, focused, invalid —
// so a field never needs a second explanatory element to read as wrong.
export default function Field({
  label,
  icon,
  error,
  prefix,
  secure = false,
  style,
  inputStyle,
  ...inputProps
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={[TYPE.captionStrong, styles.label]}>{label}</Text> : null}
      <View style={[styles.control, focused && styles.controlFocused, error && styles.controlError]}>
        {icon && <Feather name={icon} size={18} color={focused ? COLORS.brand : COLORS.inkMuted} style={styles.icon} />}
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
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Feather name={revealed ? 'eye-off' : 'eye'} size={18} color={COLORS.inkMuted} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={[TYPE.caption, styles.error]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: SPACE.lg },
  label: { marginBottom: SPACE.sm },
  control: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1.5, borderColor: 'transparent',
    borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, height: 54,
  },
  controlFocused: { borderColor: COLORS.brand, backgroundColor: COLORS.surface },
  controlError: { borderColor: COLORS.danger, backgroundColor: COLORS.surface },
  icon: { marginRight: SPACE.sm + 2 },
  prefix: { color: COLORS.inkSecondary },
  prefixDivider: { width: 1, height: 20, backgroundColor: COLORS.lineStrong, marginHorizontal: SPACE.sm + 2 },
  input: { flex: 1, paddingVertical: 0 },
  error: { color: COLORS.danger, marginTop: SPACE.xs + 2 },
});
