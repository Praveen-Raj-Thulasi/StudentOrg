import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  User,
  Organizer,
  Event,
  Booking,
  VolunteerTask,
  VolunteerApplication,
  UserInterest,
  UserLevel,
  Reimbursement,
  Notification,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';

describe('Volunteer Portal — Comprehensive Verification Suite', () => {
  const ts = Date.now();

  let volunteerA = null;
  let volunteerAToken = null;

  let volunteerB = null;
  let volunteerBToken = null;

  let nonVolunteerUser = null;
  let nonVolunteerToken = null;

  let organizerUser = null;
  let organizerToken = null;

  let event1 = null;
  let event2 = null;
  let assignedTask = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Volunteer User A
    volunteerA = new User({
      name: 'Ananya Volunteer',
      email: `ananya_vol_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['VOLUNTEER', 'STUDENT'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEM${Math.floor(100000 + Math.random() * 800000)}`,
      userCode: `USR${Math.floor(1000 + Math.random() * 8000)}`,
      department: 'Computer Science',
    });
    await volunteerA.save();
    volunteerAToken = generateToken({
      id: volunteerA.id,
      email: volunteerA.email,
      roles: volunteerA.roles,
      role: 'VOLUNTEER',
    });

    // 2. Volunteer User B
    volunteerB = new User({
      name: 'Bhavin Volunteer',
      email: `bhavin_vol_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['VOLUNTEER', 'STUDENT'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEM${Math.floor(100000 + Math.random() * 800000)}`,
      userCode: `USR${Math.floor(1000 + Math.random() * 8000)}`,
      department: 'Mechanical',
    });
    await volunteerB.save();
    volunteerBToken = generateToken({
      id: volunteerB.id,
      email: volunteerB.email,
      roles: volunteerB.roles,
      role: 'VOLUNTEER',
    });

    // 3. Regular Student (Non-Volunteer)
    nonVolunteerUser = new User({
      name: 'Siddharth Student',
      email: `sid_student_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEM${Math.floor(100000 + Math.random() * 800000)}`,
      userCode: `USR${Math.floor(1000 + Math.random() * 8000)}`,
    });
    await nonVolunteerUser.save();
    nonVolunteerToken = generateToken({
      id: nonVolunteerUser.id,
      email: nonVolunteerUser.email,
      roles: nonVolunteerUser.roles,
      role: 'STUDENT',
    });

    // 4. Organizer User
    organizerUser = new User({
      name: 'Rohan Organizer',
      email: `rohan_org_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['ORGANIZER', 'STUDENT'],
      role: 'ORGANIZER',
      emailVerified: true,
      memberNumber: `MEM${Math.floor(100000 + Math.random() * 800000)}`,
    });
    await organizerUser.save();
    organizerToken = generateToken({
      id: organizerUser.id,
      email: organizerUser.email,
      roles: organizerUser.roles,
      role: 'ORGANIZER',
    });

    // 5. Published Event with Volunteer Capacity & Categories
    event1 = new Event({
      title: `Skyline Tech Fest ${ts}`,
      eventName: `Skyline Tech Fest ${ts}`,
      description: 'Annual flagship engineering and robotics symposium.',
      category: 'Technology',
      eventType: 'CONFERENCE',
      eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      eventTime: '10:00 AM',
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      location: 'Campus Main Auditorium',
      organizerId: organizerUser.id,
      totalSeats: 250,
      availableSeats: 250,
      volunteerCapacity: 2, // capacity of 2 volunteers
      volunteerCategories: ['LOGISTICS', 'REGISTRATION', 'STAGE_MANAGEMENT'],
      status: 'PUBLISHED',
    });
    await event1.save();

    // 6. Another Event (Capacity 1)
    event2 = new Event({
      title: `Cultural Gala ${ts}`,
      eventName: `Cultural Gala ${ts}`,
      description: 'Music, theater and cultural performances.',
      category: 'Cultural',
      eventType: 'FESTIVAL',
      eventDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      eventTime: '06:00 PM',
      startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      location: 'Open Amphitheater',
      organizerId: organizerUser.id,
      totalSeats: 150,
      availableSeats: 150,
      volunteerCapacity: 1,
      volunteerCategories: ['SOUND_LIGHTS', 'HOSPITALITY'],
      status: 'PUBLISHED',
    });
    await event2.save();

    // 7. Initial Task assigned to Volunteer A
    assignedTask = new VolunteerTask({
      title: 'Configure registration check-in kiosks',
      description: 'Assemble 3 scanner stations at gate 2 and test Wi-Fi.',
      volunteerId: volunteerA.id,
      volunteer: volunteerA._id,
      assignedBy: organizerUser.id,
      eventId: event1.id,
      event: event1._id,
      priority: 'HIGH',
      status: 'PENDING',
    });
    await assignedTask.save();
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: `@skyline.edu$` } });
    await Event.deleteMany({ organizerId: organizerUser?.id });
    await VolunteerTask.deleteMany({ volunteerId: { $in: [volunteerA?.id, volunteerB?.id] } });
    await VolunteerApplication.deleteMany({ volunteerId: { $in: [volunteerA?.id, volunteerB?.id] } });
    await Reimbursement.deleteMany({ claimantId: { $in: [volunteerA?.id, volunteerB?.id] } });
    await disconnectDB();
  });

  /* =========================================================================
   * 1. ACCESS CONTROL & ROLE ISOLATION
   * ========================================================================= */
  describe('1. Access Control & Role Isolation', () => {
    it('should deny unauthenticated requests to volunteer portal', async () => {
      const res = await request(app).get('/api/volunteer/overview');
      expect(res.status).toBe(401);
    });

    it('should deny non-volunteer users from accessing volunteer endpoints', async () => {
      const res = await request(app)
        .get('/api/volunteer/overview')
        .set('Authorization', `Bearer ${nonVolunteerToken}`);

      expect(res.status).toBe(403);
    });

    it('should permit registered volunteer to access volunteer overview', async () => {
      const res = await request(app)
        .get('/api/volunteer/overview')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.volunteerId).toBe(volunteerA.id);
    });
  });

  /* =========================================================================
   * 2. VOLUNTEER DASHBOARD & OVERVIEW
   * ========================================================================= */
  describe('2. Volunteer Dashboard & Overview', () => {
    it('should return authoritative metrics, upcoming duties and announcements', async () => {
      const res = await request(app)
        .get('/api/volunteer/overview')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.profile.name).toBe('Ananya Volunteer');
      expect(data.profile.memberNumber).toBeTruthy();
      expect(data.summary.totalTasks).toBeGreaterThanOrEqual(1);
      expect(data.summary.pendingTasks).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.upcomingDuties)).toBe(true);
      expect(data.digitalId.qrPayload).toContain('SKYLINE-VOLUNTEER');
    });
  });

  /* =========================================================================
   * 3. PROFILE & AVAILABILITY MANAGEMENT
   * ========================================================================= */
  describe('3. Profile & Availability Management', () => {
    it('should allow volunteer to update permitted fields: skills, interests, availability, experience', async () => {
      const res = await request(app)
        .put('/api/volunteer/profile')
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          phone: '+91 9988776655',
          city: 'Hyderabad',
          interests: 'Technology, Robotics, Hackathons',
          skills: 'Registration, Logistics, Python',
          availability: 'WEEKENDS',
          experience: 'Served at 2 university symposiums as desk lead.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.availability).toBe('WEEKENDS');
      expect(res.body.data.skills).toContain('Registration');
      expect(res.body.data.interests).toContain('Robotics');
    });

    it('should strictly reject tampering with immutable or privileged attributes (roles, totalXp, memberNumber)', async () => {
      const res = await request(app)
        .put('/api/volunteer/profile')
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          roles: ['PRESIDENT', 'ADMIN'],
          totalXp: 99999,
          memberNumber: 'MEM999999',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Security violation');
    });
  });

  /* =========================================================================
   * 4. OPPORTUNITIES & APPLICATIONS LIFECYCLE
   * ========================================================================= */
  describe('4. Opportunities & Applications Lifecycle', () => {
    it('should list eligible events with remaining volunteer capacity', async () => {
      const res = await request(app)
        .get('/api/volunteer/opportunities')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      const list = res.body.data;
      expect(Array.isArray(list)).toBe(true);
      const ev1 = list.find((e) => e.id === event1.id);
      expect(ev1).toBeDefined();
      expect(ev1.volunteerCapacity).toBe(2);
      expect(ev1.remainingCapacity).toBeGreaterThanOrEqual(1);
      expect(ev1.volunteerCategories).toContain('LOGISTICS');
    });

    it('should allow volunteer to apply for an opportunity category', async () => {
      const res = await request(app)
        .post(`/api/volunteer/opportunities/${event1.id}/apply`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          category: 'LOGISTICS',
          notes: 'Available on day 1 to handle check-in hardware.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.category).toBe('LOGISTICS');
    });

    it('should reject duplicate active application for the same event', async () => {
      const res = await request(app)
        .post(`/api/volunteer/opportunities/${event1.id}/apply`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          category: 'REGISTRATION',
          notes: 'Duplicate attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already have an active application');
    });

    it('should prevent organizers from applying as volunteers for their own events', async () => {
      const res = await request(app)
        .post(`/api/volunteer/opportunities/${event1.id}/apply`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ category: 'LOGISTICS' });

      expect(res.status).toBe(403);
    });

    it('should list volunteer applications in my-applications', async () => {
      const res = await request(app)
        .get('/api/volunteer/my-applications')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((a) => a.eventId === event1.id && a.status === 'PENDING')).toBe(true);
    });

    it('should allow organizer to approve an application with notes', async () => {
      const appsRes = await request(app)
        .get('/api/volunteer/organizer/applications')
        .set('Authorization', `Bearer ${organizerToken}`)
        .query({ eventId: event1.id });

      const pendingApp = appsRes.body.data.find((a) => a.volunteerId === volunteerA.id);
      expect(pendingApp).toBeDefined();

      const reviewRes = await request(app)
        .post(`/api/volunteer/organizer/applications/${pendingApp.id}/review`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          status: 'APPROVED',
          reviewNotes: 'Welcome to the logistics desk!',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('APPROVED');
    });

    it('should allow volunteer B to apply and withdraw their application', async () => {
      const applyRes = await request(app)
        .post(`/api/volunteer/opportunities/${event2.id}/apply`)
        .set('Authorization', `Bearer ${volunteerBToken}`)
        .send({ category: 'HOSPITALITY', notes: 'Will assist guests.' });

      expect(applyRes.status).toBe(201);
      const appId = applyRes.body.data.id;

      const withdrawRes = await request(app)
        .post(`/api/volunteer/applications/${appId}/withdraw`)
        .set('Authorization', `Bearer ${volunteerBToken}`);

      expect(withdrawRes.status).toBe(200);
      expect(withdrawRes.body.data.status).toBe('WITHDRAWN');
    });
  });

  /* =========================================================================
   * 5. TASK PROGRESS & EVIDENCE VERIFICATION WORKFLOW
   * ========================================================================= */
  describe('5. Task Progress & Evidence Verification Workflow', () => {
    it('should allow volunteer to transition task from PENDING to ACCEPTED and IN_PROGRESS', async () => {
      // 1. Accept
      const acceptRes = await request(app)
        .patch(`/api/volunteer/tasks/${assignedTask.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ status: 'ACCEPTED' });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.status).toBe('ACCEPTED');

      // 2. Start
      const startRes = await request(app)
        .patch(`/api/volunteer/tasks/${assignedTask.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(startRes.status).toBe(200);
      expect(startRes.body.data.status).toBe('IN_PROGRESS');
    });

    it('should allow volunteer to submit task for review with completion notes and evidence', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${assignedTask.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          status: 'SUBMITTED_FOR_REVIEW',
          completionNotes: 'All 3 registration desks verified and tested with QR scanners.',
          evidenceNotes: 'Photos uploaded to association drive folder.',
          evidenceUrl: 'https://drive.skyline.edu/evidence/kiosk3',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUBMITTED_FOR_REVIEW');
      expect(res.body.data.completionNotes).toContain('registration desks verified');
      expect(res.body.data.evidenceUrl).toBe('https://drive.skyline.edu/evidence/kiosk3');
    });

    it('should prevent volunteer from verifying their own task or awarding points', async () => {
      const res = await request(app)
        .post(`/api/volunteer/organizer/tasks/${assignedTask.id}/verify`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ verified: true });

      expect(res.status).toBe(403);
    });

    it('should allow organizer to verify task completion and award contribution points', async () => {
      const res = await request(app)
        .post(`/api/volunteer/organizer/tasks/${assignedTask.id}/verify`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          verified: true,
          verificationNotes: 'Great job, scanners are active and calibrated.',
          pointsAwarded: 50,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.pointsAwarded).toBe(50);
      expect(res.body.data.verifiedBy).toBe(organizerUser.id);
      expect(res.body.data.completedAt).toBeDefined();

      // Verify points in UserLevel
      const level = await UserLevel.findOne({ userId: volunteerA.id });
      expect(level).toBeDefined();
      expect(level.totalXp).toBeGreaterThanOrEqual(50);
    });

    it('should reject reopening a completed task', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${assignedTask.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ status: 'PENDING' });

      expect(res.status).toBe(400);
    });
  });

  /* =========================================================================
   * 6. SMART MATCHING RECOMMENDATIONS
   * ========================================================================= */
  describe('6. Smart Matching Recommendations', () => {
    it('should evaluate transparent weighted matching without auto-assigning', async () => {
      const res = await request(app)
        .get('/api/volunteer/smart-matches')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      const matches = res.body.data;
      expect(Array.isArray(matches)).toBe(true);

      if (matches.length > 0) {
        const topMatch = matches[0];
        expect(topMatch.matchScore).toBeGreaterThanOrEqual(0);
        expect(topMatch.breakdown).toHaveProperty('interestMatch');
        expect(topMatch.breakdown).toHaveProperty('skillsMatch');
        expect(topMatch.breakdown).toHaveProperty('availabilityMatch');
        expect(topMatch.breakdown).toHaveProperty('experienceMatch');
        expect(Array.isArray(topMatch.matchedReasons)).toBe(true);
        expect(topMatch.disclaimer).toContain('Does not automatically assign');
      }
    });
  });

  /* =========================================================================
   * 7. CONTRIBUTIONS & VERIFIED ATTENDANCE
   * ========================================================================= */
  describe('7. Contributions & Verified Attendance', () => {
    it('should return authoritative points, breakdown, verified tasks and attendances', async () => {
      const res = await request(app)
        .get('/api/volunteer/contributions')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.totalPoints).toBeGreaterThanOrEqual(50);
      expect(data.pointsBreakdown.taskVerificationPoints).toBeGreaterThanOrEqual(50);
      expect(Array.isArray(data.completedTasks)).toBe(true);
      expect(data.completedTasks.some((t) => t.id === assignedTask.id)).toBe(true);
    });
  });

  /* =========================================================================
   * 8. EXPENSE REIMBURSEMENTS WORKFLOW
   * ========================================================================= */
  describe('8. Expense Reimbursements Workflow', () => {
    let claimId = null;

    it('should allow volunteer to submit reimbursement claim for supplies', async () => {
      const res = await request(app)
        .post('/api/volunteer/reimbursements')
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          amount: 850,
          category: 'SUPPLIES',
          description: 'Purchased 2 rolls of badge lanyards and registration tape.',
          receiptUrl: 'https://storage.skyline.edu/receipts/vol850.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.amount).toBe(850);
      expect(res.body.data.claimantId).toBe(volunteerA.id);
      expect(res.body.data.status).toBe('SUBMITTED');
      claimId = res.body.data.id;
    });

    it('should list only the volunteer own claims in GET /api/volunteer/reimbursements', async () => {
      const res = await request(app)
        .get('/api/volunteer/reimbursements')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((c) => c.id === claimId)).toBe(true);

      // Volunteer B cannot see Volunteer A's claims
      const resB = await request(app)
        .get('/api/volunteer/reimbursements')
        .set('Authorization', `Bearer ${volunteerBToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.some((c) => c.id === claimId)).toBe(false);
    });

    it('should prevent volunteer from approving or reviewing their own claim (separation of duties)', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${claimId}/review`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ action: 'APPROVED' });

      // Returns 403 Forbidden
      expect(res.status).toBe(403);
    });
  });

  /* =========================================================================
   * 9. DIGITAL ID & SAFE CREDENTIALS
   * ========================================================================= */
  describe('9. Digital ID & Safe Credentials', () => {
    it('should return safe public credentials without JWT or private tokens in QR payload', async () => {
      const res = await request(app)
        .get('/api/volunteer/digital-id')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      const idData = res.body.data;
      expect(idData.name).toBe('Ananya Volunteer');
      expect(idData.memberNumber).toBeTruthy();
      expect(idData.qrPayload).toMatch(/^SKYLINE-VOLUNTEER:MEM\d+/);
      // Ensure no tokens leaked
      expect(idData.qrPayload).not.toContain('Bearer');
      expect(idData.qrPayload).not.toContain('eyJ');
    });
  });
});
