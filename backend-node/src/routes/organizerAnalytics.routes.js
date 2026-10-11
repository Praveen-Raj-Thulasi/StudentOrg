import { Router } from 'express';
import { OrganizerAnalyticsController } from '../controllers/organizerAnalytics.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Public leaderboard
router.get('/organizer/analytics/leaderboard', asyncHandler(OrganizerAnalyticsController.leaderboard));

// Organizer-only analytics endpoints
router.get(
  '/organizer/analytics',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.analytics)
);

router.get(
  '/organizer/analytics/ask',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.ask)
);

router.get(
  '/organizer/analytics/predict/:eventId',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.predict)
);

// Organizer dashboard and participants
router.get(
  '/organizer/dashboard',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.dashboard)
);

router.get(
  '/organizer/participants',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.participants)
);

// Event asset generation and exports
router.get(
  '/organizer/events/:eventId/participants/export',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.exportParticipants)
);

router.post(
  '/organizer/events/:eventId/poster',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(OrganizerAnalyticsController.generatePoster)
);

export default router;
