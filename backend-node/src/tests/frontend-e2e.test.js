import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import Organizer from '../models/Organizer.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import { generateAccessToken } from '../utils/jwt.js';

describe('Frontend End-to-End Compatibility Suite', () => {
  let studentUser;
  let studentToken;
  let organizerUser;
  let organizerToken;
  let adminToken;
  let testEvent;

  beforeAll(async () => {
    await connectDB();

    // 1. Seed Student User
    studentUser = await User.findOneAndUpdate(
      { email: 'e2e.student@eventbooking.test' },
      {
        id: 9901,
        name: 'E2E Student',
        email: 'e2e.student@eventbooking.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'USER',
        department: 'Computer Science',
        organizationName: 'Tech University',
        emailVerified: true,
      },
      { upsert: true, new: true }
    );
    studentToken = generateAccessToken({
      id: studentUser.id,
      email: studentUser.email,
      role: 'USER',
    });

    // 2. Seed Organizer User
    organizerUser = await Organizer.findOneAndUpdate(
      { email: 'e2e.organizer@eventbooking.test' },
      {
        id: 9902,
        organizerName: 'E2E Organizer',
        organizationName: 'Tech Club',
        email: 'e2e.organizer@eventbooking.test',
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'ORGANIZER',
        emailVerified: true,
      },
      { upsert: true, new: true }
    );
    organizerToken = generateAccessToken({
      id: organizerUser.id,
      email: organizerUser.email,
      role: 'ORGANIZER',
    });

    // 3. Admin Token
    adminToken = generateAccessToken({
      id: 9999,
      email: 'admin@eventbooking.test',
      role: 'ADMIN',
    });

    // 4. Seed Test Event
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    testEvent = await Event.findOneAndUpdate(
      { id: 9903 },
      {
        id: 9903,
        organizerId: organizerUser.id,
        organizer: organizerUser._id,
        eventName: 'E2E National Hackathon 2026',
        category: 'TECHNOLOGY',
        eventType: 'OFFLINE',
        eventDate: tomorrow,
        eventTime: '10:00:00',
        venueName: 'Tech Innovation Hub',
        location: 'Bengaluru Campus',
        ticketPrice: 150,
        totalSeats: 100,
        availableSeats: 98,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
      { upsert: true, new: true }
    );
  });

  afterAll(async () => {
    await Booking.deleteMany({ userId: studentUser?.id });
    await Event.deleteOne({ id: 9903 });
    await User.deleteOne({ id: 9901 });
    await Organizer.deleteOne({ id: 9902 });
    await disconnectDB();
  });

  describe('1. Student Flows', () => {
    it('should retrieve student profile and location', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('e2e.student@eventbooking.test');
    });

    it('should query discover page recommendations', async () => {
      const res = await request(app)
        .get('/api/recommendations/discover')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('ALL_LIVE_EVENTS');
      expect(res.body.data).toHaveProperty('TRENDING');
    });

    it('should get event details and AI summary', async () => {
      const detailRes = await request(app).get(`/api/events/${testEvent.id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.eventName).toBe('E2E National Hackathon 2026');

      const summaryRes = await request(app).get(`/api/ai/events/${testEvent.id}/summary`);
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);
    });

    it('should book tickets and generate Razorpay order', async () => {
      const bookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
          participantName: 'E2E Student',
          participantEmail: 'e2e.student@eventbooking.test',
          department: 'Computer Science',
          college: 'Tech University',
        });

      expect(bookRes.status).toBe(201);
      expect(bookRes.body.success).toBe(true);
      const bookingId = bookRes.body.data.id;

      // Create Razorpay payment order
      const orderRes = await request(app)
        .post(`/api/payments/bookings/${bookingId}/razorpay/order`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(orderRes.status).toBe(200);
      expect(orderRes.body.success).toBe(true);
      expect(orderRes.body.data).toHaveProperty('orderId');
    });

    it('should fetch student gamification profile and portfolio', async () => {
      const gamRes = await request(app)
        .get('/api/gamification/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(gamRes.status).toBe(200);
      expect(gamRes.body.data).toHaveProperty('totalXp');
      expect(gamRes.body.data).toHaveProperty('currentLevel');

      const portRes = await request(app)
        .get('/api/portfolio/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(portRes.status).toBe(200);
      expect(portRes.body.data).toHaveProperty('totalRegistrations');
      expect(portRes.body.data).toHaveProperty('aiSummary');
    });

    it('should fetch networking connection suggestions', async () => {
      const netRes = await request(app)
        .get('/api/networking/suggestions')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(netRes.status).toBe(200);
      expect(Array.isArray(netRes.body.data)).toBe(true);
    });
  });

  describe('2. Organizer Flows', () => {
    it('should fetch organizer dashboard and full analytics', async () => {
      const dashRes = await request(app)
        .get('/api/organizer/dashboard')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.data).toHaveProperty('totalEvents');
      expect(dashRes.body.data).toHaveProperty('totalRevenue');

      const anaRes = await request(app)
        .get('/api/organizer/analytics')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(anaRes.status).toBe(200);
      expect(anaRes.body.data).toHaveProperty('performanceScore');
      expect(anaRes.body.data).toHaveProperty('categoryDistribution');
    });

    it('should answer natural language queries about organizer performance', async () => {
      const nlRes = await request(app)
        .get('/api/organizer/analytics/ask')
        .query({ q: 'How many registrations do I have?' })
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(nlRes.status).toBe(200);
      expect(typeof nlRes.body.data).toBe('string');
    });

    it('should generate SVG event poster for organizer', async () => {
      const posterRes = await request(app)
        .post(`/api/organizer/events/${testEvent.id}/poster`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(posterRes.status).toBe(200);
      expect(posterRes.body.data).toMatch(/^\/uploads\/posters\/poster_event_/);
    });

    it('should export attendee participants as CSV', async () => {
      const exportRes = await request(app)
        .get(`/api/organizer/events/${testEvent.id}/participants/export`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(exportRes.status).toBe(200);
      expect(exportRes.headers['content-type']).toContain('text/csv');
      expect(exportRes.text).toContain('Event,Date,Ticket ID,Participant Name');
    });
  });

  describe('3. Administrator Flows', () => {
    it('should fetch admin dashboard statistics and approvals list', async () => {
      const dashRes = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.data).toHaveProperty('totalUsers');
      expect(dashRes.body.data).toHaveProperty('totalEvents');

      const appRes = await request(app)
        .get('/api/admin/approvals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(appRes.status).toBe(200);
      expect(Array.isArray(appRes.body.data.content)).toBe(true);
    });

    it('should retrieve AI platform insights', async () => {
      const insRes = await request(app)
        .get('/api/ai/insights/platform')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(insRes.status).toBe(200);
      expect(insRes.body.success).toBe(true);
    });

    it('should manage Help Center FAQs', async () => {
      const createFaq = await request(app)
        .post('/api/help/faqs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category: 'BOOKINGS',
          question: 'How do I cancel a ticket?',
          answer: 'Go to My Bookings and click Cancel Ticket before the deadline.',
        });

      expect(createFaq.status).toBe(201);
      expect(createFaq.body.data.id).toBeDefined();

      const listFaqs = await request(app).get('/api/help/faqs');
      expect(listFaqs.status).toBe(200);
      expect(listFaqs.body.data.some((f) => f.question.includes('cancel'))).toBe(true);
    });
  });

  describe('4. Public Lookup & Status Endpoints', () => {
    it('should look up user and organizer by public code', async () => {
      const uRes = await request(app)
        .get(`/api/lookup/U${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(uRes.status).toBe(200);
      expect(uRes.body.data.type).toBe('USER');
      expect(uRes.body.data.profile.email).toBe('e2e.student@eventbooking.test');

      const oRes = await request(app)
        .get(`/api/lookup/O${organizerUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(oRes.status).toBe(200);
      expect(oRes.body.data.type).toBe('ORGANIZER');
      expect(oRes.body.data.profile.organizationName).toBe('Tech Club');
    });

    it('should return master API status', async () => {
      const res = await request(app).get('/api');
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('CollegeEvents API v2.0');
    });
  });
});
