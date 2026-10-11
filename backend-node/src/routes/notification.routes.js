import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All notification routes require authentication
router.use('/notifications', authenticateToken);

// GET /api/notifications - paginated notifications
router.get('/notifications', NotificationController.getNotifications);

// GET /api/notifications/unread - unread count
router.get('/notifications/unread', NotificationController.getUnreadCount);

// PATCH /api/notifications/read-all - mark all read
router.patch('/notifications/read-all', NotificationController.markAllRead);

// GET /api/notifications/stream - Server-Sent Events stream
router.get('/notifications/stream', NotificationController.stream);

export default router;
