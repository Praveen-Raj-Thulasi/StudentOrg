import { logger } from '../utils/logger.js';

class RealtimeBroker {
  constructor() {
    this.io = null;
    this.stompBroadcaster = null;
    this.sseBroadcaster = null;
  }

  /**
   * Set the Socket.IO instance.
   * @param {import('socket.io').Server} io
   */
  setIO(io) {
    this.io = io;
  }

  /**
   * Set the STOMP broadcast callback.
   * @param {Function} broadcaster (destination: string, payload: any) => void
   */
  setStompBroadcaster(broadcaster) {
    this.stompBroadcaster = broadcaster;
  }

  /**
   * Set the SSE notification emitter callback.
   * @param {Function} broadcaster (recipientId: number, recipientType: string, payload: any) => void
   */
  setSseBroadcaster(broadcaster) {
    this.sseBroadcaster = broadcaster;
  }

  /**
   * Broadcast an event community message.
   * Delivered to:
   * 1. Socket.IO room `event:${eventId}` with event `community:message`
   * 2. STOMP subscribers on `/topic/events/${eventId}/community`
   *
   * @param {number|string} eventId
   * @param {'created'|'updated'|'deleted'} action
   * @param {object} message
   */
  broadcastCommunityMessage(eventId, action, message) {
    const numEventId = Number(eventId);
    const payload = { action, message };

    // 1. Socket.IO
    if (this.io) {
      this.io.to(`event:${numEventId}`).emit('community:message', payload);
    }

    // 2. STOMP
    if (this.stompBroadcaster) {
      this.stompBroadcaster(`/topic/events/${numEventId}/community`, payload);
    }

    logger.debug({ eventId: numEventId, action, messageId: message?.id }, '[RealtimeBroker] Broadcast community message');
  }

  /**
   * Broadcast a direct message to participants.
   * Delivered to:
   * 1. Socket.IO rooms `user:${senderId}` and `user:${receiverId}` with event `chat:message`
   * 2. STOMP subscribers on `/queue/users/${senderId}/chat` and `/queue/users/${receiverId}/chat`
   *
   * @param {'created'|'updated'|'deleted'} action
   * @param {object} message
   */
  broadcastDirectMessage(action, message) {
    const senderId = Number(message.senderId);
    const receiverId = Number(message.receiverId);
    const payload = { action, message };

    // 1. Socket.IO
    if (this.io) {
      this.io.to(`user:${senderId}`).emit('chat:message', payload);
      if (receiverId !== senderId) {
        this.io.to(`user:${receiverId}`).emit('chat:message', payload);
      }
    }

    // 2. STOMP
    if (this.stompBroadcaster) {
      this.stompBroadcaster(`/queue/users/${senderId}/chat`, payload);
      if (receiverId !== senderId) {
        this.stompBroadcaster(`/queue/users/${receiverId}/chat`, payload);
      }
    }

    logger.debug({ senderId, receiverId, action, messageId: message?.id }, '[RealtimeBroker] Broadcast direct message');
  }

  /**
   * Broadcast direct message deleted for a specific user only.
   * @param {number} userId
   * @param {object} message
   */
  broadcastDirectMessageDeletedForMe(userId, message) {
    const numUserId = Number(userId);
    const payload = { action: 'deletedForMe', message };

    if (this.io) {
      this.io.to(`user:${numUserId}`).emit('chat:message', payload);
    }
    if (this.stompBroadcaster) {
      this.stompBroadcaster(`/queue/users/${numUserId}/chat`, payload);
    }
  }

  /**
   * Broadcast external scanner ticket relay.
   * Delivered to:
   * 1. Socket.IO room `scanner:${eventId}:${sessionId}` with event `scanner:scan`
   * 2. STOMP subscribers on `/topic/scanner-relay/${eventId}/${sessionId}`
   *
   * @param {number|string} eventId
   * @param {string} sessionId
   * @param {{ ticketId: string, device?: string, eventId: number }} scanData
   */
  broadcastScannerRelay(eventId, sessionId, scanData) {
    const numEventId = Number(eventId);
    const payload = {
      ticketId: scanData.ticketId,
      device: scanData.device || 'External Scanner',
      eventId: numEventId,
      timestamp: Date.now(),
    };

    // 1. Socket.IO
    if (this.io) {
      this.io.to(`scanner:${numEventId}:${sessionId}`).emit('scanner:scan', payload);
    }

    // 2. STOMP
    if (this.stompBroadcaster) {
      this.stompBroadcaster(`/topic/scanner-relay/${numEventId}/${sessionId}`, payload);
    }

    logger.info({ eventId: numEventId, sessionId, ticketId: scanData.ticketId }, '[RealtimeBroker] Relayed scanner ticket scan');
  }

  /**
   * Broadcast notification to a user.
   * Delivered to:
   * 1. Socket.IO room `user:${recipientId}` with event `notification:push`
   * 2. STOMP subscribers on `/queue/users/${recipientId}/notifications`
   * 3. SSE stream via notificationService
   *
   * @param {number} recipientId
   * @param {string} recipientType ('USER' | 'ORGANIZER')
   * @param {object} notification
   */
  broadcastNotification(recipientId, recipientType, notification) {
    const numId = Number(recipientId);
    const type = (recipientType || 'USER').toUpperCase();

    // 1. Socket.IO
    if (this.io) {
      this.io.to(`user:${numId}`).emit('notification:push', notification);
    }

    // 2. STOMP
    if (this.stompBroadcaster) {
      this.stompBroadcaster(`/queue/users/${numId}/notifications`, notification);
    }

    // 3. SSE
    if (this.sseBroadcaster) {
      this.sseBroadcaster(numId, type, notification);
    }
  }
}

export const realtimeBroker = new RealtimeBroker();
export default realtimeBroker;
