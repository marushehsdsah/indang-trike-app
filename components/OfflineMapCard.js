import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from './ui/Button';
import { Card } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { syncOfflineMap, useOfflineMap } from '../services/offlineMap';
import { formatBytes } from '../utils/offlineMapPlan';
import { COLORS, SPACE, TYPE } from '../theme';

const STATES = {
  ready: { icon: 'check-circle', color: COLORS.success },
  downloading: { icon: 'progress-download', color: COLORS.route },
  missing: { icon: 'cloud-download-outline', color: COLORS.warning },
  error: { icon: 'alert-circle', color: COLORS.danger },
  checking: { icon: 'progress-clock', color: COLORS.inkSecondary },
};

function describe(t, map, online) {
  switch (map.state) {
    case 'ready': return t('offlineMap.ready', { size: formatBytes(map.bytes) });
    case 'downloading': return online ? t('offlineMap.downloading', { percent: map.percentage }) : t('offlineMap.paused', { percent: map.percentage });
    case 'missing': return online ? t('offlineMap.missing') : t('offlineMap.missingOffline');
    case 'error': return t('offlineMap.error', { message: map.message });
    default: return t('offlineMap.checking');
  }
}

// Status of the offline map, with a retry when a download is missing or failed.
export default function OfflineMapCard({ style }) {
  const { online } = useApp(), map = useOfflineMap();
  const { t } = useI18n();
  const state = STATES[map.state] ?? STATES.checking;
  return <Card style={style}>
    <View style={styles.row}>
      <MaterialCommunityIcons name={state.icon} size={24} color={state.color} />
      <Text style={[TYPE.subheading, styles.title]}>{t('offlineMap.title')}</Text>
    </View>
    <Text style={[TYPE.body, styles.text]}>{describe(t, map, online)}</Text>
    {['missing', 'error'].includes(map.state) && <Button label={t(map.state === 'error' ? 'offlineMap.retry' : 'offlineMap.download')} variant="tonal" size="sm"
      full={false} disabled={!online} onPress={() => syncOfflineMap({ online: true, force: true })} style={styles.button} />}
  </Card>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { flex: 1 },
  text: { marginTop: SPACE.sm, color: COLORS.inkSecondary },
  button: { marginTop: SPACE.md },
});
