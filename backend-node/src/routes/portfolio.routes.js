import { Router } from 'express';
import { GamificationController } from '../controllers/gamification.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get(
  '/portfolio/my',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(GamificationController.myPortfolio)
);

export default router;
