import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { approvalDecisionSchema } from '../validators/event.validator.js';

const router = Router();

// All admin routes require PRESIDENT or ADMIN role
router.use('/admin', authenticateToken, requireRole('PRESIDENT', 'ADMIN'));

router.get('/admin/dashboard', asyncHandler(AdminController.dashboard));
router.get('/admin/approvals', asyncHandler(AdminController.approvals));
router.post(
  '/admin/events/:eventId/review',
  validateRequest({ body: approvalDecisionSchema }),
  asyncHandler(AdminController.reviewEvent)
);
router.get('/admin/users', asyncHandler(AdminController.users));
router.get('/admin/organizers', asyncHandler(AdminController.organizers));
router.get('/admin/events', asyncHandler(AdminController.events));
router.get('/admin/payments', asyncHandler(AdminController.payments));
router.get('/admin/refunds', asyncHandler(AdminController.refunds));
router.patch('/admin/refunds/:refundId/status', asyncHandler(AdminController.updateRefundStatus));
router.get('/admin/audit-logs', asyncHandler(AdminController.auditLogs));

export default router;
