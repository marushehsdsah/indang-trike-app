// MapLibre reports a base-map tile that failed to download (a timeout or a
// dropped connection) as an error, which shows a full-screen error in a
// development build. The map retries the tile by itself and offline maps cover
// Indang, so these are logged quietly; every other map message is unchanged.
const TILE_DOWNLOAD_FAILURE = /Failed to load tile \S+ for source \S+: (timeout|.*(connection|network|unreachable|resolve host|timed out|canceled|cancelled))/i;

function isTileDownloadFailure({ message } = {}) {
  return typeof message === 'string' && TILE_DOWNLOAD_FAILURE.test(message);
}

// The MapLibre onLog handler: true means "handled, skip the default logging".
function handleMapLog(log, logInfo = console.info) {
  if (!isTileDownloadFailure(log)) return false;
  logInfo(`MapLibre tile not loaded yet (retrying): [${log.tag}] ${log.message}`);
  return true;
}

module.exports = { handleMapLog, isTileDownloadFailure };
