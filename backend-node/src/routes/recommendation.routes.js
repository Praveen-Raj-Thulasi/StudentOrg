import { Router } from 'express';
import { RecommendationController } from '../controllers/recommendation.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Discover page can be accessed publicly, but if token is present, req.user will be populated
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateToken(req, res, next);
  }
  next();
}

router.get('/recommendations/discover', optionalAuth, asyncHandler(RecommendationController.discover));

router.get(
  '/recommendations/interests',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(RecommendationController.getInterests)
);

router.put(
  '/recommendations/interests',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(RecommendationController.updateInterests)
);

export default router;
