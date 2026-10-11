import { Router } from 'express';
import { CommunityChatController } from '../controllers/communityChat.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All community routes require authentication
router.use('/events/:eventId/community', authenticateToken);

// Context
router.get('/events/:eventId/community', asyncHandler(CommunityChatController.context));

// Messages
router.get('/events/:eventId/community/messages', asyncHandler(CommunityChatController.messages));
router.get('/events/:eventId/community/messages/poll', asyncHandler(CommunityChatController.poll));
router.get('/events/:eventId/community/messages/older', asyncHandler(CommunityChatController.older));
router.post('/events/:eventId/community/messages', asyncHandler(CommunityChatController.send));

// Individual message modification
router.patch('/events/:eventId/community/messages/:messageId', asyncHandler(CommunityChatController.edit));
router.delete('/events/:eventId/community/messages/:messageId', asyncHandler(CommunityChatController.delete));
router.patch('/events/:eventId/community/messages/:messageId/pin', asyncHandler(CommunityChatController.pin));

// Moderation
router.patch('/events/:eventId/community/close', asyncHandler(CommunityChatController.close));
router.post('/events/:eventId/community/mute', asyncHandler(CommunityChatController.mute));

export default router;
