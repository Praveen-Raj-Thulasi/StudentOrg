import { Router } from 'express';
import { OrganizerController } from '../controllers/organizer.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changePasswordSchema } from '../validators/auth.validator.js';

const router = Router();

// All organizer routes require valid JWT authentication and ORGANIZER or ADMIN role
router.use('/organizer', authenticateToken, requireRole('ORGANIZER', 'ADMIN'));

router.get('/organizer/profile', asyncHandler(OrganizerController.getProfile));
router.put('/organizer/profile', asyncHandler(OrganizerController.updateProfile));

router.get('/organizer/profile/location', asyncHandler(OrganizerController.getLocation));
router.put('/organizer/profile/location', asyncHandler(OrganizerController.updateLocation));

import { createUploader } from '../utils/upload.js';

const logoUploader = createUploader('logos');

router.patch(
  '/organizer/change-password',
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(OrganizerController.changePassword)
);

router.post(
  '/organizer/profile/logo',
  logoUploader.single('file'),
  asyncHandler(OrganizerController.uploadLogo)
);

export default router;
