const { createBackend } = require('./indang-trike-backend/app');
const path = require('node:path');

// Local backend-only settings, kept out of Expo's public app configuration.
// Exported environment variables (including Render settings) take precedence.
try { process.loadEnvFile(path.join(__dirname, '.env.backend')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

createBackend().then((backend) => {
  const port = Number(process.env.PORT || 3000);
  backend.server.listen(port, '0.0.0.0', () => console.log(`IndangGO API and live updates listening on port ${port}`));
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    await backend.close();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}).catch((error) => {
  console.error('Unable to start IndangGO backend:', error.message);
  process.exitCode = 1;
});
