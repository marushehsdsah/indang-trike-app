import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';

const GPS_RETRY_STATUSES = ['denied', 'approximate', 'disabled', 'unavailable', 'inaccurate', 'stale'];
const GPS_ALERT_STATUSES = ['denied', 'approximate', 'disabled', 'unavailable'];

// What the status pill on a map says, most urgent first: no internet, no link
// to the IndangGO server, then (when the screen needs it) GPS and the service
// area. Returns StatusPill props.
export function useConnectionStatus() {
  const { online, connected, error, syncing, refresh } = useApp();
  const { t } = useI18n();
  if (!online) return { tone: 'offline', icon: 'wifi-off', label: t('status.offline') };
  if (error) return { tone: 'alert', icon: 'cloud-alert-outline', label: error, onPress: refresh, actionLabel: t('common.retry') };
  if (!connected) {
    return syncing
      ? { tone: 'wait', icon: 'cloud-sync-outline', label: t('status.connecting') }
      : { tone: 'alert', icon: 'cloud-alert-outline', label: t('status.notConnected'), onPress: refresh, actionLabel: t('common.retry') };
  }
  return null;
}

export function useGpsStatus({ town } = {}) {
  const { gps } = useApp();
  const { t } = useI18n();
  if (gps.status !== 'ready') {
    const retryable = GPS_RETRY_STATUSES.includes(gps.status);
    return {
      tone: GPS_ALERT_STATUSES.includes(gps.status) ? 'alert' : 'wait',
      icon: 'crosshairs-question',
      label: t(`gps.${gps.status}`),
      onPress: retryable ? gps.retry : undefined,
      actionLabel: retryable ? t('common.retry') : undefined,
    };
  }
  if (gps.inServiceArea === false) return { tone: 'alert', icon: 'map-marker-alert-outline', label: t('status.outside') };
  return { tone: 'live', icon: 'crosshairs-gps', label: town ? t('status.liveIn', { town }) : t('status.live') };
}

export default function useMapStatus(options) {
  const connection = useConnectionStatus();
  const gps = useGpsStatus(options);
  return connection ?? gps;
}
