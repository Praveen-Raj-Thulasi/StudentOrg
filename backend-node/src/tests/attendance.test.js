import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Event, Organizer, User, Booking, Attendance, Payment, Counter } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { generateQrCode } from '../utils/qrGenerator.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_attendance_test';

describe('Attendance & QR Scanner Integration Tests', () => {
  let organizerToken;
  let otherOrganizerToken;
  let userToken;
  let testOrganizer;
  let otherOrganizer;
  let testUser;
  let testEvent;
  let confirmedBooking;

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
    await Attendance.init();
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
    await Attendance.deleteMany({});
    await Payment.deleteMany({});
    await Counter.deleteMany({});

    // Seed test organizer 1
    testOrganizer = new Organizer({
      organizerName: 'IIT Madras Events Team',
      organizationName: 'IIT Madras',
      email: 'events@iitm.ac.in',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await testOrganizer.save();
    organizerToken = generateToken({
      email: testOrganizer.email,
      role: 'ORGANIZER',
      id: testOrganizer.id,
    });

    // Seed other organizer
    otherOrganizer = new Organizer({
      organizerName: 'Other Organizer',
      organizationName: 'Other College',
      email: 'other@college.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await otherOrganizer.save();
    otherOrganizerToken = generateToken({
      email: otherOrganizer.email,
      role: 'ORGANIZER',
      id: otherOrganizer.id,
    });

    // Seed attendee
    testUser = new User({
      name: 'Ravi Kumar',
      email: 'ravi.kumar@college.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
    });
    await testUser.save();
    userToken = generateToken({
      email: testUser.email,
      role: 'USER',
      id: testUser.id,
    });

    // Seed Event (free event for easy check-in validation)
    const today = new Date();
    testEvent = new Event({
      organizerId: testOrganizer.id,
      organizer: testOrganizer._id,
      eventName: 'Grand Technical Symposium 2026',
      category: 'TECHNICAL_SYMPOSIUM',
      eventType: 'INTER_COLLEGE',
      eventDate: today,
      eventTime: '09:00',
      ticketPrice: 0,
      totalSeats: 100,
      availableSeats: 99,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    });
    await testEvent.save();

    // Seed Confirmed Booking
    confirmedBooking = new Booking({
      ticketId: 'EVT-20261010-ABCD1234',
      userId: testUser.id,
      user: testUser._id,
      eventId: testEvent.id,
      event: testEvent._id,
      quantity: 1,
      totalAmount: 0,
      bookingStatus: 'CONFIRMED',
      ticketStatus: 'ACTIVE',
      attendanceStatus: 'NOT_ATTENDED',
      participants: [{ name: 'Ravi Kumar', email: 'ravi.kumar@college.edu' }],
    });
    await confirmedBooking.save();
  });

  describe('A. QR Code Generation Utility', () => {
    it('generateQrCode should generate a PNG image file and return its path', async () => {
      const qrPath = await generateQrCode('EVT-20261010-ABCD1234');
      expect(qrPath).toBe('/uploads/qrcodes/qr_EVT-20261010-ABCD1234.png');
    });
  });

  describe('B. QR Ticket Scanning & Attendance Recording', () => {
    it('POST /api/attendance/scan should mark attendee present and record Attendance document', async () => {
      const res = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId: confirmedBooking.ticketId,
          scanMethod: 'QR_CAMERA',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attendanceStatus).toBe('PRESENT');
      expect(res.body.data.certificateEligible).toBe(true);
      expect(res.body.data.participantName).toBe('Ravi Kumar');
      expect(res.body.data.checkInTime).toBeDefined();

      // Verify DB record
      const dbBooking = await Booking.findOne({ id: confirmedBooking.id });
      expect(dbBooking.attendanceStatus).toBe('PRESENT');
      expect(dbBooking.ticketStatus).toBe('EXPIRED');

      const attendanceRecord = await Attendance.findOne({ ticketId: confirmedBooking.ticketId });
      expect(attendanceRecord).not.toBeNull();
      expect(attendanceRecord.scanMethod).toBe('QR_CAMERA');
    });

    it('POST /api/attendance/scan should return 409 Conflict if ticket was already checked in', async () => {
      // First scan succeeds
      await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId: confirmedBooking.ticketId,
          scanMethod: 'QR_CAMERA',
        });

      // Second duplicate scan attempt
      const duplicateRes = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId: confirmedBooking.ticketId,
          scanMethod: 'QR_CAMERA',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.message).toBe('Attendance already recorded.');
      expect(duplicateRes.body.data.attendanceStatus).toBe('PRESENT');
    });

    it('POST /api/attendance/scan should reject scan if ticket does not match the event (cross-event mismatch)', async () => {
      const res = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: 99999, // Mismatched event ID
          ticketId: confirmedBooking.ticketId,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Does not belong to this event');
    });

    it('POST /api/attendance/scan should reject unauthorized organizers with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId: confirmedBooking.ticketId,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Unauthorized scanner for this event');
    });
  });

  describe('C. Manual Attendance Override & Statistics', () => {
    it('PATCH /api/attendance/events/:eventId/bookings/:bookingId/present should manually mark attendee present', async () => {
      const res = await request(app)
        .patch(`/api/attendance/events/${testEvent.id}/bookings/${confirmedBooking.id}/present`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.attendanceStatus).toBe('PRESENT');
      expect(res.body.data.certificateEligible).toBe(true);

      const dbBooking = await Booking.findOne({ id: confirmedBooking.id });
      expect(dbBooking.attendanceStatus).toBe('PRESENT');
    });

    it('GET /api/attendance/events/:eventId/stats should compute accurate live attendance metrics', async () => {
      // 1 confirmed booking, not yet checked in
      const initialStats = await request(app)
        .get(`/api/attendance/events/${testEvent.id}/stats`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(initialStats.status).toBe(200);
      expect(initialStats.body.data.registeredParticipants).toBe(1);
      expect(initialStats.body.data.checkedInParticipants).toBe(0);
      expect(initialStats.body.data.absentParticipants).toBe(1);
      expect(initialStats.body.data.attendancePercentage).toBe(0);

      // Check attendee in
      await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId: confirmedBooking.ticketId,
        });

      const updatedStats = await request(app)
        .get(`/api/attendance/events/${testEvent.id}/stats`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(updatedStats.body.data.checkedInParticipants).toBe(1);
      expect(updatedStats.body.data.absentParticipants).toBe(0);
      expect(updatedStats.body.data.attendancePercentage).toBe(100);
    });

    it('POST /api/attendance/relay/:eventId/:sessionId should relay scanned ticket successfully', async () => {
      const res = await request(app)
        .post(`/api/attendance/relay/${testEvent.id}/session-xyz-123`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          ticketId: confirmedBooking.ticketId,
          device: "Naveen's iPhone Scanner",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
