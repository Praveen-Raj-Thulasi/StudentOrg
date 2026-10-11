import { Router } from 'express';
import { TreasurerController } from '../controllers/treasurer.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Overview & Executive Metrics
router.get(
  '/treasurer/overview',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.getOverview)
);

// Financial Reports & CSV Export
router.get(
  '/treasurer/reports',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.getReports)
);

router.get(
  '/treasurer/reports/export',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.exportReportsCsv)
);

// Sponsorships & Commitments
router.get(
  '/treasurer/sponsorships',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.getSponsorships)
);

router.post(
  '/treasurer/sponsorships',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.createSponsorship)
);

router.get(
  '/treasurer/sponsorships/:id',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.getSponsorshipById)
);

// Fund Collections & Ledger Verification
router.get(
  '/treasurer/collections',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN', 'ORGANIZER'),
  asyncHandler(TreasurerController.getFundCollections)
);

router.post(
  '/treasurer/collections',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN', 'ORGANIZER'),
  asyncHandler(TreasurerController.recordFundCollection)
);

router.post(
  '/treasurer/collections/:id/verify',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.verifyFundCollection)
);

router.post(
  '/treasurer/collections/:id/reject',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.rejectFundCollection)
);

// Receipt Inspection & OCR Mismatch Flagging
router.get(
  '/treasurer/claims/:id/inspect-receipt',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(TreasurerController.inspectClaimReceipt)
);

export default router;
