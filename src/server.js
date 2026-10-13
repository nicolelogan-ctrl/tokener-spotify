import app from './app.js';
import { DEFAULT_PORT, SYNC_CONFIG } from './config/constants.js';
import { runBackgroundSecretSync, loadLocalSecretsDict } from './services/secret.service.js';
import { fetchFreshSpotifyToken } from './services/spotify.service.js';

const server = app.listen(DEFAULT_PORT, async () => {
  console.log(`[Spotify Token Generator] Server running on port ${DEFAULT_PORT}`);
  console.log(`[Endpoints] GET http://localhost:${DEFAULT_PORT}/api/getToken`);
  console.log(`[Endpoints] GET http://localhost:${DEFAULT_PORT}/api/updateSecrets`);
  console.log(`[Endpoints] GET http://localhost:${DEFAULT_PORT}/api/health`);

  // 1. Load local secrets if available
  loadLocalSecretsDict();

  // 2. Perform initial background secret check & token pre-warm asynchronously
  setTimeout(async () => {
    try {
      console.log('[Startup] Pre-warming Spotify access token...');
      await fetchFreshSpotifyToken();
      console.log('[Startup] Access token pre-warmed successfully.');
    } catch (err) {
      console.warn('[Startup] Token pre-warm notice:', err.message);
    }

    try {
      console.log('[Startup] Verifying Spotify secrets from Web Player...');
      await runBackgroundSecretSync();
    } catch (err) {
      console.warn('[Startup] Secret sync notice:', err.message);
    }
  }, 1000);

  // 3. Schedule periodic secret update every 1 hour (matches GitHub Actions schedule)
  const syncInterval = setInterval(async () => {
    console.log('[Scheduled Task] Running 1-hour recurring secrets sync...');
    await runBackgroundSecretSync();
  }, SYNC_CONFIG.SECRETS_SYNC_INTERVAL_MS);

  if (syncInterval && typeof syncInterval.unref === 'function') {
    syncInterval.unref();
  }
  console.log('[Scheduler] Background secret auto-sync scheduled every 1 hour (Zero Downtime).');
});

export default server;

