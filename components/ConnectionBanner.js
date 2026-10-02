import React from 'react';
import StatusPill from './StatusPill';
import { useConnectionStatus } from '../hooks/useMapStatus';
import { SPACE } from '../theme';

// Connection trouble on the screens without a map; nothing when all is well.
export default function ConnectionBanner({ style }) {
  const status = useConnectionStatus();
  if (!status) return null;
  return <StatusPill {...status} style={[{ alignSelf: 'stretch', marginBottom: SPACE.md, elevation: 0, shadowOpacity: 0 }, style]} />;
}
