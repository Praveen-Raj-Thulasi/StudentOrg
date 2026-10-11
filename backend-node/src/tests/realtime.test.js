import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { io as ClientIO } from 'socket.io-client';
import { WebSocket } from 'ws';
import request from 'supertest';
import mongoose from 'mongoose';

import { app } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { initSocketIO, initStompServer, buildStompFrame, parseStompFrames, realtimeBroker } from '../sockets/index.js';
import { generateAccessToken } from '../utils/jwt.js';
import { User, Organizer, Event, Booking, Attendance, EventCommunityMessage, DirectMessage, Notification } from '../models/index.js';

let server;
let port;
let baseUrl;
let wsUrl;

// Test fixtures
let studentUser;
let unbookedUser;
let organizerUser;
let testEvent;
let confirmedBooking;

let studentToken;
let unbookedToken;
let organizerToken;

beforeAll(async () => {
  await connectDB();

  // Create clean HTTP server instance with real-time sockets
  server = http.createServer(app);
  const io = initSocketIO(server);
  const wss = initStompServer();

  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url ? req.url.split('?')[0] : '';
    if (pathname.startsWith('/api/ws-native') || pathname.startsWith('/ws-native')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      wsUrl = `ws://localhost:${port}/api/ws-native`;
      resolve();
    });
  });

  // Seed test users & organizer
  await Booking.deleteMany({ $or: [{ id: 771 }, { ticketId: 'TKT-RT-001' }] });
  await Attendance.deleteMany({ ticketId: 'TKT-RT-001' });
  await Event.deleteMany({ $or: [{ id: 881 }, { eventName: 'Realtime Hackathon 2026' }] });
  await User.deleteMany({ $or: [{ id: { $in: [991, 992] } }, { email: { $in: ['realtime_student@example.com', 'realtime_unbooked@example.com'] } }] });
  await Organizer.deleteMany({ $or: [{ id: 993 }, { email: 'realtime_organizer@example.com' }] });
  await EventCommunityMessage.deleteMany({ eventId: 881 });
  await DirectMessage.deleteMany({ $or: [{ senderId: 991 }, { receiverId: 991 }] });
  await Notification.deleteMany({ recipientId: 991 });

  studentUser = await User.create({
    id: 991,
    name: 'Realtime Student',
    email: 'realtime_student@example.com',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
    role: 'USER',
    college: 'MIT',
    department: 'CS',
    yearOfStudy: '3rd Year',
  });

  unbookedUser = await User.create({
    id: 992,
    name: 'Unbooked User',
    email: 'realtime_unbooked@example.com',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
    role: 'USER',
    college: 'Stanford',
    department: 'ECE',
    yearOfStudy: '2nd Year',
  });

  organizerUser = await Organizer.create({
    id: 993,
    organizerName: 'Realtime Organizer',
    organizationName: 'Realtime Org Inc',
    email: 'realtime_organizer@example.com',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
    role: 'ORGANIZER',
    contactNumber: '9876543210',
    approvalStatus: 'APPROVED',
  });

  testEvent = await Event.create({
    id: 881,
    eventName: 'Realtime Hackathon 2026',
    description: 'Real-time collaborative hackathon',
    category: 'TECHNICAL',
    eventType: 'FREE',
    status: 'UPCOMING',
    eventDate: new Date(Date.now() + 7 * 86400000),
    eventTime: '10:00:00',
    totalSeats: 100,
    availableSeats: 99,
    ticketPrice: 0,
    organizerId: organizerUser.id,
    organizer: organizerUser._id,
  });

  confirmedBooking = await Booking.create({
    id: 771,
    ticketId: 'TKT-RT-001',
    eventId: testEvent.id,
    event: testEvent._id,
    userId: studentUser.id,
    user: studentUser._id,
    bookingStatus: 'CONFIRMED',
    ticketStatus: 'ACTIVE',
    attendanceStatus: 'ABSENT',
    quantity: 1,
    ticketQuantity: 1,
    totalAmount: 0,
  });

  studentToken = generateAccessToken({ id: studentUser.id, sub: studentUser.email, role: studentUser.role });
  unbookedToken = generateAccessToken({ id: unbookedUser.id, sub: unbookedUser.email, role: unbookedUser.role });
  organizerToken = generateAccessToken({ id: organizerUser.id, sub: organizerUser.email, role: organizerUser.role });
});

