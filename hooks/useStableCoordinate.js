import { useRef } from 'react';
import { haversineDistance } from '../utils/pathfinding';

// The coordinate, replaced only once it moves more than `meters`, so GPS
// jitter does not redo work keyed on it (a route search, a camera move).
export default function useStableCoordinate(coordinate, meters) {
  const ref = useRef(null);
  if (!coordinate) ref.current = null;
  else if (!ref.current || haversineDistance(ref.current, coordinate) > meters) {
    ref.current = { latitude: coordinate.latitude, longitude: coordinate.longitude };
  }
  return ref.current;
}
