import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { communityChatService } from '../services/communityChat.service.js';
import { realtimeBroker } from './realtimeBroker.js';

let wss = null;
const activeSockets = new Set();
let messageSequence = 0;

/**
 * Builds a STOMP frame string.
 * @param {string} command
 * @param {Record<string, string>} headers
 * @param {string} body
 * @returns {string}
 */
export function buildStompFrame(command, headers = {}, body = '') {
  const headerLines = Object.entries(headers)
    .map(([key, val]) => `${key}:${val}`)
    .join('\n');
  return `${command}\n${headerLines}\n\n${body}\0`;
}

/**
 * Parses STOMP frames from raw text.
 * @param {string} raw
 * @returns {Array<{ command: string, headers: Record<string, string>, body: string }>}
 */
export function parseStompFrames(raw) {
  if (!raw) return [];
  // STOMP heartbeats can be empty lines
  const parts = String(raw).split('\0');
  const frames = [];

  for (const part of parts) {
    const trimmed = part.replace(/^[\r\n]+/, '');
    if (!trimmed) continue;

    const splitIdx = trimmed.indexOf('\n\n');
    let head = trimmed;
    let body = '';

    if (splitIdx !== -1) {
      head = trimmed.slice(0, splitIdx);
      body = trimmed.slice(splitIdx + 2);
    }

    const lines = head.split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;

    const command = lines[0].trim().toUpperCase();
    const headers = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        headers[key] = val;
      }
    }

    frames.push({ command, headers, body });
  }

  return frames;
}

/**
 * Broadcasts a STOMP MESSAGE frame to all sockets subscribed to a specific destination.
 * @param {string} destination
 * @param {object} payload
 */
export function broadcastStompMessage(destination, payload) {
  const jsonBody = JSON.stringify(payload);
  const normalizedDest = destination.trim();

  for (const socket of activeSockets) {
    if (socket.readyState !== WebSocket.OPEN || !socket.subscriptions) continue;

    for (const [subId, subDest] of socket.subscriptions.entries()) {
      if (subDest === normalizedDest) {
        messageSequence += 1;
        const frame = buildStompFrame(
          'MESSAGE',
          {
            subscription: subId,
            'message-id': `msg-${messageSequence}`,
            destination: normalizedDest,
            'content-type': 'application/json',
          },
          jsonBody
        );
        try {
          socket.send(frame);
        } catch (err) {
          logger.warn({ err }, '[STOMP] Failed to send message to client');
        }
      }
    }
  }
}

/**
 * Initializes the STOMP-over-WebSocket adapter.
 * Uses noServer mode so the HTTP server can route /api/ws-native requests explicitly.
 * @returns {WebSocketServer}
 */
export function initStompServer() {
  wss = new WebSocketServer({ noServer: true });

  // Connect STOMP broadcaster to the unified realtimeBroker
  realtimeBroker.setStompBroadcaster(broadcastStompMessage);

  wss.on('connection', (socket, request) => {
    socket.isAuthenticated = false;
    socket.user = null;
    socket.subscriptions = new Map(); // subId -> destination
    socket.lastHeartbeat = Date.now();

    activeSockets.add(socket);
    logger.debug('[STOMP] Client connected on WebSocket transport');

    // Heartbeat ping interval
    const heartbeatTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send('\n'); // STOMP heartbeat ping
        } catch {}
      }
    }, 10000);

    socket.on('message', async (data) => {
      const text = data.toString();
      // Ignore bare heartbeat pings
      if (text === '\n' || text === '\r\n') {
        socket.lastHeartbeat = Date.now();
        return;
      }

      const frames = parseStompFrames(text);
      for (const frame of frames) {
        await handleFrame(socket, frame);
      }
    });

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      activeSockets.delete(socket);
      socket.subscriptions?.clear();
      logger.debug({ userId: socket.user?.id }, '[STOMP] Client disconnected and cleaned up');
    };

    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  logger.info('STOMP-over-WebSocket adapter initialized successfully');
  return wss;
}

/**
 * Dispatches and processes an incoming STOMP frame.
 */