afterAll(async () => {
  try {
    const { getWSS, getIO } = await import('../sockets/index.js');
    try {
      const io = getIO();
      io.close();
    } catch {}
    try {
      const wss = getWSS();
      if (wss && wss.clients) {
        for (const client of wss.clients) {
          try { client.terminate(); } catch {}
        }
        wss.close();
      }
    } catch {}
  } catch {}

  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

describe('Real-Time Subsystem: Socket.IO & STOMP Dual-Stack', () => {
  // ── 1. SOCKET.IO AUTHENTICATION & ROOM MEMBERSHIP ─────────────────────────
  describe('1. Socket.IO Connection & Authentication', () => {
    it('should reject unauthenticated socket connection missing JWT token', async () => {
      let connectionError = null;
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
      });

      await new Promise((resolve) => {
        socket.on('connect_error', (err) => {
          connectionError = err;
          socket.close();
          resolve();
        });
        socket.on('connect', () => {
          socket.close();
          resolve();
        });
      });

      expect(connectionError).not.toBeNull();
      expect(connectionError.message).toMatch(/Authentication error/i);
    });

    it('should reject connection with invalid token', async () => {
      let connectionError = null;
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: 'invalid.jwt.token' },
        transports: ['websocket'],
        reconnection: false,
      });

      await new Promise((resolve) => {
        socket.on('connect_error', (err) => {
          connectionError = err;
          socket.close();
          resolve();
        });
      });

      expect(connectionError).not.toBeNull();
      expect(connectionError.message).toMatch(/Authentication error/i);
    });

    it('should successfully authenticate with valid JWT token', async () => {
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: studentToken },
        transports: ['websocket'],
      });

      await new Promise((resolve) => {
        socket.on('connect', () => resolve());
      });

      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  // ── 2. EVENT-ROOM AUTHORIZATION ───────────────────────────────────────────
  describe('2. Event-Room Membership & Authorization', () => {
    it('should deny room access to users without confirmed booking', async () => {
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: unbookedToken },
        transports: ['websocket'],
      });

      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('community:join', { eventId: testEvent.id }, resolve);
      });

      expect(ack.success).toBe(false);
      expect(ack.error).toMatch(/Unauthorized/i);
      socket.disconnect();
    });

    it('should grant room access to confirmed event attendee', async () => {
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: studentToken },
        transports: ['websocket'],
      });

      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('community:join', { eventId: testEvent.id }, resolve);
      });

      expect(ack.success).toBe(true);
      expect(ack.eventId).toBe(testEvent.id);
      socket.disconnect();
    });

    it('should grant room access to event organizer', async () => {
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: organizerToken },
        transports: ['websocket'],
      });

      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('community:join', { eventId: testEvent.id }, resolve);
      });

      expect(ack.success).toBe(true);
      socket.disconnect();
    });
  });

  // ── 3. CHAT PERSISTENCE & BIDIRECTIONAL DELIVERY ──────────────────────────
  describe('3. Chat Message Persistence, Retrieval and Real-Time Delivery', () => {
    it('should persist message to MongoDB and deliver to authorized room members', async () => {
      const studentSocket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: studentToken },
        transports: ['websocket'],
      });
      const organizerSocket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: organizerToken },
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise((resolve) => studentSocket.on('connect', resolve)),
        new Promise((resolve) => organizerSocket.on('connect', resolve)),
      ]);

      await Promise.all([
        new Promise((resolve) => studentSocket.emit('community:join', { eventId: testEvent.id }, resolve)),
        new Promise((resolve) => organizerSocket.emit('community:join', { eventId: testEvent.id }, resolve)),
      ]);

      let receivedByOrganizer = null;
      organizerSocket.on('community:message', (data) => {
        receivedByOrganizer = data;
      });

      // Student sends message via Socket.IO
      const ack = await new Promise((resolve) => {
        studentSocket.emit(
          'community:send',
          { eventId: testEvent.id, message: 'Excited for the hackathon!' },
          resolve
        );
      });

      expect(ack.success).toBe(true);
      expect(ack.message.content).toBe('Excited for the hackathon!');

      // Wait briefly for delivery
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedByOrganizer).not.toBeNull();
      expect(receivedByOrganizer.action).toBe('created');
      expect(receivedByOrganizer.message.content).toBe('Excited for the hackathon!');

      // Verify persistence in MongoDB
      const persisted = await EventCommunityMessage.findOne({
        eventId: testEvent.id,
        content: 'Excited for the hackathon!',
      });
      expect(persisted).not.toBeNull();
      expect(persisted.senderId).toBe(studentUser.id);

      studentSocket.disconnect();
      organizerSocket.disconnect();
    });

    it('should reject empty or oversized messages', async () => {
      const socket = ClientIO(baseUrl, {
        path: '/socket.io',
        auth: { token: studentToken },
        transports: ['websocket'],
      });
      await new Promise((resolve) => socket.on('connect', resolve));
      await new Promise((resolve) => socket.emit('community:join', { eventId: testEvent.id }, resolve));

      const emptyAck = await new Promise((resolve) => {
        socket.emit('community:send', { eventId: testEvent.id, message: '' }, resolve);
      });
      expect(emptyAck.success).toBe(false);

      const hugeMessage = 'a'.repeat(2500);
      const hugeAck = await new Promise((resolve) => {
        socket.emit('community:send', { eventId: testEvent.id, message: hugeMessage }, resolve);
      });
      expect(hugeAck.success).toBe(false);

      socket.disconnect();
    });
  });

  // ── 4. STOMP-OVER-WEBSOCKET BACKWARD COMPATIBILITY ───────────────────────
  describe('4. STOMP-over-WebSocket Protocol (/api/ws-native)', () => {
    it('should reject unauthenticated STOMP connection missing Authorization header', async () => {
      const ws = new WebSocket(wsUrl);

      const errorReceived = await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(buildStompFrame('CONNECT', { 'accept-version': '1.2' }));
        });
        ws.on('message', (data) => {
          const frames = parseStompFrames(data.toString());
          const errFrame = frames.find((f) => f.command === 'ERROR');
          if (errFrame) resolve(errFrame);
        });
        ws.on('close', () => resolve(null));
      });

      expect(errorReceived).not.toBeNull();
      expect(errorReceived.headers.message).toMatch(/Valid JWT is required/i);
    });

    it('should connect via STOMP and receive CONNECTED frame with valid JWT', async () => {
      const ws = new WebSocket(wsUrl);

      const connectedFrame = await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(
            buildStompFrame('CONNECT', {
              Authorization: `Bearer ${studentToken}`,
              'accept-version': '1.2',
            })
          );
        });
        ws.on('message', (data) => {
          const frames = parseStompFrames(data.toString());
          const conn = frames.find((f) => f.command === 'CONNECTED');
          if (conn) resolve(conn);
        });
      });

      expect(connectedFrame).not.toBeNull();
      expect(connectedFrame.command).toBe('CONNECTED');
      ws.close();
    });

    it('should reject unauthorized subscription to unbooked event topic via STOMP', async () => {
      const ws = new WebSocket(wsUrl);

      const errFrame = await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(
            buildStompFrame('CONNECT', {
              Authorization: `Bearer ${unbookedToken}`,
              'accept-version': '1.2',
            })
          );
        });
        ws.on('message', (data) => {
          const frames = parseStompFrames(data.toString());
          if (frames.some((f) => f.command === 'CONNECTED')) {
            ws.send(
              buildStompFrame('SUBSCRIBE', {
                id: 'sub-unbooked',
                destination: `/topic/events/${testEvent.id}/community`,
              })
            );
          }
          const err = frames.find((f) => f.command === 'ERROR');
          if (err) resolve(err);
        });
      });

      expect(errFrame).not.toBeNull();
      expect(errFrame.headers.message).toMatch(/Unauthorized subscription/i);
      ws.close();
    });

    it('should deliver cross-protocol messages between STOMP and Socket.IO', async () => {
      // 1. STOMP attendee client
      const ws = new WebSocket(wsUrl);
      let stompReceivedMessage = null;

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(buildStompFrame('CONNECT', { Authorization: `Bearer ${studentToken}` }));
        });
        ws.on('message', (data) => {
          const frames = parseStompFrames(data.toString());
          if (frames.some((f) => f.command === 'CONNECTED')) {
            ws.send(
              buildStompFrame('SUBSCRIBE', {
                id: 'sub-student-1',
                destination: `/topic/events/${testEvent.id}/community`,
              })
            );
            resolve();
          }
          const msgFrame = frames.find((f) => f.command === 'MESSAGE');
          if (msgFrame) {
            stompReceivedMessage = JSON.parse(msgFrame.body);
          }
        });
      });

      // 2. Organizer sends message via REST API
      const res = await request(app)
        .post(`/api/events/${testEvent.id}/community/messages`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ message: 'Welcome everyone from organizer!' });

      expect(res.status).toBe(200);

      // Wait briefly for STOMP socket to receive frame
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(stompReceivedMessage).not.toBeNull();
      expect(stompReceivedMessage.action).toBe('created');
      expect(stompReceivedMessage.message.content).toBe('Welcome everyone from organizer!');

      ws.close();
    });
  });

  // ── 5. SCANNER RELAY & TICKET VALIDATION ──────────────────────────────────
  describe('5. Scanner Relay with Authenticated Pairing & Safe Validation', () => {
    it('should reject scanner relay from unauthorized non-organizer user', async () => {
      const res = await request(app)
        .post(`/api/attendance/relay/${testEvent.id}/SESSION-XYZ`)
        .set('Authorization', `Bearer ${studentToken}`) // Student role cannot relay
        .send({ ticketId: 'TKT-RT-001', device: 'Mobile' });

      expect(res.status).toBe(403);
    });

    it('should relay ticket scan to paired organizer console without premature check-in', async () => {
      // Organizer desktop console connects and pairs with scanner session
      const organizerWs = new WebSocket(wsUrl);
      let relayedScanPayload = null;

      await new Promise((resolve) => {
        organizerWs.on('open', () => {
          organizerWs.send(buildStompFrame('CONNECT', { Authorization: `Bearer ${organizerToken}` }));
        });
        organizerWs.on('message', (data) => {
          const frames = parseStompFrames(data.toString());
          if (frames.some((f) => f.command === 'CONNECTED')) {
            organizerWs.send(
              buildStompFrame('SUBSCRIBE', {
                id: 'scanner-sess-1',
                destination: `/topic/scanner-relay/${testEvent.id}/SESS-001`,
                receipt: 'sub-scanner-ack',
              })
            );
          }
          if (frames.some((f) => f.command === 'RECEIPT' && f.headers['receipt-id'] === 'sub-scanner-ack')) {
            resolve();
          }
          const msg = frames.find((f) => f.command === 'MESSAGE');
          if (msg) {
            relayedScanPayload = JSON.parse(msg.body);
          }
        });
      });

      // Mobile device posts scanned ticket to relay endpoint with organizer token
      const relayRes = await request(app)
        .post(`/api/attendance/relay/${testEvent.id}/SESS-001`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ ticketId: 'TKT-RT-001', device: 'Naveen iPhone' });

      expect(relayRes.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(relayedScanPayload).not.toBeNull();
      expect(relayedScanPayload.ticketId).toBe('TKT-RT-001');
      expect(relayedScanPayload.device).toBe('Naveen iPhone');

      // CRITICAL CHECK: Ticket must NOT be marked as checked-in by relay alone!
      const bookingCheck = await Booking.findOne({ ticketId: 'TKT-RT-001' });
      expect(bookingCheck.attendanceStatus).toBe('ABSENT');

      // Organizer AttendanceScanner page then calls verified attendance scan endpoint
      const scanRes = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId: 'TKT-RT-001',
          scanMethod: 'QR_CAMERA',
        });

      expect(scanRes.status).toBe(200);

      const verifiedBooking = await Booking.findOne({ ticketId: 'TKT-RT-001' });
      expect(verifiedBooking.attendanceStatus).toBe('PRESENT');

      organizerWs.close();
    });
  });

  // ── 6. SSE NOTIFICATIONS & READ-STATE UPDATES ─────────────────────────────
  describe('6. Notification Delivery and Read-State Updates', () => {
    it('should push notification to SSE stream and update read status in MongoDB', async () => {
      // Create test notification
      const notif = await Notification.create({
        recipientId: studentUser.id,
        recipientType: 'USER',
        notificationType: 'EVENT_UPDATE',
        title: 'Schedule Change',
        message: 'Hackathon starts 10 minutes early.',
        read: false,
      });

      // Check unread count
      const unreadRes = await request(app)
        .get('/api/notifications/unread')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.data).toBeGreaterThanOrEqual(1);

      // Mark all read
      const markRes = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(markRes.status).toBe(200);

      // Verify MongoDB updated
      const updated = await Notification.findById(notif._id);
      expect(updated.read).toBe(true);
      expect(updated.readAt).not.toBeNull();
    });
  });
});
