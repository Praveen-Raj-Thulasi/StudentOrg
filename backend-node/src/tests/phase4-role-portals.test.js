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
  Membership,
  MembershipDues,
  VolunteerTask,
  AuditLog,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';

describe('Phase 4 — Role-Based Portals & Workflows Integration Tests', () => {
  const ts = Date.now();

  let studentUser = null;
  let studentToken = null;

  let volunteerA = null;
  let volunteerAToken = null;

  let volunteerB = null;
  let volunteerBToken = null;

  let treasurerUser = null;
  let treasurerToken = null;

  let presidentUser = null;
  let presidentToken = null;

  let organizerUser = null;
  let organizerToken = null;

  let testEvent = null;
  let studentMembership = null;
  let studentDues = null;
  let taskForVolunteerA = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Student User
    studentUser = new User({
      name: 'Phase 4 Student',
      email: `p4_student_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEMP4S_${ts}`,
    });
    await studentUser.save();
    studentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });

    // 2. Volunteer A
    volunteerA = new User({
      name: 'Phase 4 Volunteer A',
      email: `p4_vol_a_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'VOLUNTEER'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEMP4VA_${ts}`,
    });
    await volunteerA.save();
    volunteerAToken = generateToken({
      id: volunteerA.id,
      email: volunteerA.email,
      role: 'VOLUNTEER',
      roles: ['STUDENT', 'VOLUNTEER'],
    });

    // 3. Volunteer B
    volunteerB = new User({
      name: 'Phase 4 Volunteer B',
      email: `p4_vol_b_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'VOLUNTEER'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEMP4VB_${ts}`,
    });
    await volunteerB.save();
    volunteerBToken = generateToken({
      id: volunteerB.id,
      email: volunteerB.email,
      role: 'VOLUNTEER',
      roles: ['STUDENT', 'VOLUNTEER'],
    });

    // 4. Treasurer User
    treasurerUser = new User({
      name: 'Phase 4 Treasurer',
      email: `p4_treasurer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'TREASURER'],
      role: 'TREASURER',
      emailVerified: true,
      memberNumber: `MEMP4T_${ts}`,
    });
    await treasurerUser.save();
    treasurerToken = generateToken({
      id: treasurerUser.id,
      email: treasurerUser.email,
      role: 'TREASURER',
      roles: ['STUDENT', 'TREASURER'],
    });

    // 5. President User
    presidentUser = new User({
      name: 'Phase 4 President',
      email: `p4_president_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'PRESIDENT'],
      role: 'PRESIDENT',
      emailVerified: true,
      memberNumber: `MEMP4P_${ts}`,
    });
    await presidentUser.save();
    presidentToken = generateToken({
      id: presidentUser.id,
      email: presidentUser.email,
      role: 'PRESIDENT',
      roles: ['STUDENT', 'PRESIDENT'],
    });

    // 6. Organizer User
    organizerUser = new Organizer({
      organizerName: 'Phase 4 Organizer',
      organizationName: 'Skyline Events Committee',
      email: `p4_org_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      isApproved: true,
    });
    await organizerUser.save();
    organizerToken = generateToken({
      id: organizerUser.id,
      email: organizerUser.email,
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
    });

    // 7. Test Event
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 7);

    testEvent = new Event({
      eventName: 'Phase 4 Campus Gala',
      category: 'CONFERENCE',
      eventType: 'CONFERENCE',
      eventTime: '10:00 AM',
      description: 'Annual cultural celebration',
      organizerId: organizerUser.id,
      organizer: organizerUser._id,
      eventDate,
      startDate: eventDate,
      endDate: new Date(eventDate.getTime() + 24 * 60 * 60 * 1000),
      location: 'Skyline Auditorium',
      status: 'PUBLISHED',
      ticketPrice: 250,
      totalSeats: 200,
      availableSeats: 200,
    });
    await testEvent.save();

    // 8. Membership application for studentUser
    studentMembership = new Membership({
      userId: studentUser.id,
      user: studentUser._id,
      memberNumber: studentUser.memberNumber,
      status: 'PENDING',
      statement: 'Active campus robotics club contributor.',
    });
    await studentMembership.save();

    // 9. Dues obligation for studentUser
    studentDues = new MembershipDues({
      membershipId: studentMembership.id,
      membership: studentMembership._id,
      userId: studentUser.id,
      user: studentUser._id,
      title: 'Annual Student Association Dues 2026-2027',
      academicTerm: `TERM_${ts}`,
      amount: 400,
      currency: 'INR',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
      assessedBy: presidentUser.id,
    });
    await studentDues.save();

    // 10. Task for Volunteer A
    taskForVolunteerA = new VolunteerTask({
      title: 'Setup Auditorium QR Check-In Desk',
      description: 'Prepare scanner hardware and badge printing tables.',
      volunteerId: volunteerA.id,
      volunteer: volunteerA._id,
      assignedBy: organizerUser.id,
      eventId: testEvent.id,
      event: testEvent._id,
      status: 'PENDING',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    await taskForVolunteerA.save();
  });

  afterAll(async () => {
    // Cleanup test records
    await User.deleteMany({
      email: {
        $in: [
          studentUser?.email,
          volunteerA?.email,
          volunteerB?.email,
          treasurerUser?.email,
          presidentUser?.email,
        ],
      },
    });
    if (organizerUser) await Organizer.deleteOne({ id: organizerUser.id });
    if (testEvent) await Event.deleteOne({ id: testEvent.id });
    if (studentMembership) await Membership.deleteOne({ id: studentMembership.id });
    if (studentDues) await MembershipDues.deleteOne({ id: studentDues.id });
    await VolunteerTask.deleteMany({ volunteerId: { $in: [volunteerA?.id, volunteerB?.id] } });
    await AuditLog.deleteMany({ actorId: { $in: [presidentUser?.id, treasurerUser?.id, volunteerA?.id] } });
    await disconnectDB();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PRESIDENT PORTAL & GOVERNANCE WORKFLOWS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('President Portal & Governance Workflows', () => {
    it('GET /api/admin/dashboard should provide live membership, event, and operational alert metrics for President', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('totalUsers');
      expect(data).toHaveProperty('totalRegisteredAccounts');
      expect(data).toHaveProperty('membershipMetrics');
      expect(data.membershipMetrics).toHaveProperty('pending');
      expect(data.membershipMetrics).toHaveProperty('approved');
      expect(data.membershipMetrics).toHaveProperty('active');
      expect(data).toHaveProperty('eventMetrics');
      expect(data).toHaveProperty('operationalAlerts');
    });

    it('GET /api/memberships/pending should return pending applications for President', async () => {
      const res = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((m) => m.id === studentMembership.id);
      expect(found).toBeDefined();
      expect(found.status).toBe('PENDING');
    });

    it('Unauthorized roles (Student, Volunteer) cannot access membership approval endpoints', async () => {
      const resStudent = await request(app)
        .post(`/api/memberships/${studentMembership.id}/approve`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ note: 'Self approve' });
      expect(resStudent.status).toBe(403);

      const resVolunteer = await request(app)
        .post(`/api/memberships/${studentMembership.id}/approve`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ note: 'Volunteer approve' });
      expect(resVolunteer.status).toBe(403);
    });

    it('President can approve a student application with optional reviewer note', async () => {
      const res = await request(app)
        .post(`/api/memberships/${studentMembership.id}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ note: 'Approved for 2026-2027 term', duesAmount: 300 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.reviewerNote).toBe('Approved for 2026-2027 term');
    });


    it('President can assign permitted delegated roles (ORGANIZER, TREASURER, VOLUNTEER)', async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ userId: studentUser.id, role: 'VOLUNTEER' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roles).toContain('VOLUNTEER');

      // Verify DB persistence
      const updatedUser = await User.findOne({ id: studentUser.id });
      expect(updatedUser.roles).toContain('VOLUNTEER');
    });

    it('President role delegation cannot grant PRESIDENT role (role escalation rejection)', async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ userId: studentUser.id, role: 'PRESIDENT' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('President cannot self-assign or revoke roles from themselves', async () => {
      const resSelf = await request(app)
        .post('/api/roles/revoke')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ userId: presidentUser.id, role: 'PRESIDENT' });

      expect(resSelf.status).toBe(403);
      expect(resSelf.body.success).toBe(false);
    });

    it('GET /api/admin/audit-logs should return paginated audit logs for President with filter support', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?page=0&size=10')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('content');
      expect(Array.isArray(res.body.data.content)).toBe(true);
    });

    it('Student cannot access audit logs', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TREASURER PORTAL & FINANCIAL OVERSIGHT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Treasurer Portal & Financial Oversight', () => {
    it('GET /api/treasurer/overview should return verified dues, booking income, and Phase 5 status', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('totalAssessed');
      expect(data.summary).toHaveProperty('totalCollected');
      expect(data.summary).toHaveProperty('totalOutstanding');
      expect(data.summary).toHaveProperty('totalVerifiedIncome');
      expect(data).toHaveProperty('recentTransactions');
      expect(data).toHaveProperty('phase5Status');
      expect(data.phase5Status.ledger.modeled).toBe(false);
    });

    it('GET /api/treasurer/reports should return term breakdown and dues status distribution', async () => {
      const res = await request(app)
        .get('/api/treasurer/reports')
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('termReports');
      expect(data).toHaveProperty('duesStatusBreakdown');
      expect(data).toHaveProperty('paymentBreakdown');
    });

    it('Student and Volunteer roles cannot access /api/treasurer/overview or /api/treasurer/reports', async () => {
      const resStudent = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(resStudent.status).toBe(403);

      const resVolunteer = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${volunteerAToken}`);
      expect(resVolunteer.status).toBe(403);
    });

    it('GET /api/dues should list dues obligations with student information and summary metrics', async () => {
      const res = await request(app)
        .get('/api/dues')
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('content');
      expect(Array.isArray(data.content)).toBe(true);

      const foundDue = data.content.find((d) => d.id === studentDues.id);
      expect(foundDue).toBeDefined();
      expect(foundDue.amount).toBe(400);
      expect(foundDue.status).toBe('PENDING');
      expect(foundDue.user).toBeDefined();
      expect(foundDue.user.name).toBe('Phase 4 Student');
    });

    it('Student cannot access /api/dues (only /api/dues/my for own records)', async () => {
      const res = await request(app)
        .get('/api/dues')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('Treasurer can waive a dues obligation with reason', async () => {
      const res = await request(app)
        .post(`/api/dues/${studentDues.id}/waive`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ reason: 'Leadership scholarship waiver' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('WAIVED');
      expect(res.body.data.waiverReason).toBe('Leadership scholarship waiver');

      // Verify in DB
      const dbDue = await MembershipDues.findOne({ id: studentDues.id });
      expect(dbDue.status).toBe('WAIVED');
    });

    it('Unauthorized student cannot waive dues obligations', async () => {
      const res = await request(app)
        .post(`/api/dues/${studentDues.id}/waive`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ reason: 'Unauthorized waiver attempt' });

      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. VOLUNTEER PORTAL & TASK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Volunteer Portal & Task Management', () => {
    it('GET /api/volunteer/overview should return volunteer task summary and event duties', async () => {
      const res = await request(app)
        .get('/api/volunteer/overview')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('totalTasks');
      expect(data.summary).toHaveProperty('pendingTasks');
      expect(data.summary).toHaveProperty('completedTasks');
      expect(data).toHaveProperty('upcomingDuties');
      expect(data).toHaveProperty('phase5Roadmap');
      expect(data.phase5Roadmap.reimbursements.status).toBe('PENDING_PHASE_5');
    });

    it('Volunteer can list own assigned tasks via GET /api/volunteer/tasks', async () => {
      const res = await request(app)
        .get('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${volunteerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const foundTask = res.body.data.find((t) => t.id === taskForVolunteerA.id);
      expect(foundTask).toBeDefined();
      expect(foundTask.title).toBe('Setup Auditorium QR Check-In Desk');
      expect(foundTask.status).toBe('PENDING');
      expect(foundTask.event).toBeDefined();
    });

    it('Cross-user task access is strictly rejected (Volunteer B cannot read Volunteer A task)', async () => {
      const res = await request(app)
        .get(`/api/volunteer/tasks/${taskForVolunteerA.id}`)
        .set('Authorization', `Bearer ${volunteerBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Volunteer A can transition task from PENDING to IN_PROGRESS', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${taskForVolunteerA.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_PROGRESS');

      const dbTask = await VolunteerTask.findOne({ id: taskForVolunteerA.id });
      expect(dbTask.status).toBe('IN_PROGRESS');
    });

    it('Invalid task status transition is rejected with 400', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${taskForVolunteerA.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ status: 'FABRICATED_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('Volunteer A can complete task with completion notes', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${taskForVolunteerA.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          status: 'COMPLETED',
          completionNotes: 'Auditorium desk configured with 3 scanners and badge printer.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.completionNotes).toContain('Auditorium desk configured');
      expect(res.body.data.completedAt).toBeDefined();

      const dbTask = await VolunteerTask.findOne({ id: taskForVolunteerA.id });
      expect(dbTask.status).toBe('COMPLETED');
    });

    it('Completed task cannot be reverted to PENDING or IN_PROGRESS', async () => {
      const res = await request(app)
        .patch(`/api/volunteer/tasks/${taskForVolunteerA.id}/status`)
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({ status: 'PENDING' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('Volunteer cannot assign tasks to themselves (prevents self-assignment privilege abuse)', async () => {
      const res = await request(app)
        .post('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${volunteerAToken}`)
        .send({
          title: 'Self-assigned Task',
          volunteerId: volunteerA.id,
        });

      // Volunteer does not have role ORGANIZER/PRESIDENT to create tasks
      expect(res.status).toBe(403);
    });

    it('Organizer or President can assign a new task to a volunteer', async () => {
      const res = await request(app)
        .post('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Guest Escort Assistance',
          description: 'Guide university dignitaries to front row seats.',
          volunteerId: volunteerB.id,
          eventId: testEvent.id,
          priority: 'MEDIUM',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.volunteerId).toBe(volunteerB.id);
      expect(res.body.data.status).toBe('PENDING');

      // Verify Volunteer B can see their assigned task
      const resVolB = await request(app)
        .get('/api/volunteer/tasks')
        .set('Authorization', `Bearer ${volunteerBToken}`);

      expect(resVolB.status).toBe(200);
      const assigned = resVolB.body.data.find((t) => t.id === res.body.data.id);
      expect(assigned).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. STUDENT & ORGANIZER REGRESSION VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Student & Organizer Regression Verification', () => {
    it('Student can access own profile and membership status via GET /api/memberships/my', async () => {
      const res = await request(app)
        .get('/api/memberships/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(studentUser.id);
      expect(res.body.data.status).toBe('APPROVED');
    });

    it('Student can inspect own dues via GET /api/dues/my', async () => {
      const res = await request(app)
        .get('/api/dues/my')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe(studentUser.id);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('Organizer can retrieve dashboard and manage events', async () => {
      const res = await request(app)
        .get('/api/organizer/dashboard')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
