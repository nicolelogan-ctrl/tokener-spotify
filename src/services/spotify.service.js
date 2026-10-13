import axios from 'axios';
import { SPOTIFY_CONFIG, TOTP_CONFIG, SYNC_CONFIG } from '../config/constants.js';
import { generateTOTP } from '../utils/totp.js';
import { fetchLatestSecret, runBackgroundSecretSync } from './secret.service.js';

let cachedTokenData = null;
let refreshTimer = null;

/**
 * Retrieves the current accurate Unix server timestamp from Spotify.
 * @returns {Promise<number>} Server timestamp in seconds
 */
export async function getServerTimestamp() {
  const response = await axios.get(SPOTIFY_CONFIG.SERVER_TIME_URL, {
    headers: SPOTIFY_CONFIG.REQUEST_HEADERS,
    timeout: 5000,
  });
  return response.data.serverTime;
}

/**
 * Schedules auto-refresh of access token before it expires.
 * @param {number} expirationTimestampMs - Expiration timestamp in milliseconds
 */
function scheduleTokenRefresh(expirationTimestampMs) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const now = Date.now();
  // Refresh 2 minutes before expiration (or 30s minimum if expiry is very close)
  const delay = Math.max(expirationTimestampMs - now - SYNC_CONFIG.TOKEN_BUFFER_MS, 30 * 1000);

  console.log(`[Token Cache] Next auto-refresh scheduled in ${Math.round(delay / 1000 / 60)} minute(s)`);

  refreshTimer = setTimeout(async () => {
    console.log('[Token Cache] Auto-refreshing access token in background...');
    try {
      await fetchFreshSpotifyToken();
      console.log('[Token Cache] Background token refresh succeeded.');
    } catch (err) {
      console.error('[Token Cache] Background refresh failed:', err.message);
      // Retry in 30 seconds if refresh failed
      setTimeout(() => scheduleTokenRefresh(Date.now() + 60 * 1000), 30 * 1000);
    }
  }, delay);

  // Unref timer so it doesn't prevent Node process from gracefully exiting if needed
  if (refreshTimer && typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

/**
 * Fetches a brand new access token directly from Spotify using TOTP verification.
 * Automatically attempts secret refresh if Spotify rejects the TOTP.
 * @returns {Promise<object>} Fresh Spotify token response data
 */
export async function fetchFreshSpotifyToken(isRetry = false) {
  const timestamp = await getServerTimestamp();
  const { version, secret } = await fetchLatestSecret();
  const totpNumber = generateTOTP(timestamp, secret);
  const totpCode = totpNumber.toString().padStart(TOTP_CONFIG.DIGITS, '0');

  const queryParams = {
    reason: 'init',
    productType: 'web-player',
    totp: totpCode,
    totpVer: version,
    totpServer: totpCode,
  };

  try {
    const response = await axios.get(SPOTIFY_CONFIG.TOKEN_URL, {
      headers: SPOTIFY_CONFIG.REQUEST_HEADERS,
      params: queryParams,
      timeout: 10000,
    });

    const tokenData = response.data;
    cachedTokenData = tokenData;

    if (tokenData.accessTokenExpirationTimestampMs) {
      scheduleTokenRefresh(tokenData.accessTokenExpirationTimestampMs);
    }

    return tokenData;
  } catch (error) {
    // If Spotify rejected the token request (e.g. secret version rotated by Spotify)
    if (!isRetry && (error.response?.status === 400 || error.response?.status === 401)) {
      console.warn('[Spotify Token] Token request rejected. Attempting self-healing secret sync...');
      await runBackgroundSecretSync();
      return fetchFreshSpotifyToken(true);
    }
    throw error;
  }
}

/**
 * Requests an anonymous/web client authentication token from Spotify.
 * Returns cached token if still valid, otherwise fetches and caches a fresh token.
 * @param {boolean} [forceRefresh=false] - Force retrieval of a new token from Spotify
 * @returns {Promise<object>} Spotify token response data
 */
export async function requestSpotifyToken(forceRefresh = false) {
  const now = Date.now();

  // Return cached token if valid and not close to expiration
  if (
    !forceRefresh &&
    cachedTokenData &&
    cachedTokenData.accessTokenExpirationTimestampMs &&
    now + SYNC_CONFIG.TOKEN_BUFFER_MS < cachedTokenData.accessTokenExpirationTimestampMs
  ) {
    return cachedTokenData;
  }

  return fetchFreshSpotifyToken();
}

