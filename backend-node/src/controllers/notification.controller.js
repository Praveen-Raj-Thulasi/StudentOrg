import { notificationService } from '../services/notification.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class NotificationController {
  /**
   * GET /api/notifications
   */
  static async getNotifications(req, res, next) {
    try {
      const page = req.query.page || 0;
      const size = req.query.size || 20;
      const data = await notificationService.getNotifications(
        req.user.id,
        req.user.role,
        page,
        size
      );
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/notifications/unread
   */
  static async getUnreadCount(req, res, next) {
    try {
      const count = await notificationService.getUnreadCount(
        req.user.id,
        req.user.role
      );
      return ApiResponse.success(res, count);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/notifications/read-all
   */
  static async markAllRead(req, res, next) {
    try {
      await notificationService.markAllRead(
        req.user.id,
        req.user.role
      );
      return ApiResponse.success(res, null, 'All notifications marked as read');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/notifications/stream
   */
  static async stream(req, res, next) {
    try {
      notificationService.handleStream(
        req.user.id,
        req.user.role,
        req,
        res
      );
    } catch (err) {
      next(err);
    }
  }
}

export default NotificationController;
