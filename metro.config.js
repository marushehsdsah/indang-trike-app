// Metro (the JavaScript bundler): Expo's defaults, plus a check on release builds.
const { getDefaultConfig } = require('expo/metro-config');
const { releaseApiUrlProblem } = require('./utils/releaseApiUrl');

// A release build (the APK, built with Gradle or EAS) talks to the backend at
// the address fixed while it is built. Without one, the APK installs and opens
// but phones never reach the server and God view never sees them, so the build
// stops here instead. Expo marks the bundle "production" and loads .env before
// reading this file; the development server and debug builds are not checked.
if (process.env.NODE_ENV === 'production') {
  const problem = releaseApiUrlProblem(process.env.EXPO_PUBLIC_API_URL);
  if (problem) {
    const message = `Release build stopped: ${problem}. Set EXPO_PUBLIC_API_URL=https://indanggo-api.onrender.com `
      + 'before building the APK (docs/deployment.md).';
    // Printed as well as thrown: on Windows, Metro hides an error thrown here
    // behind an unrelated "ERR_UNSUPPORTED_ESM_URL_SCHEME" one.
    console.error(`\n${message}\n`);
    throw new Error(message);
  }
}

module.exports = getDefaultConfig(__dirname);