async function handleFrame(socket, frame) {
  const { command, headers, body } = frame;

  switch (command) {
    case 'CONNECT':
    case 'STOMP': {
      let token = null;
      const authHeader = headers['Authorization'] || headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (headers['token']) {
        token = headers['token'].trim();
      }

      if (!token) {
        socket.send(
          buildStompFrame('ERROR', { message: 'Valid JWT is required for WebSocket connections' }, 'Missing Authorization header')
        );
        socket.close(1008, 'Authentication required');
        return;
      }

      try {
        const payload = verifyToken(token);
        socket.isAuthenticated = true;
        socket.user = {
          id: payload.id,
          email: payload.sub,
          role: payload.role,
        };

        socket.send(
          buildStompFrame('CONNECTED', {
            version: '1.2',
            'heart-beat': '10000,10000',
          })
        );
        logger.debug({ userId: socket.user.id, role: socket.user.role }, '[STOMP] Client CONNECT authenticated');
      } catch (err) {
        socket.send(
          buildStompFrame('ERROR', { message: 'Valid JWT is required for WebSocket connections' }, 'Invalid or expired token')
        );
        socket.close(1008, 'Token invalid');
      }
      break;
    }

    case 'SUBSCRIBE': {
      if (!socket.isAuthenticated || !socket.user) {
        socket.send(buildStompFrame('ERROR', { message: 'Unauthorized: Session not authenticated' }));
        return;
      }

      const subId = headers['id'];
      const destination = headers['destination'];
      if (!subId || !destination) {
        socket.send(buildStompFrame('ERROR', { message: 'Missing sub id or destination' }));
        return;
      }

      // Check destination permissions
      const isAuthorized = await authorizeSubscription(socket.user, destination);
      if (!isAuthorized) {
        socket.send(
          buildStompFrame('ERROR', {
            'subscription-id': subId,
            message: `Unauthorized subscription to destination: ${destination}`,
          })
        );
        return;
      }

      socket.subscriptions.set(subId, destination);
      if (headers['receipt']) {
        socket.send(buildStompFrame('RECEIPT', { 'receipt-id': headers['receipt'] }));
      }
      logger.debug({ subId, destination, userId: socket.user.id }, '[STOMP] Registered subscription');
      break;
    }

    case 'UNSUBSCRIBE': {
      const subId = headers['id'];
      if (subId) {
        socket.subscriptions.delete(subId);
      }
      break;
    }

    case 'SEND': {
      if (!socket.isAuthenticated || !socket.user) {
        socket.send(buildStompFrame('ERROR', { message: 'Unauthorized: Session not authenticated' }));
        return;
      }

      const destination = headers['destination'];
      if (!destination) return;

      // Handle community chat SEND destination: /app/events/:id/community or /topic/events/:id/community
      const communityMatch = destination.match(/(?:\/app|\/topic)\/events\/(\d+)\/community/);
      if (communityMatch) {
        const eventId = Number(communityMatch[1]);
        try {
          let parsedBody = {};
          try {
            parsedBody = JSON.parse(body || '{}');
          } catch {
            parsedBody = { message: body };
          }

          const messageText = parsedBody.message || parsedBody.content;
          await communityChatService.send(
            eventId,
            socket.user,
            messageText,
            parsedBody.messageType || 'TEXT',
            parsedBody.attachmentUrl,
            parsedBody.announcement,
            parsedBody.pinned
          );
        } catch (err) {
          socket.send(buildStompFrame('ERROR', { message: err.message }));
        }
      }
      break;
    }

    case 'DISCONNECT': {
      socket.subscriptions?.clear();
      socket.send(buildStompFrame('RECEIPT', { 'receipt-id': headers['receipt'] || 'disconnect-ack' }));
      socket.close();
      break;
    }

    default:
      break;
  }
}

/**
 * Validates whether the authenticated user has permission to subscribe to a STOMP destination.
 */
async function authorizeSubscription(user, destination) {
  // 1. Community chat destination: /topic/events/:eventId/community
  const eventMatch = destination.match(/\/topic\/events\/(\d+)\/community/);
  if (eventMatch) {
    const eventId = Number(eventMatch[1]);
    return communityChatService.canView(eventId, user);
  }

  // 2. Scanner relay destination: /topic/scanner-relay/:eventId/:sessionId
  const scannerMatch = destination.match(/\/topic\/scanner-relay\/(\d+)\/([^/]+)/);
  if (scannerMatch) {
    const eventId = Number(scannerMatch[1]);
    try {
      const event = await communityChatService.loadEvent(eventId);
      return communityChatService.isModerator(event, user);
    } catch {
      return false;
    }
  }

  // 3. User direct queue: /queue/users/:userId/chat
  const chatMatch = destination.match(/\/queue\/users\/(\d+)\/chat/);
  if (chatMatch) {
    const targetUserId = Number(chatMatch[1]);
    return Number(user.id) === targetUserId;
  }

  // 4. User notifications queue: /queue/users/:userId/notifications
  const notifMatch = destination.match(/\/queue\/users\/(\d+)\/notifications/);
  if (notifMatch) {
    const targetUserId = Number(notifMatch[1]);
    return Number(user.id) === targetUserId;
  }

  // Allow general public topics if any, otherwise deny
  return false;
}

export function getWSS() {
  return wss;
}

export default { initStompServer, getWSS, broadcastStompMessage };
