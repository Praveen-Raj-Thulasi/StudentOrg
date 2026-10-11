import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

const router = Router();

// Liveness probe
router.get('/health', HealthController.getLiveness);

// Readiness probe
router.get('/ready', HealthController.getReadiness);

export default router;
