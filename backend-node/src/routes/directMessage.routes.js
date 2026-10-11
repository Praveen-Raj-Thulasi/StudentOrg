import { Router } from 'express';
import { DirectMessageController } from '../controllers/directMessage.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All direct chat routes require authentication
router.use('/chat', authenticateToken);

// Conversation & messages
router.get('/chat/unread', asyncHandler(DirectMessageController.unread));
router.get('/chat/:otherId', asyncHandler(DirectMessageController.conversation));
router.get('/chat/:otherId/poll', asyncHandler(DirectMessageController.poll));
router.post('/chat/:receiverId', asyncHandler(DirectMessageController.send));

// Individual message modification
router.patch('/chat/messages/:messageId', asyncHandler(DirectMessageController.edit));
router.delete('/chat/messages/:messageId', asyncHandler(DirectMessageController.deleteForMe));
router.delete('/chat/messages/:messageId/everyone', asyncHandler(DirectMessageController.unsend));

export default router;
