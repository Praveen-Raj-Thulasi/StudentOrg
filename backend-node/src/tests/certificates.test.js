import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Event, Organizer, User, Booking, Attendance, Certificate, Counter } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_certificate_test';

describe('Certificate Management & Verification Integration Tests', () => {
  let organizerToken;
  let userToken;
  let otherUserToken;
  let adminToken;
  let testOrganizer;
  let testUser;
  let otherUser;
  let completedEvent;
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
    await Certificate.init();
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
    await Certificate.deleteMany({});
    await Counter.deleteMany({});

    testOrganizer = new Organizer({
      organizerName: 'Dr. Ramesh Kumar',
      organizationName: 'Anna University',
      email: 'ramesh@annauniv.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await testOrganizer.save();

    testUser = new User({
      name: 'Priya Sharma',
      email: 'priya@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
      organizationName: 'Anna University',
    });
    await testUser.save();

    otherUser = new User({
      name: 'Rohan Verma',
      email: 'rohan@student.edu',
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'USER',
    });
    await otherUser.save();

    organizerToken = generateToken({
      id: testOrganizer.id,
      sub: testOrganizer.email,
      role: 'ORGANIZER',
    });

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

    // Completed event in the past with certificates enabled
    completedEvent = new Event({
      eventName: 'AI & Robotics Symposium 2026',
      organizerId: testOrganizer.id,
      collegeName: 'Anna University',
      category: 'SYMPOSIUM',
      eventType: 'OFFLINE',
      eventTime: '10:00:00',
      totalSeats: 100,
      availableSeats: 50,
      ticketPrice: 0,
      status: 'COMPLETED',
      hasCertificate: true,
      eventDate: new Date(Date.now() - 2 * 86400000), // 2 days ago
      endDate: new Date(Date.now() - 86400000), // 1 day ago
    });
    await completedEvent.save();

    // Confirmed booking for Priya
    confirmedBooking = new Booking({
      userId: testUser.id,
      user: testUser._id,
      eventId: completedEvent.id,
      event: completedEvent._id,
      ticketId: 'EVT-CERT-001',
      quantity: 1,
      totalAmount: 0,
      bookingStatus: 'CONFIRMED',
      ticketStatus: 'CHECKED_IN',
      attendanceStatus: 'PRESENT',
      participants: [
        {
          name: 'Priya Sharma',
          email: 'priya@student.edu',
          college: 'Anna University',
          department: 'CSE',
        },
      ],
    });
    await confirmedBooking.save();

    // Mark present in Attendance collection
    const attendance = new Attendance({
      bookingId: confirmedBooking.id,
      ticketId: confirmedBooking.ticketId,
      eventId: completedEvent.id,
      userId: testUser.id,
      status: 'PRESENT',
      checkInTime: new Date(),
    });
    await attendance.save();
  });

  describe('Certificate Generation & Eligibility Enforcement', () => {
    it('should generate certificate for eligible attendee marked present', async () => {
      const res = await request(app)
        .post(`/api/certificates/events/${completedEvent.id}/generate`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.generated).toBe(1);

      const cert = await Certificate.findOne({
        eventId: completedEvent.id,
        userId: testUser.id,
      });
      expect(cert).toBeTruthy();
      expect(cert.certificateId).toMatch(/^CERT-\d{4}-\d{6}$/);
      expect(cert.recipientName).toBe('Priya Sharma');
      expect(cert.status).toBe('GENERATED');
    });

    it('should skip certificate generation if attendee was not marked present', async () => {
      // Create second booking where attendance is NOT marked present
      const absentBooking = new Booking({
        userId: otherUser.id,
        user: otherUser._id,
        eventId: completedEvent.id,
        event: completedEvent._id,
        ticketId: 'EVT-CERT-002',
        quantity: 1,
        totalAmount: 0,
        bookingStatus: 'CONFIRMED',
        attendanceStatus: 'ABSENT',
      });
      await absentBooking.save();

      const res = await request(app)
        .post(`/api/certificates/events/${completedEvent.id}/generate`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      const skippedUser = res.body.data.skipped.find((s) => s.userId === otherUser.id);
      expect(skippedUser).toBeTruthy();
      expect(skippedUser.reason).toContain('not marked present');

      const cert = await Certificate.findOne({
        eventId: completedEvent.id,
        userId: otherUser.id,
      });
      expect(cert).toBeNull();
    });
  });

  describe('Public Verification Endpoint', () => {
    it('should allow public verification without authentication and increment verification count', async () => {
      const cert = new Certificate({
        certificateId: 'CERT-2026-000123',
        eventId: completedEvent.id,
        userId: testUser.id,
        recipientName: 'Priya Sharma',
        eventName: completedEvent.eventName,
        verificationCount: 0,
        status: 'ISSUED',
      });
      await cert.save();

      // No authorization header needed
      const res = await request(app).get(`/api/certificates/verify/${cert.certificateId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recipientName).toBe('Priya Sharma');
      expect(res.body.data.verificationCount).toBe(1);

      const updatedCert = await Certificate.findOne({ certificateId: cert.certificateId });
      expect(updatedCert.verificationCount).toBe(1);
    });

    it('should return 404 for non-existent certificate verification', async () => {
      const res = await request(app).get('/api/certificates/verify/CERT-DOES-NOT-EXIST');
      expect(res.status).toBe(404);
    });
  });

  describe('PDF Generation & Download Security', () => {
    it('should allow owner to download generated PDF with valid PDF stream and headers', async () => {
      const cert = new Certificate({
        certificateId: 'CERT-2026-000789',
        eventId: completedEvent.id,
        userId: testUser.id,
        recipientName: 'Priya Sharma',
        eventName: completedEvent.eventName,
        status: 'RELEASED',
        verificationUrl: `http://localhost:3000/verify-certificate/CERT-2026-000789`,
      });
      await cert.save();

      const res = await request(app)
        .get(`/api/certificates/download/${cert.certificateId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('certificate-CERT-2026-000789.pdf');

      // Verify PDF magic bytes header %PDF-
      const bodyBuffer = Buffer.from(res.body);
      expect(bodyBuffer.toString('utf8', 0, 5)).toBe('%PDF-');

      // Verify download count incremented
      const updated = await Certificate.findOne({ certificateId: cert.certificateId });
      expect(updated.downloadCount).toBe(1);
    });

    it('should forbid unauthorized users from downloading other attendees certificates', async () => {
      const cert = new Certificate({
        certificateId: 'CERT-2026-000789',
        eventId: completedEvent.id,
        userId: testUser.id,
        recipientName: 'Priya Sharma',
        eventName: completedEvent.eventName,
        status: 'RELEASED',
      });
      await cert.save();

      // Rohan tries to download Priya's certificate
      const res = await request(app)
        .get(`/api/certificates/download/${cert.certificateId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should prevent download of revoked certificates', async () => {
      const cert = new Certificate({
        certificateId: 'CERT-2026-000999',
        eventId: completedEvent.id,
        userId: testUser.id,
        recipientName: 'Priya Sharma',
        eventName: completedEvent.eventName,
        status: 'REVOKED',
        revokeReason: 'Academic dishonesty',
      });
      await cert.save();

      const res = await request(app)
        .get(`/api/certificates/download/${cert.certificateId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('revoked');
    });
  });

  describe('Organizer Release & Email Integration', () => {
    it('should release certificates and queue emails', async () => {
      const cert = new Certificate({
        certificateId: 'CERT-2026-000456',
        eventId: completedEvent.id,
        event: completedEvent._id,
        userId: testUser.id,
        user: testUser._id,
        recipientName: 'Priya Sharma',
        eventName: completedEvent.eventName,
        status: 'GENERATED',
      });
      await cert.save();

      const res = await request(app)
        .post(`/api/certificates/events/${completedEvent.id}/release`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.released).toBe(1);

      const releasedCert = await Certificate.findOne({ certificateId: cert.certificateId });
      expect(releasedCert.status).toBe('RELEASED');
      expect(releasedCert.releasedAt).toBeTruthy();
    });
  });
});
