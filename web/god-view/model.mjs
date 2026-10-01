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

export function statusLabel(user) {
  return { idle: 'Browsing', available: user.available ? 'Ready for requests' : 'Unavailable for matching', unavailable: 'Not accepting rides',
    offered: 'Ride request offered', searching: 'Finding a driver', accepted: 'Heading to pickup', arrived: 'At pickup', in_progress: 'On a trip' }[user.status] || 'Connected';
}
