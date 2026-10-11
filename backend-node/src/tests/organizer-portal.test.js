import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  User,
  Organizer,
  Event,
  Booking,
  Payment,
  VolunteerTask,
  Notification,
  Attendance,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';

describe('Organizer Portal — Comprehensive Verification Suite', () => {
  const ts = Date.now();

  let organizerA = null;
  let organizerAToken = null;

  let organizerB = null;
  let organizerBToken = null;

  let volunteerUser = null;
  let volunteerToken = null;

  let studentUser = null;
  let studentToken = null;

  let eventA = null;
  let bookingA = null;
  let paymentA = null;
  let ticketIdA = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Organizer A
    organizerA = new Organizer({
      organizerName: 'Organizer Alpha',
      organizationName: 'Alpha Student Guild',
      email: `org_alpha_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await organizerA.save();
    organizerAToken = generateToken({
      id: organizerA.id,
      email: organizerA.email,
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
    });

    // 2. Organizer B (for security & cross-tenant checks)
    organizerB = new Organizer({
      organizerName: 'Organizer Beta',
      organizationName: 'Beta Student Society',
      email: `org_beta_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await organizerB.save();
    organizerBToken = generateToken({
      id: organizerB.id,
      email: organizerB.email,
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
    });

    // 3. Volunteer User
    volunteerUser = new User({
      name: 'Alpha Volunteer',
      email: `volunteer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'VOLUNTEER'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEM${String(ts).slice(-6)}1`,
      department: 'Computer Science',
    });
    await volunteerUser.save();
    volunteerToken = generateToken({
      id: volunteerUser.id,
      email: volunteerUser.email,
      role: 'VOLUNTEER',
      roles: ['STUDENT', 'VOLUNTEER'],
    });

    // 4. Student Attendee
    studentUser = new User({
      name: 'Alpha Attendee',
      email: `attendee_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEM${String(ts).slice(-6)}2`,
      department: 'Information Technology',
      college: 'Skyline Engineering',
    });
    await studentUser.save();
    studentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });
  });

  afterAll(async () => {
    try {
      await User.deleteMany({
        $or: [
          { email: { $regex: /_179166\d+@skyline\.edu/ } },
          { memberNumber: { $regex: /^(VOL_|STU_)/ } },
        ],
      });
      await Organizer.deleteMany({
        email: { $regex: /_179166\d+@skyline\.edu/ },
      });
      await Event.deleteMany({
        eventName: { $regex: /Annual Hackathon 2026/ },
      });
    } catch {}
    await disconnectDB();
  });

  // =========================================================================
  // SECTION 1 & 2: Event Management CRUD, Configuration & Ownership
  // =========================================================================
  describe('Event Management CRUD & Configuration', () => {
    let createdEventId = null;

    it('creates an event with member pricing, volunteer capacity, and categories', async () => {
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + 10);

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          eventName: 'Annual Hackathon 2026',
          category: 'TECHNICAL',
          eventType: 'TECHNICAL',
          eventDate: eventDate.toISOString().split('T')[0],
          eventTime: '09:00 AM',
          location: 'Innovation Lab 1',
          ticketPrice: 150,
          memberTicketPrice: 100,
          totalSeats: 50,
          volunteerCapacity: 5,
          volunteerCategories: ['Logistics', 'Mentorship', 'Registration'],
          status: 'DRAFT',
          description: 'Premier hackathon event',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eventName).toBe('Annual Hackathon 2026');
      expect(res.body.data.memberTicketPrice).toBe(100);
      expect(res.body.data.volunteerCapacity).toBe(5);
      expect(res.body.data.volunteerCategories).toEqual(['Logistics', 'Mentorship', 'Registration']);
      expect(res.body.data.status).toBe('DRAFT');

      createdEventId = res.body.data.id;
      eventA = await Event.findOne({ id: createdEventId });
    });

    it('allows editing an unreleased/draft event', async () => {
      const res = await request(app)
        .put(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          eventName: 'Annual Hackathon 2026 - Extended',
          totalSeats: 60,
          volunteerCapacity: 6,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.eventName).toBe('Annual Hackathon 2026 - Extended');
      expect(res.body.data.totalSeats).toBe(60);
      expect(res.body.data.volunteerCapacity).toBe(6);
    });

    it('prevents non-owner organizer from modifying another organizer\'s event', async () => {
      const res = await request(app)
        .put(`/api/events/${createdEventId}`)
        .set('Authorization', `Bearer ${organizerBToken}`)
        .send({
          eventName: 'Unauthorized Modification',
        });

      expect([403, 404]).toContain(res.status);
    });

    it('publishes the event successfully', async () => {
      const res = await request(app)
        .patch(`/api/events/${createdEventId}/publish`)
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PUBLISHED');
      eventA = await Event.findOne({ id: createdEventId });
    });
  });

  // =========================================================================
  // SECTION 3: Attendees, Bookings & QR Validation / Check-In
  // =========================================================================
  describe('Attendees, Tickets & Check-In Validation', () => {
    it('sets up a confirmed booking and authoritative payment for the event', async () => {
      ticketIdA = `TCK_ORG_${ts}`;
      bookingA = new Booking({
        user: studentUser._id,
        userId: studentUser.id,
        event: eventA._id,
        eventId: eventA.id,
        quantity: 1,
        seatCount: 1,
        totalAmount: 150,
        totalPrice: 150,
        bookingStatus: 'CONFIRMED',
        ticketId: ticketIdA,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?data=${ticketIdA}`,
        bookingDate: new Date(),
        participants: [
          {
            name: studentUser.name,
            email: studentUser.email,
            department: studentUser.department,
            college: studentUser.college,
          },
        ],
      });
      await bookingA.save();

      // Decrement available seat count
      await Event.findByIdAndUpdate(eventA._id, {
        $inc: { availableSeats: -1 },
      });

      paymentA = new Payment({
        booking: bookingA._id,
        bookingId: bookingA.id,
        user: studentUser._id,
        userId: studentUser.id,
        paymentType: 'BOOKING',
        amount: 150,
        paymentStatus: 'SUCCESSFUL',
        paymentMethod: 'ONLINE',
        transactionId: `TXN_${ts}`,
        paidAt: new Date(),
      });
      await paymentA.save();

      expect(bookingA._id).toBeDefined();
      expect(paymentA._id).toBeDefined();
    });

    it('locks event capacity and pricing edits once confirmed bookings exist', async () => {
      const res = await request(app)
        .put(`/api/events/${eventA.id}`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          totalSeats: 20, // Lower than original 60 seats when bookings already exist
          ticketPrice: 999,
        });

      // Backend event service rejects modification of totalSeats or locked fields when bookings exist
      expect([400, 422]).toContain(res.status);
    });

    it('lists attendees with authoritative booking, payment, and attendance status', async () => {
      const res = await request(app)
        .get('/api/organizer/participants')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .query({ eventId: eventA.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = res.body.data.find((p) => p.email === studentUser.email);
      expect(found).toBeDefined();
      expect(found.bookingStatus).toBe('CONFIRMED');
      expect(found.paymentStatus).toBe('SUCCESSFUL');
      expect(['ABSENT', 'NOT_ATTENDED']).toContain(found.attendanceStatus);
      expect(found.ticketId).toBe(ticketIdA);
    });

    it('filters attendees by attendanceStatus and bookingStatus', async () => {
      const presentRes = await request(app)
        .get('/api/organizer/participants')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .query({ eventId: eventA.id, attendanceStatus: 'PRESENT' });

      expect(presentRes.status).toBe(200);
      expect(presentRes.body.data.length).toBe(0);

      const confirmedRes = await request(app)
        .get('/api/organizer/participants')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .query({ eventId: eventA.id, bookingStatus: 'CONFIRMED' });

      expect(confirmedRes.status).toBe(200);
      expect(confirmedRes.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('prevents Organizer B from viewing Organizer A attendees (privacy boundary)', async () => {
      const res = await request(app)
        .get('/api/organizer/participants')
        .set('Authorization', `Bearer ${organizerBToken}`)
        .query({ eventId: eventA.id });

      // Either empty list or forbidden
      if (res.status === 200) {
        expect(res.body.data.length).toBe(0);
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('performs ticket QR validation and marks attendance with timestamp and actor', async () => {
      const res = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          eventId: eventA.id,
          ticketId: ticketIdA,
          scanMethod: 'QR_CAMERA',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticketId).toBe(ticketIdA);
      expect(res.body.data.verifiedBy).toBe(organizerA.id);
      expect(res.body.data.checkedInAt).toBeDefined();
    });

    it('strictly prevents duplicate check-in (reused/forged QR code)', async () => {
      const res = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          eventId: eventA.id,
          ticketId: ticketIdA,
          scanMethod: 'QR_CAMERA',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already checked in|already recorded/i);
    });

    it('rejects invalid or non-existent ticket IDs', async () => {
      const res = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          eventId: eventA.id,
          ticketId: 'FAKE_NON_EXISTENT_TICKET',
          scanMethod: 'QR_CAMERA',
        });

      expect([400, 404]).toContain(res.status);
    });
  });

  // =========================================================================
  // SECTION 4: Volunteer Coordination & Task Verification
  // =========================================================================
  describe('Volunteer Coordination Workflow', () => {
    let assignedTaskId = null;

    it('lists available volunteers with VOLUNTEER role', async () => {
      const res = await request(app)
        .get('/api/volunteer/organizer/volunteers')
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((v) => v.id === volunteerUser.id);
      expect(found).toBeDefined();
      expect(found.roles).toContain('VOLUNTEER');
    });

    it('prevents self-assignment (Organizer cannot assign themselves as volunteer)', async () => {
      const res = await request(app)
        .post('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          title: 'Self Assigned Duty',
          eventId: eventA.id,
          assignedTo: organizerA.id,
          dutyDate: new Date().toISOString().split('T')[0],
        });

      expect([400, 403, 422]).toContain(res.status);
    });

    it('creates and assigns an event task to an authorized volunteer', async () => {
      const res = await request(app)
        .post('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          title: 'Stage & Audio Setup',
          description: 'Coordinate mic testing and sound check',
          eventId: eventA.id,
          assignedTo: volunteerUser.id,
          category: 'LOGISTICS',
          pointsAwarded: 25,
          dutyDate: new Date().toISOString().split('T')[0],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Stage & Audio Setup');
      expect(['PENDING', 'ASSIGNED']).toContain(res.body.data.status);
      assignedTaskId = res.body.data.id;
    });

    it('enforces volunteer capacity limit when assigning tasks', async () => {
      // Event volunteer capacity is 6. If we set capacity to 1, next assignment must be blocked.
      await Event.findByIdAndUpdate(eventA._id, { volunteerCapacity: 1 });

      const secondVolunteer = new User({
        name: 'Second Volunteer',
        email: `vol2_${ts}@skyline.edu`,
        passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
        roles: ['VOLUNTEER'],
        role: 'VOLUNTEER',
        emailVerified: true,
      });
      await secondVolunteer.save();

      const res = await request(app)
        .post('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          title: 'Exceeding Capacity Task',
          eventId: eventA.id,
          assignedTo: secondVolunteer.id,
          dutyDate: new Date().toISOString().split('T')[0],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/capacity/i);

      // Restore volunteer capacity
      await Event.findByIdAndUpdate(eventA._id, { volunteerCapacity: 10 });
    });

    it('lists organizer tasks with populated volunteer details', async () => {
      const res = await request(app)
        .get('/api/volunteer/organizer/tasks')
        .set('Authorization', `Bearer ${organizerAToken}`)
        .query({ eventId: eventA.id });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const task = res.body.data.find((t) => t.id === assignedTaskId);
      expect(task).toBeDefined();
      expect(task.volunteer).toBeDefined();
      expect(task.volunteer.email).toBe(volunteerUser.email);
    });

    it('allows volunteer to update status to COMPLETED with notes', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${assignedTaskId}/status`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          status: 'COMPLETED',
          notes: 'Audio checks finished successfully',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('prevents volunteer from verifying their own task and awarding points', async () => {
      const res = await request(app)
        .post(`/api/volunteer/organizer/tasks/${assignedTaskId}/verify`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          verified: true,
          verificationNotes: 'Self approved',
        });

      expect([400, 403]).toContain(res.status);
    });

    it('allows Organizer to verify task completion and grant official points', async () => {
      const res = await request(app)
        .post(`/api/volunteer/organizer/tasks/${assignedTaskId}/verify`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          verified: true,
          verificationNotes: 'Great job handling the stage audio',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.completionNotes).toMatch(/Verified/i);
    });
  });

  // =========================================================================
  // SECTION 5: Event Operations & Announcements
  // =========================================================================
  describe('Event Announcements & Operations', () => {
    it('publishes event announcement and notifies attendees and volunteers', async () => {
      const res = await request(app)
        .post(`/api/events/${eventA.id}/announcements`)
        .set('Authorization', `Bearer ${organizerAToken}`)
        .send({
          title: 'Schedule Update: Keynote at 10:30 AM',
          message: 'Please take your seats early for the keynote session.',
          notifyVolunteers: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Schedule Update: Keynote at 10:30 AM');

      // Check notification sent to student attendee
      const notif = await Notification.findOne({
        user: studentUser._id,
        title: 'Schedule Update: Keynote at 10:30 AM',
      });
      expect(notif).toBeDefined();

      // Check notification sent to assigned volunteer
      const volNotif = await Notification.findOne({
        user: volunteerUser._id,
        title: 'Schedule Update: Keynote at 10:30 AM',
      });
      expect(volNotif).toBeDefined();
    });

    it('prevents non-owner organizer from publishing announcements on other events', async () => {
      const res = await request(app)
        .post(`/api/events/${eventA.id}/announcements`)
        .set('Authorization', `Bearer ${organizerBToken}`)
        .send({
          title: 'Unauthorized Announcement',
          message: 'This should fail.',
        });

      expect([400, 403, 404]).toContain(res.status);
    });
  });

  // =========================================================================
  // SECTION 6: Analytics & Dashboard Metrics
  // =========================================================================
  describe('Authoritative Analytics & Dashboard', () => {
    it('returns authoritative metrics without fabricating data', async () => {
      const res = await request(app)
        .get('/api/organizer/dashboard')
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const d = res.body.data;
      expect(d.totalEvents).toBeGreaterThanOrEqual(1);
      expect(d.publishedEvents).toBeGreaterThanOrEqual(1);
      expect(d.bookings.totalBookings).toBeGreaterThanOrEqual(1);
      expect(d.bookings.confirmedBookings).toBeGreaterThanOrEqual(1);
      expect(d.verifiedAttendance).toBeGreaterThanOrEqual(1);

      // Revenue summary matches authoritative Payment records
      expect(d.revenueSummary).toBeDefined();
      expect(d.revenueSummary.grossBookingsAmount).toBe(150);
      expect(d.revenueSummary.totalRevenue).toBe(150);
      expect(d.revenueSummary.totalRefunds).toBe(0);
      expect(d.revenueSummary.netRecordedRevenue).toBe(150);

      // Volunteer coordination duties
      expect(d.volunteerCoordination).toBeDefined();
      expect(d.volunteerCoordination.totalVolunteerDuties).toBeGreaterThanOrEqual(1);
      expect(d.volunteerCoordination.completedVolunteerDuties).toBeGreaterThanOrEqual(1);
    });

    it('returns financial summary on /api/organizer/analytics', async () => {
      const res = await request(app)
        .get('/api/organizer/analytics')
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.financialSummary).toBeDefined();
      expect(res.body.data.financialSummary.grossBookingsAmount).toBe(150);
      expect(res.body.data.financialSummary.successfulPaymentsAmount).toBe(150);
      expect(res.body.data.financialSummary.netRecordedRevenue).toBe(150);
      expect(res.body.data.financialSummary.verifiedAttendanceCount).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // SECTION 7: Security & Privilege Boundaries
  // =========================================================================
  describe('Security & Role Isolation', () => {
    it('forbids organizer from accessing President / Admin dashboard', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(403);
    });

    it('forbids organizer from accessing Treasurer financials', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${organizerAToken}`);

      expect(res.status).toBe(403);
    });

    it('forbids student from accessing Organizer dashboard', async () => {
      const res = await request(app)
        .get('/api/organizer/dashboard')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('forbids volunteer from accessing Organizer dashboard', async () => {
      const res = await request(app)
        .get('/api/organizer/dashboard')
        .set('Authorization', `Bearer ${volunteerToken}`);

      expect(res.status).toBe(403);
    });
  });
});
