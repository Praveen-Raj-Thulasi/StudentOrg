import { Router } from 'express';
import { FundraisingController } from '../controllers/fundraising.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Campaigns
router.get(
  '/fundraising/campaigns',
  authenticateToken,
  asyncHandler(FundraisingController.getCampaigns)
);

router.get(
  '/fundraising/campaigns/:id',
  authenticateToken,
  asyncHandler(FundraisingController.getCampaignById)
);

router.post(
  '/fundraising/campaigns',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FundraisingController.createCampaign)
);

router.put(
  '/fundraising/campaigns/:id',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FundraisingController.updateCampaign)
);

// Contributions
router.post(
  '/fundraising/campaigns/:id/contribute',
  authenticateToken,
  asyncHandler(FundraisingController.contribute)
);

router.post(
  '/fundraising/contributions/:id/confirm',
  authenticateToken,
  asyncHandler(FundraisingController.confirmContribution)
);

export default router;
