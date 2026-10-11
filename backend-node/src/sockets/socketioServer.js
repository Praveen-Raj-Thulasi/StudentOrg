import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { communityChatService } from '../services/communityChat.service.js';
import { directMessageService } from '../services/directMessage.service.js';
import { realtimeBroker } from './realtimeBroker.js';
import { Notification } from '../models/Notification.js';

let io = null;

// Per-socket rate limiter tracker: socketId -> Array of timestamps
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 2000;
const RATE_LIMIT_MAX_MESSAGES = 10;

function checkRateLimit(socketId) {
  const now = Date.now();
  let timestamps = rateLimitMap.get(socketId) || [];
  timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
    rateLimitMap.set(socketId, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(socketId, timestamps);
  return true;
}

/**
 * Extracts and verifies JWT from handshake.
 */
function extractToken(handshake) {
  if (handshake.auth && handshake.auth.token) {
    return handshake.auth.token;
  }
  const authHeader = handshake.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (handshake.query && handshake.query.token) {
    return String(handshake.query.token).trim();
  }
  return null;
}

/**
 * Initializes the Socket.IO server on top of the Node HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [env.CORS_ORIGIN, env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  // Attach to mediator
  realtimeBroker.setIO(io);

  // Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket.handshake);
      if (!token) {
        return next(new Error('Authentication error: Valid JWT token required'));
      }

      const payload = verifyToken(token);
      socket.user = {
        id: payload.id,
        email: payload.sub,
        role: payload.role,
      };

      logger.debug({ userId: socket.user.id, role: socket.user.role }, '[Socket.IO] Client authenticated');
      next();
    } catch (err) {
      logger.warn({ err: err.message }, '[Socket.IO] Authentication handshake rejected');
      next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info({ socketId: socket.id, userId: user?.id, role: user?.role }, 'Socket.IO client connected');

    // Automatically join personal user room for direct messages and notifications
    if (user?.id) {
      socket.join(`user:${user.id}`);
    }

    // ── Community Rooms ──────────────────────────────────────────────────────
    socket.on('community:join', async (data, callback) => {
      try {
        const eventId = Number(data?.eventId);
        if (!eventId) {
          const err = 'Invalid eventId';
          if (typeof callback === 'function') callback({ success: false, error: err });
          return;
        }

        const canAccess = await communityChatService.canView(eventId, user);
        if (!canAccess) {
          const err = 'Unauthorized: Confirmed booking or organizer status required to join community';
          socket.emit('error', { message: err });
          if (typeof callback === 'function') callback({ success: false, error: err });
          return;
        }

        socket.join(`event:${eventId}`);
        logger.debug({ socketId: socket.id, eventId, userId: user.id }, '[Socket.IO] Joined community room');
        if (typeof callback === 'function') callback({ success: true, eventId });
      } catch (err) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    socket.on('community:leave', (data, callback) => {
      const eventId = Number(data?.eventId);
      if (eventId) {
        socket.leave(`event:${eventId}`);
      }
      if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('community:send', async (data, callback) => {
      if (!checkRateLimit(socket.id)) {
        const msg = 'Rate limit exceeded: Too many messages sent';
        socket.emit('error', { message: msg });
        if (typeof callback === 'function') callback({ success: false, error: msg });
        return;
      }

      try {
        const { eventId, message, messageType, attachmentUrl, announcement, pin } = data || {};
        const saved = await communityChatService.send(
          eventId,
          user,
          message,
          messageType,
          attachmentUrl,
          announcement,
          pin
        );
        if (typeof callback === 'function') callback({ success: true, message: saved });
      } catch (err) {
        socket.emit('error', { message: err.message });
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // ── Scanner Relay Pairing ────────────────────────────────────────────────
    socket.on('scanner:join', async (data, callback) => {
      try {
        const eventId = Number(data?.eventId);
        const sessionId = String(data?.sessionId || '').trim();
        if (!eventId || !sessionId) {
          const err = 'eventId and sessionId are required';
          if (typeof callback === 'function') callback({ success: false, error: err });
          return;
        }

        const event = await communityChatService.loadEvent(eventId);
        if (!communityChatService.isModerator(event, user)) {
          const err = 'Unauthorized: Only event organizer or admin can listen to scanner session';
          socket.emit('error', { message: err });
          if (typeof callback === 'function') callback({ success: false, error: err });
          return;
        }

        socket.join(`scanner:${eventId}:${sessionId}`);
        logger.info({ eventId, sessionId, userId: user.id }, '[Socket.IO] Scanner session paired');
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    socket.on('scanner:relay', async (data, callback) => {
      try {
        const { eventId, sessionId, ticketId, device } = data || {};
        const numEventId = Number(eventId);
        if (!numEventId || !sessionId || !ticketId) {
          const err = 'eventId, sessionId, and ticketId are required';
          if (typeof callback === 'function') callback({ success: false, error: err });
          return;
        }

        const event = await communityChatService.loadEvent(numEventId);
        if (!communityChatService.isModerator(event, user)) {
          const err = 'Unauthorized: Only event organizer or admin can relay scans';
          socket.emit('error', { message: err });
          if (typeof callback === 'function') callback({ success: false, error: err });
          return;
        }

        realtimeBroker.broadcastScannerRelay(numEventId, sessionId, {
          ticketId: String(ticketId).trim(),
          device: device || 'Mobile Scanner',
          eventId: numEventId,
        });

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // ── Direct Chat ──────────────────────────────────────────────────────────
    socket.on('chat:send', async (data, callback) => {
      if (!checkRateLimit(socket.id)) {
        const msg = 'Rate limit exceeded: Too many messages sent';
        socket.emit('error', { message: msg });
        if (typeof callback === 'function') callback({ success: false, error: msg });
        return;
      }

      try {
        const { receiverId, content, messageType, voiceUrl, voiceDurationSeconds, attachmentUrl } = data || {};
        const saved = await directMessageService.send(
          user.id,
          receiverId,
          content,
          messageType,
          voiceUrl,
          voiceDurationSeconds,
          attachmentUrl
        );
        if (typeof callback === 'function') callback({ success: true, message: saved });
      } catch (err) {
        socket.emit('error', { message: err.message });
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // ── Notification Read State ──────────────────────────────────────────────
    socket.on('notification:read', async (data, callback) => {
      try {
        const { notificationId } = data || {};
        if (notificationId) {
          await Notification.updateOne(
            { _id: notificationId, recipientId: user.id },
            { $set: { read: true, readAt: new Date() } }
          );
        }
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // ── Disconnect & Cleanup ─────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      rateLimitMap.delete(socket.id);
      logger.info({ socketId: socket.id, userId: user?.id, reason }, 'Socket.IO client disconnected');
    });

    socket.on('error', (err) => {
      logger.error({ socketId: socket.id, err }, 'Socket.IO socket error');
    });
  });

  logger.info('Socket.IO real-time engine initialized successfully');
  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet. Call initSocketIO first.');
  }
  return io;
}

export default { initSocketIO, getIO };
