import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Field from './ui/Field';
import { Chip } from './ui/Surfaces';
import { TODA_NAMES, findToda } from '../data/todaZones';
import { useI18n } from '../i18n';
import { SPACE, TYPE } from '../theme';

// A driver's TODA: one of Indang's TODAs, which limits ride requests to its
// barangays (data/todaZones.js), or any other TODA typed in.
export default function TodaPicker({ value, onChange }) {
  const { t } = useI18n();
  const matched = findToda(value);
  const [other, setOther] = useState(Boolean(value) && !matched);
  // A saved TODA outside the list (loaded after mount on the profile) is "Other".
  useEffect(() => { if (value && !findToda(value)) setOther(true); }, [value]);
  return (
    <View style={styles.field}>
      <Text style={[TYPE.label, styles.label]}>TODA</Text>
      <Text style={[TYPE.caption, styles.hint]}>{t('toda.hint')}</Text>
      <View style={styles.chips}>
        {TODA_NAMES.map((name) => (
          <Chip key={name} label={name} selected={!other && matched?.name === name} onPress={() => { setOther(false); onChange(name); }} />
        ))}
        <Chip label={t('toda.other')} selected={other} onPress={() => { setOther(true); onChange(''); }} />
      </View>
      {!other && matched && <Text style={[TYPE.caption, styles.hint]}>{t('toda.serves', { toda: matched.name, barangays: matched.barangays.join(', ') })}</Text>}
      {other && <Field label={t('toda.nameLabel')} placeholder={t('toda.namePlaceholder')} value={value} onChangeText={onChange} maxLength={80} style={styles.other} />}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: SPACE.lg },
  label: { marginBottom: SPACE.xs },
  hint: { marginBottom: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.sm },
  other: { marginTop: SPACE.sm, marginBottom: 0 },
});
