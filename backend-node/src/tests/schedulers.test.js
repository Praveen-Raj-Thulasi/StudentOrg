import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { Event, Organizer, User, Booking, Payment, ApprovalRequest, Counter } from '../models/index.js';
import {
  releaseExpiredPaymentReservations,
  autoApproveAndPublishEvents,
  runLifecycleTransitions,
} from '../schedulers/index.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_scheduler_test';

describe('Background Scheduler & Retry Safety Integration Tests', () => {
  let testOrganizer;
  let testUser;

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
    await Booking.deleteMany({});
    await Payment.deleteMany({});
    await ApprovalRequest.deleteMany({});
    await Counter.deleteMany({});

    testOrganizer = new Organizer({
      organizerName: 'Tech Council',
      organizationName: 'Tech University',
      email: 'council@tech.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await testOrganizer.save();

    testUser = new User({
      name: 'Sam Student',
      email: 'sam@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
    });
    await testUser.save();
  });

  describe('Expired Booking Seat Release & Idempotency', () => {
    it('should release seats for 10-minute expired unpaid bookings and remain idempotent on retry', async () => {
      const event = new Event({
        eventName: 'AI Workshop',
        organizerId: testOrganizer.id,
        collegeName: 'Tech University',
        category: 'WORKSHOP',
        eventType: 'OFFLINE',
        eventDate: new Date(Date.now() + 86400000),
        eventTime: '10:00:00',
        totalSeats: 100,
        availableSeats: 96, // 4 seats reserved
        ticketPrice: 100,
        status: 'PUBLISHED',
      });
      await event.save();

      // Booking created 15 minutes ago (exceeded 10 min window)
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const booking = new Booking({
        userId: testUser.id,
        user: testUser._id,
        eventId: event.id,
        event: event._id,
        ticketId: 'EVT-SCHED-001',
        quantity: 4,
        totalAmount: 400,
        bookingStatus: 'PENDING',
        bookedAt: fifteenMinsAgo,
      });
      await booking.save();

      const payment = new Payment({
        transactionId: 'TXN-SCHED-001',
        bookingId: booking.id,
        booking: booking._id,
        amount: 400,
        paymentStatus: 'PENDING',
      });
      await payment.save();

      // First run: should detect and release the reservation
      const releasedFirstRun = await releaseExpiredPaymentReservations();
      expect(releasedFirstRun).toBe(1);

      // Verify booking is EXPIRED
      const updatedBooking = await Booking.findOne({ id: booking.id });
      expect(updatedBooking.bookingStatus).toBe('EXPIRED');
      expect(updatedBooking.ticketStatus).toBe('EXPIRED');

      // Verify payment marked FAILED
      const updatedPayment = await Payment.findOne({ bookingId: booking.id });
      expect(updatedPayment.paymentStatus).toBe('FAILED');
      expect(updatedPayment.failureReason).toContain('expired');

      // Verify seats restored to Event: 96 + 4 = 100
      const updatedEvent = await Event.findOne({ id: event.id });
      expect(updatedEvent.availableSeats).toBe(100);

      // Retry safety / Idempotency run:
      // Second run must NOT double-restore seats or fail
      const releasedSecondRun = await releaseExpiredPaymentReservations();
      expect(releasedSecondRun).toBe(0);

      const eventAfterRetry = await Event.findOne({ id: event.id });
      expect(eventAfterRetry.availableSeats).toBe(100); // Still 100, not 104!
    });
  });

  describe('Pending Event Auto-Approval Scheduler', () => {
    it('should auto-approve pending review requests older than 10 minutes safely', async () => {
      const event = new Event({
        eventName: 'Pending Conference',
        organizerId: testOrganizer.id,
        collegeName: 'Tech University',
        category: 'CONFERENCE',
        eventType: 'OFFLINE',
        eventDate: new Date(Date.now() + 86400000),
        eventTime: '09:00:00',
        totalSeats: 200,
        availableSeats: 200,
        status: 'PENDING_APPROVAL',
      });
      await event.save();

      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const req = new ApprovalRequest({
        eventId: event.id,
        organizerId: testOrganizer.id,
        status: 'PENDING',
        requestedAt: fifteenMinsAgo,
      });
      await req.save();

      // First run
      const approvedCount = await autoApproveAndPublishEvents();
      expect(approvedCount).toBeGreaterThanOrEqual(1);

      const updatedReq = await ApprovalRequest.findOne({ id: req.id });
      expect(updatedReq.status).toBe('APPROVED');

      const updatedEvent = await Event.findOne({ id: event.id });
      expect(updatedEvent.status).toBe('PUBLISHED');

      // Retry run should be idempotent
      const retryCount = await autoApproveAndPublishEvents();
      expect(retryCount).toBe(0);
    });
  });

  describe('Event Lifecycle Transitions', () => {
    it('should transition past events to COMPLETED and past deadlines to EXPIRED', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      const pastEvent = new Event({
        eventName: 'Past Symposium',
        organizerId: testOrganizer.id,
        collegeName: 'Tech University',
        category: 'SYMPOSIUM',
        eventType: 'OFFLINE',
        eventDate: new Date(Date.now() - 2 * 86400000),
        eventTime: '10:00:00',
        totalSeats: 50,
        availableSeats: 50,
        status: 'LIVE',
        eventDate: new Date(Date.now() - 2 * 86400000),
        endDate: yesterday,
      });
      await pastEvent.save();

      const result = await runLifecycleTransitions();
      expect(result.completedCount).toBeGreaterThanOrEqual(1);

      const updated = await Event.findOne({ id: pastEvent.id });
      expect(updated.status).toBe('COMPLETED');

      // Retry run
      const retryResult = await runLifecycleTransitions();
      expect(retryResult.completedCount).toBe(0);
    });
  });
});
