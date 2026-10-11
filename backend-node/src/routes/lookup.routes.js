import { Router } from 'express';
import { LookupController } from '../controllers/lookup.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/lookup/:code', authenticateToken, asyncHandler(LookupController.byPublicId));

export default router;
