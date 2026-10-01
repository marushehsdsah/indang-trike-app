import { File, Paths } from 'expo-file-system';

// The signed-in user's offline copy (see utils/offlineSession.js), in the
// app's private storage. Every failure is swallowed: without the copy the app
// simply needs internet to open, as before.
const cacheFile = () => new File(Paths.document, 'indanggo-session-cache.json');

export function readSessionCache() {
  try {
    const file = cacheFile();
    return file.exists ? JSON.parse(file.textSync()) : null;
  } catch { return null; }
}

export function writeSessionCache(cache) {
  try {
    const file = cacheFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(cache));
  } catch {}
}

// Merges into the copy only while it still belongs to this user, so a response
// that lands after logout never writes private data back to the phone.
export function updateSessionCache(userId, patch) {
  const cache = readSessionCache();
  if (cache?.user?.id === userId) writeSessionCache({ ...cache, ...patch });
}

export function clearSessionCache() {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {}
}
