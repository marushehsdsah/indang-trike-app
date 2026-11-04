// MapLibre reports a base-map tile or font (glyph range) that failed to
// download (a timeout or a dropped connection) as an error, which shows a
// full-screen error in a development build. The map retries both by itself and
// offline maps cover Indang, so these are logged quietly; every other map
// message is unchanged.
const DOWNLOAD_FAILURE = /Failed to load (tile \S+ for source \S+|glyph range \S+ for font stack [^:]+):\W*(timeout|.*(connection|network|unreachable|resolve host|timed out|canceled|cancelled))/i;

function isDownloadFailure({ message } = {}) {
  return typeof message === 'string' && DOWNLOAD_FAILURE.test(message);
}

// The MapLibre onLog handler: true means "handled, skip the default logging".
function handleMapLog(log, logInfo = console.info) {
  if (!isDownloadFailure(log)) return false;
  logInfo(`MapLibre map data not loaded yet (retrying): [${log.tag}] ${log.message}`);
  return true;
}

module.exports = { handleMapLog, isDownloadFailure };
