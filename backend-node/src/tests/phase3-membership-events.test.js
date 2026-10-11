import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  User,
  Organizer,
  Event,
  Booking,
  Payment,
  Membership,
  MembershipDues,
  AuditLog,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { env } from '../config/env.js';

describe('Phase 3 — Membership, Events, Ticketing & Payment Tests', () => {
  const timestamp = Date.now();

  let studentUser = null;
  let studentToken = null;

  let otherStudentUser = null;
  let otherStudentToken = null;

  let presidentUser = null;
  let presidentToken = null;

  let treasurerUser = null;
  let treasurerToken = null;

  let organizerA = null;
  let organizerAToken = null;

  let organizerB = null;
  let organizerBToken = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Student User
    studentUser = new User({
      name: 'P3 Student A',
      email: `p3_student_a_${timestamp}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEM${String(timestamp).slice(-4)}1`,
    });
    await studentUser.save();
    studentToken = generateToken({
      id: studentUser.id,
      sub: studentUser.email,
      roles: ['STUDENT'],
      role: 'STUDENT',
      memberNumber: studentUser.memberNumber,
    });

    // 2. Other Student User
    otherStudentUser = new User({
      name: 'P3 Student B',
      email: `p3_student_b_${timestamp}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEM${String(timestamp).slice(-4)}2`,
    });
    await otherStudentUser.save();
    otherStudentToken = generateToken({
      id: otherStudentUser.id,
      sub: otherStudentUser.email,
      roles: ['STUDENT'],
      role: 'STUDENT',
      memberNumber: otherStudentUser.memberNumber,
    });

    // 3. President User
    presidentUser = new User({
      name: 'P3 President',
      email: `p3_president_${timestamp}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['PRESIDENT'],
      role: 'PRESIDENT',
      emailVerified: true,
      memberNumber: `MEM${String(timestamp).slice(-4)}3`,
    });
    await presidentUser.save();
    presidentToken = generateToken({
      id: presidentUser.id,
      sub: presidentUser.email,
      roles: ['PRESIDENT'],
      role: 'PRESIDENT',
      memberNumber: presidentUser.memberNumber,
    });

    // 4. Treasurer User
    treasurerUser = new User({
      name: 'P3 Treasurer',
      email: `p3_treasurer_${timestamp}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['TREASURER'],
      role: 'TREASURER',
      emailVerified: true,
      memberNumber: `MEM${String(timestamp).slice(-4)}4`,
    });
    await treasurerUser.save();
    treasurerToken = generateToken({
      id: treasurerUser.id,
      sub: treasurerUser.email,
      roles: ['TREASURER'],
      role: 'TREASURER',
      memberNumber: treasurerUser.memberNumber,
    });

    // 5. Organizer A
    organizerA = new Organizer({
      organizerName: 'P3 Org A',
      organizationName: 'Robotics Club',
      email: `p3_org_a_${timestamp}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
      role: 'ORGANIZER',
    });
    await organizerA.save();
    organizerAToken = generateToken({
      id: organizerA.id,
      sub: organizerA.email,
      role: 'ORGANIZER',
    });

    // 6. Organizer B
    organizerB = new Organizer({
      organizerName: 'P3 Org B',
      organizationName: 'Coding Club',
      email: `p3_org_b_${timestamp}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
      role: 'ORGANIZER',
    });
    await organizerB.save();
    organizerBToken = generateToken({
      id: organizerB.id,
      sub: organizerB.email,
      role: 'ORGANIZER',
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await Membership.deleteMany({ userId: { $in: [studentUser.id, otherStudentUser.id] } });
    await MembershipDues.deleteMany({ userId: { $in: [studentUser.id, otherStudentUser.id] } });
    await User.deleteMany({
      id: { $in: [studentUser.id, otherStudentUser.id, presidentUser.id, treasurerUser.id] },
    });
    await Organizer.deleteMany({ id: { $in: [organizerA.id, organizerB.id] } });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Membership Management Lifecycle Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Membership Management Lifecycle', () => {
    let createdMembershipId = null;

    it('should return NOT_APPLIED for student who has not applied yet', async () => {
      const res = await request(app)
        .get('/api/memberships/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('NOT_APPLIED');
      expect(res.body.data.memberNumber).toBe(studentUser.memberNumber);
      expect(res.body.data.dues.outstandingBalance).toBe(0);
    });

    it('should allow student to submit a membership application', async () => {
      const res = await request(app)
        .post('/api/memberships/apply')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          statement: 'I want to lead the IEEE tech symposium and robotics hackathon.',
          department: 'Computer Science',
          yearOfStudy: '3rd Year',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.memberNumber).toBe(studentUser.memberNumber);
      expect(res.body.data.department).toBe('Computer Science');
      createdMembershipId = res.body.data.id;
    });

    it('should reject duplicate active or pending membership application', async () => {
      const res = await request(app)
        .post('/api/memberships/apply')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          statement: 'Duplicate application attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already have an application');
    });

    it('should prevent unauthorized roles (STUDENT) from reviewing applications', async () => {
      const res = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow authorized PRESIDENT to list pending membership applications', async () => {
      const res = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((m) => m.id === createdMembershipId);
      expect(found).toBeTruthy();
      expect(found.status).toBe('PENDING');
    });

    it('should prevent unauthorized role (STUDENT) from approving membership', async () => {
      const res = await request(app)
        .post(`/api/memberships/${createdMembershipId}/approve`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ note: 'Self-approval attempt' });

      expect(res.status).toBe(403);
    });

    it('should allow authorized PRESIDENT to approve application with dues assessment', async () => {
      const res = await request(app)
        .post(`/api/memberships/${createdMembershipId}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          note: 'Approved. Welcome to the association!',
          duesAmount: 250,
          term: '2026-2027',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.reviewedBy).toBe(presidentUser.id);
      expect(res.body.data.validUntil).toBeTruthy();

      // Check dues obligation was created
      const dues = await MembershipDues.findOne({
        membershipId: createdMembershipId,
        academicTerm: '2026-2027',
      });
      expect(dues).toBeTruthy();
      expect(dues.amount).toBe(250);
      expect(dues.status).toBe('PENDING');
    });

    it('should reject approving an already approved application (invalid transition)', async () => {
      const res = await request(app)
        .post(`/api/memberships/${createdMembershipId}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ note: 'Second approval attempt' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Cannot approve');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Membership Dues and Obligations Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Membership Dues and Payment Obligations', () => {
    it('should calculate dues totals and outstanding balances server-side', async () => {
      const res = await request(app)
        .get('/api/dues/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAssessed).toBe(250);
      expect(res.body.data.totalPaid).toBe(0);
      expect(res.body.data.outstandingBalance).toBe(250);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0].status).toBe('PENDING');
    });

    it('should prevent duplicate dues assessment for the same user and term', async () => {
      const res = await request(app)
        .post('/api/dues')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          userId: studentUser.id,
          amount: 250,
          academicTerm: '2026-2027',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid dues amount (non-positive)', async () => {
      const res = await request(app)
        .post('/api/dues')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          userId: studentUser.id,
          amount: -50,
          academicTerm: '2027-2028',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should allow settling dues and update membership to ACTIVE', async () => {
      const duesRes = await request(app)
        .get('/api/dues/my')
        .set('Authorization', `Bearer ${studentToken}`);

      const dueItem = duesRes.body.data.items[0];
      expect(dueItem).toBeTruthy();

      // 1. Create Razorpay order for dues
      const orderRes = await request(app)
        .post(`/api/dues/${dueItem.id}/order`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(orderRes.status).toBe(200);
      const { orderId } = orderRes.body.data;

      // 2. Compute authentic Razorpay HMAC signature
      const mockPaymentId = `pay_dues_p3_${Date.now()}`;
      const payload = `${orderId}|${mockPaymentId}`;
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      // 3. Verify and settle dues
      const payRes = await request(app)
        .post(`/api/dues/${dueItem.id}/verify`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: mockPaymentId,
          razorpaySignature: signature,
        });

      expect(payRes.status).toBe(200);
      expect(payRes.body.success).toBe(true);
      expect(payRes.body.data.status).toBe('PAID');

      // Verify membership transitioned to ACTIVE
      const memRes = await request(app)
        .get('/api/memberships/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(memRes.body.data.status).toBe('ACTIVE');
      expect(memRes.body.data.dues.outstandingBalance).toBe(0);
      expect(memRes.body.data.dues.totalPaid).toBe(250);
    });

    it('should prevent student from paying another student dues obligation', async () => {
      const duesRes = await request(app)
        .get('/api/dues/my')
        .set('Authorization', `Bearer ${studentToken}`);

      const dueItem = duesRes.body.data.items[0];

      const roguePay = await request(app)
        .post(`/api/dues/${dueItem.id}/pay`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          paymentMethod: 'ONLINE',
        });

      expect(roguePay.status).toBe(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Event Management & Ownership Protection
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Event Management & Ownership Protection', () => {
    let createdEventId = null;

    it('should allow authorized Organizer to create an event', async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 30);

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          eventName: 'Skyline Autonomous Drone Race 2026',
          category: 'TECHNICAL',
          eventType: 'COMPETITION',
          collegeName: 'Skyline University',
          eventDate: eventDate.toISOString().split('T')[0],
          eventTime: '10:00 AM',
          venueName: 'Indoor Sports Arena',
          location: 'Skyline Campus',
          ticketPrice: 150,
          totalSeats: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eventName).toBe('Skyline Autonomous Drone Race 2026');
      expect(res.body.data.availableSeats).toBe(10);
      createdEventId = res.body.data.id;
    });

    it('should prevent Organizer B from editing Organizer A event (ownership violation)', async () => {
      const res = await request(app)
        .put(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${organizerBToken}`)
        .send({
          eventName: 'Hacked Event Title',
          ticketPrice: 0,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized Access');
    });

    it('should allow Organizer A to update their own event', async () => {
      const res = await request(app)
        .put(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          description: 'Official drone championship rules updated.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow Organizer A to publish their event', async () => {
      const res = await request(app)
        .patch(`/api/events/${createdEventId}/publish`)
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PUBLISHED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Ticketing, Concurrency & Client Success Protection
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Ticketing, Concurrency & Security', () => {
    let testEvent = null;

    beforeAll(async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 15);

      testEvent = new Event({
        eventName: 'Exclusive Concurrency Workshop',
        category: 'WORKSHOP',
        eventType: 'WORKSHOP',
        organizerId: organizerA.id,
        organizer: organizerA._id,
        eventDate,
        eventTime: '02:00 PM',
        ticketPrice: 100,
        totalSeats: 2,
        availableSeats: 2,
        status: 'PUBLISHED',
      });
      await testEvent.save();
    });

    it('should create booking and atomically decrement available seats', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookingStatus).toBe('PENDING');

      // Check database seats were atomically reserved
      const updatedEvent = await Event.findOne({ id: testEvent.id });
      expect(updatedEvent.availableSeats).toBe(1);
    });

    it('should reject overselling when quantity exceeds available capacity', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 2, // Only 1 seat left
          participants: [
            { name: 'Student 1', email: `p3_part1_${Date.now()}@skyline.edu` },
            { name: 'Student 2', email: `p3_part2_${Date.now()}@skyline.edu` },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Tickets Sold Out');
    });

    it('should reject client-side markSuccess for paid booking without payment gateway verification', async () => {
      const booking = await Booking.findOne({ userId: studentUser.id, eventId: testEvent.id });
      expect(booking).toBeTruthy();

      const res = await request(app)
        .post(`/api/payments/bookings/${booking.id}/success`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          paymentMethod: 'CLIENT_CLAIMED_SUCCESS',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNVERIFIED_PAYMENT');
      expect(res.body.message).toContain('Client-side confirmation is not trusted');
    });

    it('should enforce booking ownership (other student cannot access student booking)', async () => {
      const booking = await Booking.findOne({ userId: studentUser.id, eventId: testEvent.id });

      const res = await request(app)
        .get(`/api/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);

      expect(res.status).toBe(404);
    });

    it('should release held seats atomically upon booking cancellation', async () => {
      const booking = await Booking.findOne({ userId: studentUser.id, eventId: testEvent.id });

      const res = await request(app)
        .patch(`/api/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ reason: 'Student schedule conflict' });

      expect(res.status).toBe(200);
      expect(res.body.data.bookingStatus).toBe('CANCELLED');

      // Seats should be safely restored to the event
      const updatedEvent = await Event.findOne({ id: testEvent.id });
      expect(updatedEvent.availableSeats).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Razorpay Webhook & Payment Reliability
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Razorpay Webhook & Payment Reliability', () => {
    let webhookBooking = null;
    let webhookPayment = null;

    beforeAll(async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 20);

      const evt = new Event({
        eventName: 'Webhook Verification Event',
        category: 'SEMINAR',
        eventType: 'SEMINAR',
        eventTime: '11:00 AM',
        organizerId: organizerA.id,
        organizer: organizerA._id,
        eventDate,
        ticketPrice: 300,
        totalSeats: 50,
        availableSeats: 49,
        status: 'PUBLISHED',
      });
      await evt.save();

      webhookBooking = new Booking({
        userId: studentUser.id,
        user: studentUser._id,
        eventId: evt.id,
        event: evt._id,
        ticketId: `TKT-WH-${Date.now()}`,
        quantity: 1,
        totalAmount: 300,
        bookingStatus: 'PENDING',
        ticketStatus: 'ACTIVE',
      });
      await webhookBooking.save();

      webhookPayment = new Payment({
        transactionId: `TXN-WH-${Date.now()}`,
        bookingId: webhookBooking.id,
        booking: webhookBooking._id,
        amount: 300,
        paymentStatus: 'PROCESSING',
        gatewayOrderId: `order_phase3_wh_${Date.now()}`,
      });
      await webhookPayment.save();
    });

    it('should reject webhook requests with invalid or forged signature', async () => {
      const payload = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: { entity: { id: webhookPayment.gatewayOrderId } },
        },
      });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', 'forged_or_invalid_signature_hex')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid webhook signature');
    });

    it('should verify valid HMAC signature, confirm booking, and generate QR code', async () => {
      const payload = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: { entity: { id: webhookPayment.gatewayOrderId } },
          payment: { entity: { id: `pay_p3_${Date.now()}`, order_id: webhookPayment.gatewayOrderId } },
        },
      });

      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.processed).toBe(true);

      // Verify payment marked SUCCESSFUL
      const updatedPayment = await Payment.findOne({ id: webhookPayment.id });
      expect(updatedPayment.paymentStatus).toBe('SUCCESSFUL');

      // Verify booking marked CONFIRMED with QR code
      const updatedBooking = await Booking.findOne({ id: webhookBooking.id });
      expect(updatedBooking.bookingStatus).toBe('CONFIRMED');
      expect(updatedBooking.qrCodePath).toBeTruthy();
    });

    it('should handle duplicate webhook delivery idempotently without duplicating actions', async () => {
      const payload = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: { entity: { id: webhookPayment.gatewayOrderId } },
          payment: { entity: { id: `pay_p3_dup`, order_id: webhookPayment.gatewayOrderId } },
        },
      });

      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.idempotent).toBe(true);
    });
  });
});
