import { Router } from 'express';
import { OrganizationAnnouncementController } from '../controllers/organizationAnnouncement.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/announcements', authenticateToken, requireRole('PRESIDENT', 'ADMIN'), asyncHandler(OrganizationAnnouncementController.list));
router.post('/announcements', authenticateToken, requireRole('PRESIDENT', 'ADMIN'), asyncHandler(OrganizationAnnouncementController.publish));

export default router;
