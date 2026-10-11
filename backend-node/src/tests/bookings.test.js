import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Event, Organizer, User, Booking, Payment, Counter } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_bookings_test';

describe('Booking Management Integration Tests', () => {
  let userToken;
  let otherUserToken;
  let testUser;
  let otherUser;
  let testEvent;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    await Event.init();
    await Organizer.init();
    await User.init();
    await Booking.init();
    await Payment.init();
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
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await Counter.deleteMany({});

    // Seed test users
    testUser = new User({
      name: 'Alice Student',
      email: 'alice@college.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      organizationName: 'Anna University',
    });
    await testUser.save();
    userToken = generateToken({
      email: testUser.email,
      role: 'USER',
      id: testUser.id,
    });

    otherUser = new User({
      name: 'Bob Student',
      email: 'bob@college.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      organizationName: 'PSG Tech',
    });
    await otherUser.save();
    otherUserToken = generateToken({
      email: otherUser.email,
      role: 'USER',
      id: otherUser.id,
    });

    // Seed test event with 5 seats
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);

    testEvent = new Event({
      organizerId: 1,
      eventName: 'Exclusive AI Bootcamp',
      category: 'WORKSHOP',
      eventType: 'INTER_COLLEGE',
      eventDate: tomorrow,
      eventTime: '09:00',
      ticketPrice: 200,
      totalSeats: 5,
      availableSeats: 5,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    });
    await testEvent.save();
  });

  describe('A. Ticket Reservation & Validation Rules', () => {
    it('POST /api/bookings should reserve seats, create PENDING booking, and decrement capacity', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 2,
          participants: [
            { name: 'Alice Student', email: 'alice@college.edu', department: 'CSE' },
            { name: 'Charlie Peer', email: 'charlie@college.edu', department: 'ECE' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeGreaterThan(0);
      expect(res.body.data.ticketId).toMatch(/^EVT-\d{8}-[A-Z0-9]{8}$/);
      expect(res.body.data.quantity).toBe(2);
      expect(res.body.data.totalAmount).toBe(400); // 2 * 200 calculated by server
      expect(res.body.data.bookingStatus).toBe('PENDING');
      expect(res.body.data.ticketStatus).toBe('ACTIVE');
      expect(res.body.data.participants).toHaveLength(2);

      // Verify event capacity decremented from 5 to 3
      const updatedEvent = await Event.findOne({ id: testEvent.id });
      expect(updatedEvent.availableSeats).toBe(3);

      // Verify pending payment created
      const payment = await Payment.findOne({ bookingId: res.body.data.id });
      expect(payment).not.toBeNull();
      expect(payment.amount).toBe(400);
      expect(payment.paymentStatus).toBe('PENDING');
    });

    it('POST /api/bookings should normalize participant details using user profile when omitted', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.participants).toHaveLength(1);
      expect(res.body.data.participants[0].name).toBe('Alice Student');
      expect(res.body.data.participants[0].email).toBe('alice@college.edu');
    });

    it('POST /api/bookings should reject duplicate participant emails in same booking with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 2,
          participants: [
            { name: 'Participant 1', email: 'same@college.edu' },
            { name: 'Participant 2', email: 'same@college.edu' },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Duplicate participant email');
    });

    it('POST /api/bookings should reject user who already has an active booking for the event', async () => {
      // First booking succeeds
      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });

      // Second booking attempt by same user
      const duplicateRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.message).toBe('You already have an active booking for this event');
    });
  });

  describe('B. Capacity Limits & Concurrency Safety', () => {
    it('POST /api/bookings should reject requests exceeding available seats with Tickets Sold Out', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 6, // Event only has 5 seats
          participants: Array(6).fill(null).map((_, i) => ({
            name: `User ${i}`,
            email: `user${i}@college.edu`,
          })),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Tickets Sold Out');

      // Verify seats remain 5
      const dbEvent = await Event.findOne({ id: testEvent.id });
      expect(dbEvent.availableSeats).toBe(5);
    });

    it('should handle concurrent booking attempts without overselling seats', async () => {
      // Event has 5 seats. We create 3 users attempting to book 2, 2, and 2 seats concurrently (total 6 requested).
      const userTokens = [userToken, otherUserToken];
      const user3 = new User({
        name: 'Carol Student',
        email: 'carol@college.edu',
        passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      });
      await user3.save();
      const user3Token = generateToken({ email: user3.email, role: 'USER', id: user3.id });
      userTokens.push(user3Token);

      const bookingPromises = userTokens.map((token, idx) =>
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({
            eventId: testEvent.id,
            quantity: 2,
            participants: [
              { name: `P1_${idx}`, email: `p1_${idx}@college.edu` },
              { name: `P2_${idx}`, email: `p2_${idx}@college.edu` },
            ],
          })
      );

      const results = await Promise.all(bookingPromises);
      const successful = results.filter((r) => r.status === 201);
      const rejected = results.filter((r) => r.status === 400);

      // Exactly 2 requests of 2 tickets should succeed (4 seats taken), and 1 request must fail (only 1 seat remaining)
      expect(successful).toHaveLength(2);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].body.message).toBe('Tickets Sold Out');

      // Verify remaining seats is exactly 1 (5 - 4 = 1), never negative!
      const dbEvent = await Event.findOne({ id: testEvent.id });
      expect(dbEvent.availableSeats).toBe(1);
    });
  });

  describe('C. Retrieval & Ownership Checks', () => {
    let bookingId;
    let ticketId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });
      bookingId = res.body.data.id;
      ticketId = res.body.data.ticketId;
    });

    it('GET /api/bookings should return paginated booking history for the current user', async () => {
      const res = await request(app)
        .get('/api/bookings?page=0&size=10')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toHaveLength(1);
      expect(res.body.data.content[0].id).toBe(bookingId);
      expect(res.body.data.content[0].event.eventName).toBe('Exclusive AI Bootcamp');
    });

    it('GET /api/bookings/:id should enforce user ownership (other user gets 404)', async () => {
      const ownerRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(ownerRes.status).toBe(200);

      const otherRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(otherRes.status).toBe(404);
    });

    it('GET /api/bookings/ticket/:ticketId should return booking by ticketId for owner', async () => {
      const res = await request(app)
        .get(`/api/bookings/ticket/${ticketId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.ticketId).toBe(ticketId);
    });
  });

  describe('D. Booking Cancellation & Capacity Restoral', () => {
    it('PATCH /api/bookings/:id/cancel should cancel booking and restore available seats', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 2,
          participants: [
            { name: 'Alice', email: 'alice@college.edu' },
            { name: 'Friend', email: 'friend@college.edu' },
          ],
        });

      const bookingId = createRes.body.data.id;
      const eventAfterBooking = await Event.findOne({ id: testEvent.id });
      expect(eventAfterBooking.availableSeats).toBe(3);

      // Cancel booking
      const cancelRes = await request(app)
        .patch(`/api/bookings/${bookingId}/cancel?reason=Schedule%20Conflict`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.bookingStatus).toBe('CANCELLED');
      expect(cancelRes.body.data.ticketStatus).toBe('CANCELLED');
      expect(cancelRes.body.data.cancellationReason).toBe('Schedule Conflict');

      // Verify seats restored from 3 back to 5
      const eventAfterCancel = await Event.findOne({ id: testEvent.id });
      expect(eventAfterCancel.availableSeats).toBe(5);

      // Cannot cancel an already cancelled booking
      const reCancelRes = await request(app)
        .patch(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(reCancelRes.status).toBe(400);
      expect(reCancelRes.body.message).toBe('Booking is already cancelled');
    });

    it('PATCH /api/bookings/:id/cancel should reject unauthorized users with 403', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });

      const bookingId = createRes.body.data.id;

      const cancelRes = await request(app)
        .patch(`/api/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(cancelRes.status).toBe(403);
    });
  });
});
