import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Field from './ui/Field';
import { Chip } from './ui/Surfaces';
import { TODA_NAMES, findToda } from '../data/todaZones';
import { SPACE, TYPE } from '../theme';

// A driver's TODA: one of Indang's TODAs, which limits ride requests to its
// barangays (data/todaZones.js), or any other TODA typed in.
export default function TodaPicker({ value, onChange }) {
  const matched = findToda(value);
  const [other, setOther] = useState(Boolean(value) && !matched);
  // A saved TODA outside the list (loaded after mount on the profile) is "Other".
  useEffect(() => { if (value && !findToda(value)) setOther(true); }, [value]);
  return (
    <View style={styles.field}>
      <Text style={[TYPE.captionStrong, styles.label]}>TODA</Text>
      <Text style={[TYPE.caption, styles.hint]}>Driving in Indang? Choose your TODA. You will get ride requests only inside its barangays.</Text>
      <View style={styles.chips}>
        {TODA_NAMES.map((name) => (
          <Chip key={name} label={name} selected={!other && matched?.name === name} onPress={() => { setOther(false); onChange(name); }} />
        ))}
        <Chip label="Other TODA" selected={other} onPress={() => { setOther(true); onChange(''); }} />
      </View>
      {!other && matched && <Text style={[TYPE.caption, styles.hint]}>{matched.name} serves {matched.barangays.join(', ')}.</Text>}
      {other && <Field label="TODA name" placeholder="Your association, e.g. in General Trias" value={value} onChangeText={onChange} maxLength={80} style={styles.other} />}
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
