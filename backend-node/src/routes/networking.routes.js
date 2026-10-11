import { Router } from 'express';
import { NetworkingController } from '../controllers/networking.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use('/networking', authenticateToken, requireRole('USER'));

router.get('/networking/suggestions', asyncHandler(NetworkingController.suggestions));
router.post('/networking/connect/:receiverId', asyncHandler(NetworkingController.connect));
router.patch('/networking/:connectionId/respond', asyncHandler(NetworkingController.respond));
router.get('/networking/my-connections', asyncHandler(NetworkingController.myConnections));
router.get('/networking/pending', asyncHandler(NetworkingController.pending));

export default router;
