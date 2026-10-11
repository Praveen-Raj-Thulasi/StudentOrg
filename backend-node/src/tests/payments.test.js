import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { app } from '../app.js';
import { Event, Organizer, User, Booking, Payment, Refund, Counter, AuditLog } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_payment_test';

describe('Payment & Razorpay Integration Tests', () => {
  let userToken;
  let otherUserToken;
  let adminToken;
  let testUser;
  let otherUser;
  let testOrganizer;
  let paidEvent;
  let freeEvent;

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
    await Refund.init();
    await AuditLog.init();
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
    await Refund.deleteMany({});
    await Counter.deleteMany({});
    await AuditLog.deleteMany({});

    testOrganizer = new Organizer({
      organizerName: 'Tech Org',
      organizationName: 'Tech University',
      email: 'tech@univ.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await testOrganizer.save();

    testUser = new User({
      name: 'Alice Student',
      email: 'alice@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
    });
    await testUser.save();

    otherUser = new User({
      name: 'Bob Student',
      email: 'bob@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
    });
    await testUser.save();
    await otherUser.save();

    userToken = generateToken({
      id: testUser.id,
      sub: testUser.email,
      role: 'USER',
    });

    otherUserToken = generateToken({
      id: otherUser.id,
      sub: otherUser.email,
      role: 'USER',
    });

    adminToken = generateToken({
      id: 999,
      sub: 'admin@collegeevents.edu',
      role: 'ADMIN',
    });

    paidEvent = new Event({
      eventName: 'Paid Hackathon 2026',
      organizerId: testOrganizer.id,
      collegeName: 'Tech University',
      category: 'HACKATHON',
      eventType: 'OFFLINE',
      eventTime: '09:00:00',
      totalSeats: 100,
      availableSeats: 98,
      ticketPrice: 250,
      status: 'PUBLISHED',
      eventDate: new Date(Date.now() + 86400000),
    });
    await paidEvent.save();

    freeEvent = new Event({
      eventName: 'Free Seminar 2026',
      organizerId: testOrganizer.id,
      collegeName: 'Tech University',
      category: 'SEMINAR',
      eventType: 'ONLINE',
      eventTime: '14:00:00',
      totalSeats: 50,
      availableSeats: 49,
      ticketPrice: 0,
      status: 'PUBLISHED',
      eventDate: new Date(Date.now() + 86400000),
    });
    await freeEvent.save();
  });

  describe('Order Creation & Free Event Handling', () => {
    it('should automatically mark payment and booking confirmed for free events (zero amount)', async () => {
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: freeEvent.id,
        event: freeEvent._id,
        ticketId: 'EVT-FREE-001',
        quantity: 1,
        totalAmount: 0,
        bookingStatus: 'PENDING',
        participants: [{ name: 'Alice Student', email: 'alice@student.edu' }],
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-FREE-001',
        bookingId: booking.id,
        booking: booking._id,
        amount: 0,
        paymentStatus: 'PENDING',
      });
      await payment.save();

      const res = await request(app)
        .post(`/api/payments/bookings/${booking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.displayAmount).toBe(0);

      // Verify DB was updated
      const updatedBooking = await Booking.findOne({ id: booking.id });
      expect(updatedBooking.bookingStatus).toBe('CONFIRMED');

      const updatedPayment = await Payment.findOne({ bookingId: booking.id });
      expect(updatedPayment.paymentStatus).toBe('SUCCESSFUL');
    });

    it('should reject payment order creation if booking is cancelled', async () => {
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: paidEvent.id,
        event: paidEvent._id,
        ticketId: 'EVT-PAID-001',
        quantity: 1,
        totalAmount: 250,
        bookingStatus: 'CANCELLED',
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-PAID-001',
        bookingId: booking.id,
        booking: booking._id,
        amount: 250,
        paymentStatus: 'PENDING',
      });
      await payment.save();

      const res = await request(app)
        .post(`/api/payments/bookings/${booking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cancelled');
    });
  });

  describe('Server-Side Signature Verification', () => {
    it('should verify valid HMAC-SHA256 signature and mark payment successful', async () => {
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: paidEvent.id,
        event: paidEvent._id,
        ticketId: 'EVT-PAID-002',
        quantity: 1,
        totalAmount: 250,
        bookingStatus: 'PENDING',
        participants: [{ name: 'Alice', email: 'alice@student.edu' }],
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-PAID-002',
        bookingId: booking.id,
        booking: booking._id,
        amount: 250,
        paymentStatus: 'PROCESSING',
        gatewayOrderId: 'order_test_998877',
      });
      await payment.save();

      const orderId = 'order_test_998877';
      const paymentId = 'pay_test_112233';
      const validSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post(`/api/payments/bookings/${booking.id}/razorpay/verify`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
          paymentMethod: 'UPI',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedPayment = await Payment.findOne({ bookingId: booking.id });
      expect(updatedPayment.paymentStatus).toBe('SUCCESSFUL');
      expect(updatedPayment.gatewayReference).toBe(paymentId);

      const updatedBooking = await Booking.findOne({ id: booking.id });
      expect(updatedBooking.bookingStatus).toBe('CONFIRMED');
      expect(updatedBooking.qrCodePath).toBeTruthy();

      // Check audit log was recorded
      const audit = await AuditLog.findOne({ targetId: String(updatedPayment.id) });
      expect(audit).toBeTruthy();
      expect(audit.action).toBe('PAYMENT_SUCCESSFUL');
    });

    it('should reject invalid HMAC signature and mark payment failed', async () => {
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: paidEvent.id,
        event: paidEvent._id,
        ticketId: 'EVT-PAID-003',
        quantity: 1,
        totalAmount: 250,
        bookingStatus: 'PENDING',
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-PAID-003',
        bookingId: booking.id,
        booking: booking._id,
        amount: 250,
        paymentStatus: 'PROCESSING',
        gatewayOrderId: 'order_test_998877',
      });
      await payment.save();

      const res = await request(app)
        .post(`/api/payments/bookings/${booking.id}/razorpay/verify`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          razorpayOrderId: 'order_test_998877',
          razorpayPaymentId: 'pay_test_112233',
          razorpaySignature: 'fraudulent_or_tampered_signature_hex',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('signature verification failed');

      const updatedPayment = await Payment.findOne({ bookingId: booking.id });
      expect(updatedPayment.paymentStatus).toBe('FAILED');
    });
  });

  describe('Idempotent Webhook Processing', () => {
    it('should process payment.captured webhook and be idempotent on duplicate events', async () => {
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: paidEvent.id,
        event: paidEvent._id,
        ticketId: 'EVT-WH-001',
        quantity: 1,
        totalAmount: 250,
        bookingStatus: 'PENDING',
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-WH-001',
        bookingId: booking.id,
        booking: booking._id,
        amount: 250,
        paymentStatus: 'PROCESSING',
        gatewayOrderId: 'order_wh_12345',
      });
      await payment.save();

      const webhookPayload = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: { entity: { id: 'order_wh_12345' } },
          payment: { entity: { id: 'pay_wh_67890', order_id: 'order_wh_12345' } },
        },
      });

      const validSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(webhookPayload)
        .digest('hex');

      // First webhook delivery
      const firstRes = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.status).toBe('ok');

      const paymentAfterFirst = await Payment.findOne({ gatewayOrderId: 'order_wh_12345' });
      expect(paymentAfterFirst.paymentStatus).toBe('SUCCESSFUL');

      // Duplicate webhook delivery with identical payload
      const dupRes = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.idempotent).toBe(true);

      const paymentAfterDup = await Payment.findOne({ gatewayOrderId: 'order_wh_12345' });
      expect(paymentAfterDup.paymentStatus).toBe('SUCCESSFUL');
    });

    it('should reject webhook with invalid signature', async () => {
      const webhookPayload = JSON.stringify({ event: 'order.paid' });
      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', 'invalid_signature')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('signature');
    });
  });

  describe('Refund Authorization & Access Controls', () => {
    it('should prevent user from accessing refunds belonging to another user', async () => {
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: paidEvent.id,
        event: paidEvent._id,
        ticketId: 'EVT-REF-001',
        quantity: 1,
        totalAmount: 250,
        bookingStatus: 'CANCELLED',
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-REF-001',
        bookingId: booking.id,
        booking: booking._id,
        amount: 250,
        paymentStatus: 'REFUNDED',
      });
      await payment.save();

      const refund = new Refund({
        refundReference: 'REF-001',
        paymentId: payment.id,
        payment: payment._id,
        bookingId: booking.id,
        userId: testUser.id,
        refundAmount: 250,
        refundStatus: 'REFUND_REQUESTED',
      });
      await refund.save();

      // Alice accesses her refund -> 200 OK
      const aliceRes = await request(app)
        .get(`/api/payments/${payment.id}/refunds`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(aliceRes.status).toBe(200);
      expect(aliceRes.body.data.length).toBe(1);

      // Bob tries to access Alice's refund -> 403 Forbidden
      const bobRes = await request(app)
        .get(`/api/payments/${payment.id}/refunds`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(bobRes.status).toBe(403);

      // Admin accesses Alice's refund -> 200 OK
      const adminRes = await request(app)
        .get(`/api/payments/${payment.id}/refunds`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.length).toBe(1);
    });
  });
});
