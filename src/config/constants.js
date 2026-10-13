export const DEFAULT_PORT = process.env.PORT || process.env.SERVER_PORT || 37353;

export const SPOTIFY_CONFIG = {
  HOME_URL: 'https://open.spotify.com/',
  TOKEN_URL: 'https://open.spotify.com/api/token',
  SERVER_TIME_URL: 'https://open.spotify.com/api/server-time',
  USER_AGENT: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  REQUEST_HEADERS: {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json',
    Referer: 'https://open.spotify.com/',
    Origin: 'https://open.spotify.com',
  },
};


export const PARSER_CONFIG = {
  PLAYER_JS_REGEX: /"(https:\/\/[^" ]+\/web-player\.[0-9a-f]+\.js)"/,
  SECRETS_REGEX: /\{\s*secret\s*:\s*(["'])(.*?)\1\s*,\s*version\s*:\s*(\d+)\s*\}/g,
};

export const TOTP_CONFIG = {
  BASE32_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  TIME_STEP: 30,
  DIGITS: 6,
};

export const SYNC_CONFIG = {
  // Sync secrets every 1 hour (matches GitHub Actions workflow)
  SECRETS_SYNC_INTERVAL_MS: 60 * 60 * 1000,
  // 2 minutes buffer before token expiration to refresh token seamlessly
  TOKEN_BUFFER_MS: 2 * 60 * 1000,
};
