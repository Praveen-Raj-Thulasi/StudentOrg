import { Router } from 'express';
import { HelpController } from '../controllers/help.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Public help endpoints
router.get('/help', asyncHandler(HelpController.getHelp));
router.get('/help/faqs', asyncHandler(HelpController.getFaqs));
router.get('/help/videos', asyncHandler(HelpController.getVideos));

// Admin management endpoints
router.post(
  '/help/faqs',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(HelpController.saveFaq)
);

router.put(
  '/help/faqs/:id',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(HelpController.saveFaq)
);

router.post(
  '/help/videos',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(HelpController.saveVideo)
);

router.put(
  '/help/videos/:id',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(HelpController.saveVideo)
);

router.delete(
  '/help/videos/:id',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(HelpController.deleteVideo)
);

export default router;
