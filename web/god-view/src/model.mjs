export function filterUsers(users, role, query) {
  const needle = query.trim().toLocaleLowerCase();
  return users.filter(user => (role === 'all' || user.role === role) &&
    [user.name, user.plate, user.toda].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
}

export function isLive(user, now, connected) {
  return Boolean(connected && user.location && user.locationStatus === 'live' && now - user.location.timestamp <= 30000);
}

export function snapshotTiming(serverTime, requestStarted, receivedAt) {
  // Conservatively include the entire round trip in the snapshot's age. A
  // delayed response must never reset an old measured position to "live".
  return { connected: receivedAt - requestStarted <= 10000, serverOffset: serverTime - requestStarted };
}

export function ageLabel(timestamp, now) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function locationLabel(user, now, connected) {
  if (!user.location) return 'Waiting for GPS';
  if (!connected) return 'Updates paused · last known';
  if (!isLive(user, now, connected)) return `Last known · ${ageLabel(user.location.timestamp, now)}`;
  return `Live GPS · ${ageLabel(user.location.timestamp, now)}`;
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}

export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// The route guide line for a matched ride's details: what the driver drives now.
export function routeSummary(route) {
  const leg = (line) => `${formatDistance(line.distanceMeters)} · ${formatDuration(line.durationSeconds)}`;
  if (route.stage === 'to-pickup') {
    const parts = [route.approach ? `Driver to pickup: ${leg(route.approach)}` : 'Driver to pickup: waiting for live GPS'];
    if (route.trip) parts.push(`Then trip: ${leg(route.trip)}`);
    return parts;
  }
  return [route.trip ? `To destination: ${leg(route.trip)}` : 'To destination'];
}

export function statusLabel(user) {
  return { idle: 'Browsing', available: user.available ? 'Ready for requests' : 'Unavailable for matching', unavailable: 'Not accepting rides',
    offered: 'Ride request offered', searching: 'Finding a driver', accepted: 'Heading to pickup', arrived: 'At pickup', in_progress: 'On a trip' }[user.status] || 'Connected';
}

// Each matched ride as the driver's route guide shows it: the leg being driven
// now ("current", driver to pickup, then pickup to destination), the trip still
// ahead before pickup ("upcoming"), and the pickup and destination points.
export function routeFeatures(routes, selectedRideId) {
  const features = [];
  for (const route of routes) {
    const selected = route.rideId === selectedRideId;
    const line = (kind, path) => { if (path) features.push({ type: 'Feature', properties: { kind, selected, rideId: route.rideId }, geometry: { type: 'LineString', coordinates: path.coordinates } }); };
    if (route.stage === 'to-pickup') { line('current', route.approach); line('upcoming', route.trip); }
    else line('current', route.trip);
    for (const [kind, stop] of [['pickup', route.pickup], ['dropoff', route.dropoff]]) {
      if (stop) features.push({ type: 'Feature', properties: { kind, rideId: route.rideId, name: stop.name }, geometry: { type: 'Point', coordinates: stop.coordinate } });
    }
  }
  return { type: 'FeatureCollection', features };
}
