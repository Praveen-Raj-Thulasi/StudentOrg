import { Router } from 'express';
import { MembershipController } from '../controllers/membership.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// ── Student Membership Endpoints ─────────────────────────────────────────────
router.post(
  '/memberships/apply',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.apply)
);

router.get(
  '/memberships/my',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.getMyMembership)
);

router.get(
  '/memberships/status',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.getMyMembership)
);

router.post(
  '/memberships/renew',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.renew)
);

// ── President Review & Administration Endpoints ──────────────────────────────
router.get(
  '/memberships/pending',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.getPendingApplications)
);

router.get(
  '/memberships',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.getAllMemberships)
);

router.post(
  '/memberships/:id/approve',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.approveApplication)
);

router.post(
  '/memberships/:id/reject',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.rejectApplication)
);

router.post(
  '/memberships/:id/suspend',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.suspendMembership)
);

router.post(
  '/memberships/:id/activate',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.activateMembership)
);

// ── Membership Dues & Payment Obligations ────────────────────────────────────
router.get(
  '/dues/my',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.getMyDues)
);

router.get(
  '/dues',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.getAllDues)
);

router.post(
  '/dues',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.assessDues)
);

router.post(
  '/dues/:id/order',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.createRazorpayOrder)
);

router.post(
  '/dues/:id/verify',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.verifyRazorpayPayment)
);

router.post(
  '/dues/:id/pay',
  authenticateToken,
  requireRole('STUDENT', 'USER'),
  asyncHandler(MembershipController.settleDues)
);

router.post(
  '/dues/:id/waive',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(MembershipController.waiveDues)
);

export default router;
