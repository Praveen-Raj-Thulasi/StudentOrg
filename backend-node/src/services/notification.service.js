import { Notification } from '../models/Notification.js';
import { logger } from '../utils/logger.js';

class NotificationService {
  constructor() {
    // Map of key ('USER:1' or 'ORGANIZER:2') -> Set of response streams
    this.clients = new Map();
  }

  /**
   * Persist a notification and broadcast it via SSE if the recipient is connected.
   */
  async sendNotification(recipientId, recipientType, type, title, message, actionUrl = null) {
    const numId = Number(recipientId);
    const roleType = (recipientType || 'USER').toUpperCase();

    try {
      const notification = await Notification.create({
        recipientId: numId,
        recipientType: roleType,
        notificationType: type,
        title,
        message,
        actionUrl,
        read: false,
        createdAt: new Date(),
      });

      this.emit(numId, roleType, notification);
      try {
        const { realtimeBroker } = await import('../sockets/realtimeBroker.js');
        realtimeBroker.broadcastNotification(numId, roleType, notification);
      } catch {}
      return notification;
    } catch (err) {
      logger.warn({ err, recipientId: numId, roleType }, `[NotificationService] Failed to persist notification: ${err.message}`);
      // Still attempt SSE emission even if persistence encounters an issue
      const transientNotification = {
        recipientId: numId,
        recipientType: roleType,
        notificationType: type,
        title,
        message,
        actionUrl,
        read: false,
        createdAt: new Date(),
      };
      this.emit(numId, roleType, transientNotification);
      return transientNotification;
    }
  }

  /**
   * Paginated retrieval of notifications for a recipient.
   */
  async getNotifications(recipientId, recipientType, page = 0, size = 20) {
    const safePage = Math.max(0, parseInt(page, 10));
    const safeSize = Math.min(100, Math.max(1, parseInt(size, 10)));
    const filter = {
      recipientId: Number(recipientId),
      recipientType: (recipientType || 'USER').toUpperCase(),
    };

    const totalElements = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / safeSize) || 0;

    const content = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(safePage * safeSize)
      .limit(safeSize);

    return {
      content,
      page: safePage,
      size: safeSize,
      totalElements,
      totalPages,
      first: safePage === 0,
      last: safePage >= totalPages - 1,
    };
  }

  /**
   * Unread notification count.
   */
  async getUnreadCount(recipientId, recipientType) {
    const filter = {
      recipientId: Number(recipientId),
      recipientType: (recipientType || 'USER').toUpperCase(),
      read: false,
    };
    return Notification.countDocuments(filter);
  }

  /**
   * Mark all notifications as read for recipient.
   */
  async markAllRead(recipientId, recipientType) {
    const filter = {
      recipientId: Number(recipientId),
      recipientType: (recipientType || 'USER').toUpperCase(),
      read: false,
    };

    const now = new Date();
    await Notification.updateMany(filter, {
      $set: { read: true, readAt: now },
    });
  }

  /**
   * Initialize SSE connection for a recipient.
   */
  handleStream(recipientId, recipientType, req, res) {
    const numId = Number(recipientId);
    const roleType = (recipientType || 'USER').toUpperCase();
    const key = `${roleType}:${numId}`;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write('event: connected\ndata: ok\n\n');

    if (!this.clients.has(key)) {
      this.clients.set(key, new Set());
    }
    const clientSet = this.clients.get(key);
    clientSet.add(res);

    // Keepalive ping every 25s to prevent timeouts through proxies/Cloudflare
    const keepAliveTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch (err) {
        clearInterval(keepAliveTimer);
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(keepAliveTimer);
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.clients.delete(key);
      }
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    res.on('error', cleanup);
  }

  /**
   * Broadcast an event payload to all connected SSE clients of a recipient.
   */
  emit(recipientId, recipientType, notification) {
    const key = `${recipientType.toUpperCase()}:${recipientId}`;
    const clientSet = this.clients.get(key);
    if (!clientSet || clientSet.size === 0) return;

    const dataPayload = JSON.stringify(notification);
    for (const res of clientSet) {
      try {
        res.write(`event: notification\ndata: ${dataPayload}\n\n`);
      } catch (err) {
        logger.warn({ err }, `[NotificationService] Error writing to SSE client for ${key}`);
      }
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
