import { Router } from 'express';
import {
  getTokenController,
  updateSecretsController,
  getHealthController,
  getRootController,
} from '../controllers/token.controller.js';

const router = Router();

// Core Token Endpoint
router.get('/api/getToken', getTokenController);
router.get('/getToken', getTokenController);

// Manual Secret Sync Endpoints (On-Demand)
router.get('/api/updateSecrets', updateSecretsController);
router.post('/api/updateSecrets', updateSecretsController);
router.get('/updateSecrets', updateSecretsController);

// Health Check Endpoints
router.get('/api/health', getHealthController);
router.get('/health', getHealthController);

// Root Service Info
router.get('/', getRootController);

export default router;

