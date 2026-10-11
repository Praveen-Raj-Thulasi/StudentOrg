import { Router } from 'express';
import { RoleController } from '../controllers/role.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Current user inspection of own roles
router.get('/roles/my-roles', authenticateToken, asyncHandler(RoleController.getMyRoles));

// President-restricted role management
router.post(
  '/roles/assign',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(RoleController.assignRole)
);

router.post(
  '/roles/revoke',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(RoleController.revokeRole)
);

router.get(
  '/roles/user/:userId',
  authenticateToken,
  requireRole('PRESIDENT', 'ADMIN'),
  asyncHandler(RoleController.getUserRoles)
);

export default router;
