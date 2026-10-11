import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { changePasswordSchema } from '../validators/auth.validator.js';

const router = Router();

// All user routes require valid JWT authentication and USER or ADMIN role
router.use('/user', authenticateToken, requireRole('USER', 'ADMIN'));

router.get('/user/profile', asyncHandler(UserController.getProfile));
router.put('/user/profile', asyncHandler(UserController.updateProfile));

router.get('/user/profile/location', asyncHandler(UserController.getLocation));
router.put('/user/profile/location', asyncHandler(UserController.updateLocation));

import { createUploader } from '../utils/upload.js';

const profileUploader = createUploader('profiles');

router.patch(
  '/user/change-password',
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(UserController.changePassword)
);

router.post(
  '/user/profile/picture',
  profileUploader.single('file'),
  asyncHandler(UserController.uploadPicture)
);

export default router;
