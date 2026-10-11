import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Event, Organizer, User, Counter, ApprovalRequest } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_events_test';

describe('Event Management Integration Tests', () => {
  let organizerToken;
  let otherOrganizerToken;
  let adminToken;
  let userToken;
  let testOrganizer;
  let otherOrganizer;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    await Event.init();
    await Organizer.init();
    await User.init();
    await ApprovalRequest.init();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    await Organizer.deleteMany({});
    await User.deleteMany({});
    await Counter.deleteMany({});
    await ApprovalRequest.deleteMany({});

    // Seed test organizer 1
    testOrganizer = new Organizer({
      organizerName: 'Tech Club IIT',
      organizationName: 'IIT Madras',
      email: 'techclub@iitm.ac.in',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await testOrganizer.save();
    organizerToken = generateToken({
      email: testOrganizer.email,
      role: 'ORGANIZER',
      id: testOrganizer.id,
    });

    // Seed test organizer 2
    otherOrganizer = new Organizer({
      organizerName: 'Cultural Committee NIT',
      organizationName: 'NIT Trichy',
      email: 'cultural@nitt.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await otherOrganizer.save();
    otherOrganizerToken = generateToken({
      email: otherOrganizer.email,
      role: 'ORGANIZER',
      id: otherOrganizer.id,
    });

    // Seed admin & user tokens
    adminToken = generateToken({
      email: 'admin@collegeevents.com',
      role: 'ADMIN',
      id: 999,
    });

    userToken = generateToken({
      email: 'student@college.edu',
      role: 'USER',
      id: 101,
    });
  });

  describe('A. Public Event Catalog & Discovery', () => {
    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Seed 3 events: 2 upcoming public, 1 featured
      await Event.create([
        {
          organizerId: testOrganizer.id,
          organizer: testOrganizer._id,
          eventName: 'AI Hackathon 2026',
          description: 'A 24-hour national level hackathon on artificial intelligence and agentic workflows.',
          category: 'HACKATHON',
          eventType: 'INTER_COLLEGE',
          eventDate: tomorrow,
          eventTime: '09:00',
          ticketPrice: 250,
          totalSeats: 100,
          availableSeats: 100,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          isFeatured: true,
          collegeName: 'IIT Madras',
          location: 'Chennai',
        },
        {
          organizerId: testOrganizer.id,
          organizer: testOrganizer._id,
          eventName: 'Cloud Computing Workshop',
          description: 'Hands-on serverless and microservices workshop for computer science students.',
          category: 'WORKSHOP',
          eventType: 'INTRA_COLLEGE',
          eventDate: nextWeek,
          eventTime: '10:00',
          ticketPrice: 0,
          totalSeats: 50,
          availableSeats: 50,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          isFeatured: false,
          collegeName: 'IIT Madras',
          location: 'Chennai',
        },
      ]);
    });

    it('GET /api/events should return paginated list of public upcoming events', async () => {
      const res = await request(app).get('/api/events?page=0&size=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toHaveLength(2);
      expect(res.body.data.totalElements).toBe(2);
      expect(res.body.data.first).toBe(true);
    });

    it('GET /api/events should filter by keyword, category, and freeOnly', async () => {
      const resKeyword = await request(app).get('/api/events?keyword=Hackathon');
      expect(resKeyword.status).toBe(200);
      expect(resKeyword.body.data.content).toHaveLength(1);
      expect(resKeyword.body.data.content[0].eventName).toBe('AI Hackathon 2026');

      const resCategory = await request(app).get('/api/events?category=WORKSHOP');
      expect(resCategory.status).toBe(200);
      expect(resCategory.body.data.content).toHaveLength(1);
      expect(resCategory.body.data.content[0].eventName).toBe('Cloud Computing Workshop');

      const resFree = await request(app).get('/api/events?freeOnly=true');
      expect(resFree.status).toBe(200);
      expect(resFree.body.data.content).toHaveLength(1);
      expect(resFree.body.data.content[0].ticketPrice).toBe(0);
    });

    it('GET /api/events/categories should return all supported event categories', async () => {
      const res = await request(app).get('/api/events/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toContain('HACKATHON');
      expect(res.body.data).toContain('WORKSHOP');
    });

    it('GET /api/events/featured should return featured events', async () => {
      const res = await request(app).get('/api/events/featured');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].eventName).toBe('AI Hackathon 2026');
    });
  });

  describe('B. Organizer Event Creation, Updates & Ownership Controls', () => {
    it('POST /api/events should allow organizers to create events with auto-approval and sequential numeric ID', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: 'Robotics Challenge 2026',
          description: 'Autonomous line-follower and drone arena competitions.',
          category: 'TECHNICAL_SYMPOSIUM',
          eventType: 'INTER_COLLEGE',
          eventDate: futureDate.toISOString().split('T')[0],
          eventTime: '09:30',
          ticketPrice: 150,
          totalSeats: 80,
          venueName: 'Main Auditorium',
          location: 'Chennai',
          collegeName: 'IIT Madras',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeGreaterThan(0);
      expect(res.body.data.eventName).toBe('Robotics Challenge 2026');
      expect(res.body.data.availableSeats).toBe(80);
      expect(res.body.data.status).toBe('PUBLISHED');

      // Verify approval request auto-created
      const approval = await ApprovalRequest.findOne({ eventId: res.body.data.id });
      expect(approval).not.toBeNull();
      expect(approval.status).toBe('APPROVED');
    });

    it('POST /api/events should reject non-organizers with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventName: 'Unauthorized Event',
          category: 'WORKSHOP',
          eventType: 'INTRA_COLLEGE',
          eventDate: '2026-11-01',
          eventTime: '10:00',
          ticketPrice: 0,
          totalSeats: 30,
        });

      expect(res.status).toBe(403);
    });

    it('PUT /api/events/:id should enforce organizer ownership check', async () => {
      // Create event owned by testOrganizer
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const createRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: 'Original Title',
          category: 'WORKSHOP',
          eventType: 'INTRA_COLLEGE',
          eventDate: futureDate.toISOString().split('T')[0],
          eventTime: '10:00',
          ticketPrice: 50,
          totalSeats: 40,
        });

      const eventId = createRes.body.data.id;

      // Other organizer tries to modify it -> should be rejected with 403
      const unauthorizedUpdate = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          eventName: 'Hijacked Event Title',
        });

      expect(unauthorizedUpdate.status).toBe(403);

      // Owner updates description -> should succeed
      const ownerUpdate = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          description: 'Updated event description by authorized organizer',
        });

      expect(ownerUpdate.status).toBe(200);
      expect(ownerUpdate.body.data.description).toBe('Updated event description by authorized organizer');
    });

    it('PATCH /api/events/:id/cancel should transition event to CANCELLED', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const createRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: 'Event to Cancel',
          category: 'SEMINAR',
          eventType: 'INTRA_COLLEGE',
          eventDate: futureDate.toISOString().split('T')[0],
          eventTime: '14:00',
          ticketPrice: 0,
          totalSeats: 25,
        });

      const eventId = createRes.body.data.id;

      const cancelRes = await request(app)
        .patch(`/api/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      const dbEvent = await Event.findOne({ id: eventId });
      expect(dbEvent.status).toBe('CANCELLED');
    });

    it('GET /api/events/my should list events owned by the authenticated organizer', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 4);

      await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: 'Organizer Event Alpha',
          category: 'CULTURAL',
          eventType: 'INTER_COLLEGE',
          eventDate: futureDate.toISOString().split('T')[0],
          eventTime: '18:00',
          ticketPrice: 100,
          totalSeats: 50,
        });

      const res = await request(app)
        .get('/api/events/my')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toHaveLength(1);
      expect(res.body.data.content[0].eventName).toBe('Organizer Event Alpha');
    });
  });

  describe('C. Admin Event Approvals & Lifecycle Management', () => {
    it('POST /api/admin/events/:id/review should allow Admin to REJECT or APPROVE an event', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const createRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: 'Pending Review Event',
          category: 'SPORTS',
          eventType: 'INTER_COLLEGE',
          eventDate: futureDate.toISOString().split('T')[0],
          eventTime: '08:00',
          ticketPrice: 20,
          totalSeats: 100,
        });

      const eventId = createRes.body.data.id;

      // Admin rejects event with review reason
      const reviewRes = await request(app)
        .post(`/api/admin/events/${eventId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          decision: 'REJECT',
          reason: 'Insufficient safety protocol documentation provided.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('REJECTED');

      const approval = await ApprovalRequest.findOne({ eventId });
      expect(approval.status).toBe('REJECTED');
      expect(approval.reviewNote).toBe('Insufficient safety protocol documentation provided.');
    });

    it('POST /api/events/:id/expire should allow Admin to force expire an event', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const createRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: 'Expiring Event',
          category: 'OTHER',
          eventType: 'INTRA_COLLEGE',
          eventDate: futureDate.toISOString().split('T')[0],
          eventTime: '11:00',
          ticketPrice: 0,
          totalSeats: 20,
        });

      const eventId = createRes.body.data.id;

      const expireRes = await request(app)
        .post(`/api/events/${eventId}/expire`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(expireRes.status).toBe(200);
      expect(expireRes.body.data.status).toBe('EXPIRED');
    });
  });
});
