import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { SPOTIFY_CONFIG, PARSER_CONFIG } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SECRETS_DIR = path.resolve(__dirname, '../../secrets');

let inMemorySecretsDict = null;

/**
 * Validates HTTP response status code.
 * @param {number} status - HTTP status code
 */
function validateHttpStatus(status) {
  if (status < 200 || status > 299) {
    throw new Error(`HTTP request failed with status code ${status}`);
  }
}

/**
 * Constructs fetch request options with User-Agent header.
 * @returns {object} Request options
 */
function createFetchOptions() {
  return {
    headers: {
      'User-Agent': SPOTIFY_CONFIG.USER_AGENT,
    },
  };
}

/**
 * Extracts the Spotify Web Player JS bundle URL from Spotify's homepage.
 * @returns {Promise<string>} Web Player JS bundle URL
 */
export async function fetchPlayerJsUrl() {
  const response = await fetch(SPOTIFY_CONFIG.HOME_URL, createFetchOptions());
  validateHttpStatus(response.status);

  const html = await response.text();
  const match = html.match(PARSER_CONFIG.PLAYER_JS_REGEX);

  if (!match) {
    throw new Error('Player JS URL not found in Spotify homepage');
  }

  return match[1];
}

/**
 * Downloads the Spotify Web Player JS bundle source code.
 * @param {string} playerJsUrl - URL of the web player JS
 * @returns {Promise<string>} JavaScript bundle source text
 */
export async function fetchPlayerJs(playerJsUrl) {
  const response = await fetch(playerJsUrl, createFetchOptions());
  validateHttpStatus(response.status);

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('javascript')) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  return response.text();
}

/**
 * Parses versioned secret tokens from the Spotify Web Player JS source code.
 * @param {string} playerJs - JavaScript source code string
 * @returns {Array<{version: number, secret: string}>} Array of secret objects
 */
export function extractSecretsFromSource(playerJs) {
  const secrets = [];
  let match;
  const regex = new RegExp(PARSER_CONFIG.SECRETS_REGEX.source, 'g');

  while ((match = regex.exec(playerJs)) !== null) {
    secrets.push({
      version: parseInt(match[3], 10),
      secret: match[2],
    });
  }

  return secrets;
}

/**
 * Converts string secrets into numeric byte arrays.
 * @param {Array<{version: number, secret: string}>} secrets - Array of secret objects
 * @returns {Array<{version: number, secret: number[]}>}
 */
export function secretsToBytes(secrets) {
  return secrets.map(({ version, secret }) => ({
    version,
    secret: Array.from(secret, (char) => char.charCodeAt(0)),
  }));
}

/**
 * Converts secrets array to a key-value dictionary indexed by version number.
 * @param {Array<{version: number, secret: string}>} secrets - Array of secret objects
 * @returns {Record<string, number[]>}
 */
export function secretsToDict(secrets) {
  return secrets.reduce((dict, { version, secret }) => {
    dict[String(version)] = Array.from(secret, (char) => char.charCodeAt(0));
    return dict;
  }, {});
}

/**
 * Scrapes Spotify web player and extracts all available secrets with metadata.
 * @returns {Promise<{success: boolean, secrets?: Array, secretsBytes?: Array, secretsDict?: object, message?: string}>}
 */
export async function extractSecrets() {
  try {
    const playerJsUrl = await fetchPlayerJsUrl();
    const playerJs = await fetchPlayerJs(playerJsUrl);
    const secrets = extractSecretsFromSource(playerJs);

    return {
      success: true,
      secrets: secrets,
      secretsBytes: secretsToBytes(secrets),
      secretsDict: secretsToDict(secrets),
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}

/**
 * Retrieves the highest version secret from a secrets dictionary.
 * @param {Record<string, number[]>} secretsDict - Version-indexed dictionary
 * @returns {{version: number, secret: number[]}}
 */
export function getLatestSecret(secretsDict) {
  const versions = Object.keys(secretsDict).map(Number);
  const latestVersion = Math.max(...versions);
  return {
    version: latestVersion,
    secret: secretsDict[latestVersion],
  };
}

/**
 * Loads secrets dictionary from local disk cache if available.
 * @returns {Record<string, number[]>|null}
 */
export function loadLocalSecretsDict() {
  try {
    const filePath = path.join(SECRETS_DIR, 'secretDict.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Object.keys(parsed).length > 0) {
        inMemorySecretsDict = parsed;
        return parsed;
      }
    }
  } catch (error) {
    console.warn('[Secret Cache] Could not read local secrets file:', error.message);
  }
  return null;
}

/**
 * Saves extracted secrets to local disk files.
 * @param {object} result - Extraction result object
 */
export function saveSecretsToDisk(result) {
  try {
    if (!fs.existsSync(SECRETS_DIR)) {
      fs.mkdirSync(SECRETS_DIR, { recursive: true });
    }

    if (result.secrets) {
      fs.writeFileSync(
        path.join(SECRETS_DIR, 'secrets.json'),
        JSON.stringify(result.secrets, null, 2)
      );
    }

    if (result.secretsBytes) {
      fs.writeFileSync(
        path.join(SECRETS_DIR, 'secretsBytes.json'),
        JSON.stringify(result.secretsBytes)
      );
    }

    if (result.secretsDict) {
      fs.writeFileSync(
        path.join(SECRETS_DIR, 'secretDict.json'),
        JSON.stringify(result.secretsDict)
      );
      inMemorySecretsDict = result.secretsDict;
    }
  } catch (error) {
    console.error('[Secret Cache] Error saving secrets to disk:', error.message);
  }
}

/**
 * Fetches the latest secret, prioritizing local disk cache, with automatic fallback to live Spotify Web Player extraction.
 * @returns {Promise<{version: number, secret: number[]}>}
 */
export async function fetchLatestSecret() {
  // 1. Check in-memory or local disk cache first (instant response)
  if (!inMemorySecretsDict) {
    loadLocalSecretsDict();
  }

  if (inMemorySecretsDict && Object.keys(inMemorySecretsDict).length > 0) {
    return getLatestSecret(inMemorySecretsDict);
  }

  // 2. Fallback to live extraction directly from Spotify Web Player
  const result = await extractSecrets();
  if (!result.success) {
    throw new Error(`Unable to extract Spotify secrets: ${result.message}`);
  }

  saveSecretsToDisk(result);
  return getLatestSecret(result.secretsDict);
}

/**
 * Runs background secret check & extraction from Spotify Web Player without downtime.
 * @returns {Promise<{success: boolean, version?: number, message?: string}>}
 */
export async function runBackgroundSecretSync() {
  console.log('[Secret Sync] Checking Spotify Web Player for latest secrets...');
  try {
    const result = await extractSecrets();
    if (result.success && result.secretsDict) {
      const latest = getLatestSecret(result.secretsDict);
      saveSecretsToDisk(result);
      console.log(`[Secret Sync] Secrets successfully synced. Latest active version: ${latest.version}`);
      return { success: true, version: latest.version, secrets: result.secrets };
    } else {
      console.warn(`[Secret Sync] Could not extract secrets: ${result.message}`);
      return { success: false, message: result.message };
    }
  } catch (error) {
    console.error('[Secret Sync] Background sync error:', error.message);
    return { success: false, message: error.message };
  }
}

