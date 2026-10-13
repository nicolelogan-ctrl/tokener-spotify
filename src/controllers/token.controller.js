import { requestSpotifyToken } from '../services/spotify.service.js';
import { runBackgroundSecretSync } from '../services/secret.service.js';

/**
 * Controller to handle token generation requests.
 * Supports optional ?force=true query parameter to bypass cache.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
export async function getTokenController(req, res) {
  try {
    const force = req.query.force === 'true' || req.query.refresh === 'true';
    const tokenData = await requestSpotifyToken(force);
    res.status(200).json(tokenData);
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || {
      error: error.message || 'Internal Server Error while generating Spotify token',
    };

    res.status(statusCode).json(errorData);
  }
}

/**
 * Controller to trigger manual secret sync from Spotify Web Player without restarting.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
export async function updateSecretsController(req, res) {
  try {
    const result = await runBackgroundSecretSync();
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Secrets successfully updated and saved to disk',
        latestVersion: result.version,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(502).json({
        success: false,
        message: result.message || 'Failed to update secrets from Spotify',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error while updating secrets',
    });
  }
}

/**
 * Controller for health check endpoint.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
export function getHealthController(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'spotify-token-generator',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Controller for root endpoint info.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
export function getRootController(req, res) {
  res.status(200).json({
    name: 'spotify-token-generator',
    description: 'Spotify authentication token generator with TOTP verification and background auto-sync',
    endpoints: {
      getToken: 'GET /api/getToken (supports ?force=true)',
      updateSecrets: 'GET /api/updateSecrets',
      health: 'GET /api/health',
    },
  });
}

