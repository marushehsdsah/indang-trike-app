import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { pickupFromFix } from '../utils/pickupLocation';

export default function useCurrentPickup() {
  const { gps } = useApp();
  const pickup = useMemo(() => gps.status === 'ready' ? pickupFromFix(gps.fix) : null, [gps.fix, gps.status]);
  return { pickup, source: pickup ? 'current' : 'unavailable',
    status: ['locating', 'idle'].includes(gps.status) ? 'loading' : pickup ? 'ready' : 'unavailable',
    // Known only from a measured fix: without GPS the rider may be anywhere.
    outsideServiceArea: gps.inServiceArea === false,
    message: pickup ? null : gps.message + ' Choose a pickup on the map if needed.', retry: gps.retry };
}
