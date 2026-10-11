import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Notification, User } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_notification_test';

describe('Notification & SSE Stream Integration Tests', () => {
  let userTokenA;
  let userTokenB;
  let userA;
  let userB;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    await Notification.init();
    await User.init();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await User.deleteMany({});

    userA = new User({
      name: 'User Alpha',
      email: 'alpha@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
    });
    await userA.save();

    userB = new User({
      name: 'User Beta',
      email: 'beta@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
    });
    await userB.save();

    userTokenA = generateToken({
      id: userA.id,
      sub: userA.email,
      role: 'USER',
    });

    userTokenB = generateToken({
      id: userB.id,
      sub: userB.email,
      role: 'USER',
    });
  });

  describe('Notification Persistence & Retrieval', () => {
    it('should retrieve paginated notifications isolated by recipient ownership', async () => {
      // Seed notifications for User A
      await Notification.create([
        {
          recipientId: userA.id,
          recipientType: 'USER',
          notificationType: 'BOOKING_CONFIRMED',
          title: 'Booking Confirmed',
          message: 'Your ticket is confirmed',
          read: false,
          createdAt: new Date(Date.now() - 10000),
        },
        {
          recipientId: userA.id,
          recipientType: 'USER',
          notificationType: 'PAYMENT_SUCCESSFUL',
          title: 'Payment Successful',
          message: 'Received ₹250',
          read: true,
          createdAt: new Date(),
        },
      ]);

      // Seed notification for User B
      await Notification.create({
        recipientId: userB.id,
        recipientType: 'USER',
        notificationType: 'EVENT_REMINDER',
        title: 'Event Starts Tomorrow',
        message: 'Reminder for Beta',
        read: false,
      });

      // User A requests their notifications
      const resA = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.content.length).toBe(2);
      expect(resA.body.data.content[0].recipientId).toBe(userA.id);

      // Verify User B only sees their 1 notification
      const resB = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${userTokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.content.length).toBe(1);
      expect(resB.body.data.content[0].title).toBe('Event Starts Tomorrow');
    });

    it('should report accurate unread count and mark all notifications read', async () => {
      await Notification.create([
        {
          recipientId: userA.id,
          recipientType: 'USER',
          notificationType: 'N1',
          title: 'Notice 1',
          message: 'Msg 1',
          read: false,
        },
        {
          recipientId: userA.id,
          recipientType: 'USER',
          notificationType: 'N2',
          title: 'Notice 2',
          message: 'Msg 2',
          read: false,
        },
        {
          recipientId: userA.id,
          recipientType: 'USER',
          notificationType: 'N3',
          title: 'Notice 3',
          message: 'Msg 3',
          read: true,
        },
      ]);

      // 1. Check unread count
      const unreadRes = await request(app)
        .get('/api/notifications/unread')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.data).toBe(2);

      // 2. Mark all as read
      const markRes = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(markRes.status).toBe(200);

      // 3. Unread count should now be 0
      const unreadAfter = await request(app)
        .get('/api/notifications/unread')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(unreadAfter.status).toBe(200);
      expect(unreadAfter.body.data).toBe(0);
    });
  });

  describe('Server-Sent Events (SSE) Stream', () => {
    it('should connect to SSE stream with token query parameter and receive connected event', async () => {
      const server = app.listen(0);
      const port = server.address().port;

      const data = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          server.close();
          reject(new Error('SSE stream connection timeout'));
        }, 3000);

        const clientReq = http.get(
          `http://127.0.0.1:${port}/api/notifications/stream?token=${encodeURIComponent(userTokenA)}`,
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            res.on('data', (chunk) => {
              const text = chunk.toString();
              if (text.includes('event: connected')) {
                clearTimeout(timer);
                clientReq.destroy();
                server.close();
                resolve(text);
              }
            });
          }
        );

        clientReq.on('error', (err) => {
          if (err.code !== 'ECONNRESET') reject(err);
        });
      });

      expect(data).toContain('event: connected\ndata: ok');
    });

    it('should reject unauthenticated SSE stream connection', async () => {
      const res = await request(app)
        .get('/api/notifications/stream')
        .set('Accept', 'text/event-stream');

      expect(res.status).toBe(401);
    });
  });
});
