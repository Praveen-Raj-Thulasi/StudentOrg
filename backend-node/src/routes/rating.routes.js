import { Router } from 'express';
import { RatingController } from '../controllers/rating.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Public review listing and summaries
router.get('/ratings/events/:eventId', asyncHandler(RatingController.getEventRatings));
router.get('/ratings/events/:eventId/summary', asyncHandler(RatingController.getSummary));

// Authenticated user actions
router.post(
  '/ratings/events/:eventId',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(RatingController.submitRating)
);

router.put(
  '/ratings/events/:eventId/my',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(RatingController.updateMyRating)
);

router.get(
  '/ratings/events/:eventId/my',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(RatingController.getMyReview)
);

router.get(
  '/ratings/events/:eventId/eligibility',
  authenticateToken,
  requireRole('USER'),
  asyncHandler(RatingController.eligibility)
);

// Admin moderation
router.patch(
  '/ratings/:ratingId/moderate',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(RatingController.moderate)
);

export default router;
