import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './ui/Button';
import Field from './ui/Field';
import { Chip } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { selectionFeedback, successFeedback, warningFeedback } from '../utils/feedback';
import { MAX_REPORT_DETAILS, REPORT_REASONS } from '../utils/reports';

// After a trip the driver was assigned to ends, completed or cancelled, the
// driver can report the passenger (a fake booking, a no-show…) instead of
// rating them. Admins review it in God view. Starts as one button; once sent it
// says the report is with the admins. onDone runs after a report is sent.
export default function ReportPrompt({ ride, onDone, style }) {
  const { reportRide } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(null), [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  if (!ride?.reportable) return null;

  if (ride.myReport) {
    return (
      <View style={[styles.card, styles.done, style]}>
        <MaterialCommunityIcons name="shield-check-outline" size={20} color={COLORS.brand} />
        <View style={styles.flex}>
          <Text style={TYPE.captionStrong}>{t('report.sent', { reason: t(`report.reason.${ride.myReport.reason}`) })}</Text>
          <Text style={TYPE.caption}>{t(`report.status.${ride.myReport.status}`)}</Text>
        </View>
      </View>
    );
  }
  if (!open) {
    return <Button label={t('report.open')} icon="flag-outline" variant="outline" size="md" onPress={() => setOpen(true)} style={style} />;
  }

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setError(null);
    try { await reportRide(ride.id, { reason, details }); successFeedback(); onDone?.(); }
    catch (failure) { warningFeedback(); setError(failure.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="flag-outline" size={22} color={COLORS.danger} />
        <Text style={[TYPE.subheading, styles.flex]}>{t('report.title')}</Text>
      </View>
      <Text style={[TYPE.caption, styles.intro]}>{t('report.intro')}</Text>
      <View style={styles.reasons}>
        {REPORT_REASONS.map((value) => <Chip key={value} label={t(`report.reason.${value}`)} selected={reason === value}
          onPress={() => { selectionFeedback(); setReason(value); setError(null); }} />)}
      </View>
      <Field label={t(reason === 'other' ? 'report.detailsRequired' : 'report.details')} placeholder={t('report.detailsHint')}
        value={details} onChangeText={setDetails} maxLength={MAX_REPORT_DETAILS} multiline style={styles.section} />
      {error && <Text style={[TYPE.caption, styles.error]}>{error}</Text>}
      <Button label={t('report.submit')} variant="danger" disabled={!reason || (reason === 'other' && !details.trim())} loading={busy} onPress={submit} />
      <Button label={t('report.cancel')} variant="text" size="md" onPress={() => setOpen(false)} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.canvas, borderRadius: RADIUS.lg, padding: SPACE.lg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  intro: { marginTop: SPACE.xs },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md },
  section: { marginTop: SPACE.lg },
  error: { color: COLORS.danger, marginBottom: SPACE.sm },
  done: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
});
