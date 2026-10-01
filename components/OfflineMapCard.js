import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from './ui/Button';
import { Badge, Card } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { SERVICE_AREA_NAME } from '../data/indangMap';
import { syncOfflineMap, useOfflineMap } from '../services/offlineMap';
import { formatBytes } from '../utils/offlineMapPlan';
import { SPACE, TYPE } from '../theme';

const BADGES = {
  ready: { label: 'Ready', tone: 'success' }, downloading: { label: 'Downloading', tone: 'route' },
  checking: { label: 'Checking', tone: 'neutral' }, idle: { label: 'Checking', tone: 'neutral' },
  missing: { label: 'Not saved', tone: 'warning' }, error: { label: 'Failed', tone: 'danger' },
};

function describe(map, online) {
  switch (map.state) {
    case 'ready': return `${SERVICE_AREA_NAME} maps work without internet (${formatBytes(map.bytes)} saved).`;
    case 'downloading': return online ? `Downloading the ${SERVICE_AREA_NAME} map… ${map.percentage}%` : `Paused at ${map.percentage}%. It continues when you are back online.`;
    case 'missing': return online ? 'Not saved yet.' : 'Not saved yet. It downloads automatically when you are online.';
    case 'error': return `The download failed: ${map.message}`;
    default: return 'Checking the map saved on this phone…';
  }
}

// Status of the offline map, with a retry when a download is missing or failed.
export default function OfflineMapCard({ style }) {
  const { online } = useApp(), map = useOfflineMap();
  const badge = BADGES[map.state] ?? BADGES.idle;
  return <Card style={style}>
    <View style={styles.row}><Text style={[TYPE.subheading, { flex: 1 }]}>Offline map</Text><Badge label={badge.label} tone={badge.tone} /></View>
    <Text style={[TYPE.caption, styles.text]}>{describe(map, online)}</Text>
    {['missing', 'error'].includes(map.state) && <Button label={map.state === 'error' ? 'Retry download' : 'Download now'} variant="secondary" size="sm"
      disabled={!online} onPress={() => syncOfflineMap({ online: true, force: true })} style={styles.text} />}
  </Card>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md }, text: { marginTop: SPACE.sm } });
