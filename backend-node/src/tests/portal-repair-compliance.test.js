import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { User, Membership, MembershipDues, Counter, AuditLog } from '../models/index.js';
import { RoleAssignmentService } from '../services/roleAssignment.service.js';
import { MembershipService } from '../services/membership.service.js';
import { hashPassword } from '../utils/password.js';

describe('Portal, Registration & Popup Repair — Compliance Tests', () => {
  let presidentToken;
  let presidentUser;
  let studentUser;
  let studentToken;

  beforeAll(async () => {
    await connectDB();
    memoryRateLimiter.reset();

    const presidentPassword = process.env.PRESIDENT_PASSWORD || 'President@Skyline2026';

    // 1. Ensure President is provisioned
    const provisionRes = await RoleAssignmentService.provisionPresident({
      email: 'president@skyline.edu',
      password: presidentPassword,
      name: 'Skyline Hub President',
      transfer: true,
    });
    presidentUser = provisionRes.user;

    const presLogin = await request(app)
      .post('/api/auth/user/login')
      .send({
        email: 'president@skyline.edu',
        password: presidentPassword,
        portal: 'PRESIDENT',
      });
    expect(presLogin.status).toBe(200);
    presidentToken = presLogin.body.data.accessToken;

    // 2. Ensure test student exists
    const studentEmail = `repair_test_student_${Date.now()}@skyline.edu`;
    const regRes = await request(app)
      .post('/api/auth/user/register')
      .send({
        email: studentEmail,
        password: 'StudentSecure2026!',
        name: 'Portal Test Student',
      });
    studentToken = regRes.body.data.accessToken;
    studentUser = await User.findOne({ email: studentEmail });
  });

  describe('1. Elimination of Intrusive Browser Popups', () => {
    it('should have zero window.alert, window.confirm, and window.prompt calls in frontend src', () => {
      const frontendSrc = path.resolve(process.cwd(), '../frontend/src');
      
      const checkFiles = (dir) => {
        let violations = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            violations = violations.concat(checkFiles(fullPath));
          } else if (/\.(jsx|js|tsx|ts)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Check for window.alert / alert(
            if (/\balert\s*\(/.test(content)) violations.push(`alert in ${entry.name}`);
            if (/\bconfirm\s*\(/.test(content)) violations.push(`confirm in ${entry.name}`);
            if (/\bprompt\s*\(/.test(content)) violations.push(`prompt in ${entry.name}`);
          }
        }
        return violations;
      };

      const foundViolations = checkFiles(frontendSrc);
      expect(foundViolations).toEqual([]);
    });

    it('should verify Approvals.jsx uses ConfirmModal and ReasonModal components', () => {
      const approvalsPath = path.resolve(process.cwd(), '../frontend/src/pages/admin/Approvals.jsx');
      const content = fs.readFileSync(approvalsPath, 'utf-8');
      expect(content).toContain('ConfirmModal');
      expect(content).toContain('ReasonModal');
      expect(content).not.toContain('window.prompt');
      expect(content).not.toContain('window.confirm');
    });

    it('should verify MyEvents.jsx and MyBookings.jsx use ConfirmModal for cancellations', () => {
      const myEventsPath = path.resolve(process.cwd(), '../frontend/src/pages/organizer/MyEvents.jsx');
      const myBookingsPath = path.resolve(process.cwd(), '../frontend/src/pages/user/MyBookings.jsx');
      const eventsContent = fs.readFileSync(myEventsPath, 'utf-8');
      const bookingsContent = fs.readFileSync(myBookingsPath, 'utf-8');

      expect(eventsContent).toContain('ConfirmModal');
      expect(bookingsContent).toContain('ConfirmModal');
      expect(eventsContent).not.toContain('window.confirm');
      expect(bookingsContent).not.toContain('window.confirm');
    });
  });

  describe('2. Public Registration Security & Role Protection', () => {
    it('should strictly ignore client-supplied VOLUNTEER role during public registration', async () => {
      const email = `try_volunteer_${Date.now()}@skyline.edu`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          email,
          password: 'Password123!',
          role: 'VOLUNTEER',
          roles: ['VOLUNTEER', 'STUDENT'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.roles).toEqual(['STUDENT']);
      expect(res.body.data.user.role).toBe('USER');

      const saved = await User.findOne({ email });
      expect(saved.roles).toEqual(['STUDENT']);
      expect(saved.role).toBe('USER');
    });

    it('should strictly ignore client-supplied TREASURER role during public registration', async () => {
      const email = `try_treasurer_${Date.now()}@skyline.edu`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          email,
          password: 'Password123!',
          role: 'TREASURER',
          roles: ['TREASURER', 'STUDENT'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.roles).toEqual(['STUDENT']);
      expect(res.body.data.user.role).toBe('USER');

      const saved = await User.findOne({ email });
      expect(saved.roles).toEqual(['STUDENT']);
      expect(saved.role).toBe('USER');
    });

    it('should strictly prohibit public registration for president@skyline.edu', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          email: 'president@skyline.edu',
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow authorized President to assign VOLUNTEER and TREASURER roles to a student', async () => {
      // President assigns VOLUNTEER
      const assignRes = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          targetUserId: studentUser.id,
          role: 'VOLUNTEER',
        });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.roles).toContain('VOLUNTEER');
      expect(assignRes.body.data.roles).toContain('STUDENT');

      // President assigns TREASURER
      const assignTreasRes = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          targetUserId: studentUser.id,
          role: 'TREASURER',
        });

      expect(assignTreasRes.status).toBe(200);
      expect(assignTreasRes.body.data.roles).toContain('TREASURER');
    });

    it('should prevent non-president student from assigning roles', async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          targetUserId: studentUser.id,
          role: 'TREASURER',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('3. Student-to-Member Conversion & Lifecycle', () => {
    let testApplicant;
    let applicantToken;
    let appliedMembership;

    beforeAll(async () => {
      const email = `membership_applicant_${Date.now()}@skyline.edu`;
      const reg = await request(app)
        .post('/api/auth/user/register')
        .send({
          email,
          password: 'PassWord123!',
          name: 'Jane Doe',
          organizationName: 'Computer Science',
        });
      applicantToken = reg.body.data.accessToken;
      testApplicant = await User.findOne({ email });
    });

    it('should allocate permanent sequential memberNumber on registration in MEM0001 format', () => {
      expect(testApplicant.memberNumber).toMatch(/^MEM\d{4,}$/);
    });

    it('should submit membership application with PENDING status', async () => {
      const res = await request(app)
        .post('/api/memberships/apply')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          statement: 'I want to contribute to the technical society.',
          department: 'Computer Science',
          yearOfStudy: '3rd Year',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.memberNumber).toBe(testApplicant.memberNumber);
      appliedMembership = res.body.data;
    });

    it('should prevent duplicate active or pending membership applications', async () => {
      const res = await request(app)
        .post('/api/memberships/apply')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          statement: 'Duplicate attempt',
        });

      expect(res.status).toBe(409);
    });

    it('should allow President to review pending applications and approve with dues', async () => {
      const pendingRes = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(pendingRes.status).toBe(200);
      const found = pendingRes.body.data.find((m) => m.id === appliedMembership.id);
      expect(found).toBeDefined();

      // Approve with assessed dues of INR 150
      const approveRes = await request(app)
        .post(`/api/memberships/${appliedMembership.id}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          note: 'Welcome to Skyline Association!',
          duesAmount: 150,
          term: '2026-2027',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.assessedDues).toBeDefined();
      expect(approveRes.body.data.assessedDues.amount).toBe(150);
    });

    it('should reflect assessed dues in student dues summary and require payment before active status', async () => {
      const duesRes = await request(app)
        .get('/api/dues/my')
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(duesRes.status).toBe(200);
      expect(duesRes.body.data.outstandingBalance).toBe(150);

      const memStatus = await request(app)
        .get('/api/memberships/my')
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(memStatus.body.data.status).toBe('APPROVED');
    });

    it('should activate membership upon verified dues settlement', async () => {
      const duesRes = await request(app)
        .get('/api/dues/my')
        .set('Authorization', `Bearer ${applicantToken}`);
      const dueId = duesRes.body.data.items[0].id;

      // Settle dues with verified gateway flag
      const settled = await MembershipService.settleDues(dueId, testApplicant.id, {
        paymentMethod: 'UPI',
        gatewayTransactionId: `TXN_MEM_${Date.now()}`,
        verifiedByGateway: true,
      });

      expect(settled.status).toBe('PAID');

      const myMem = await request(app)
        .get('/api/memberships/my')
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(myMem.body.data.status).toBe('ACTIVE');
      expect(myMem.body.data.dues.outstandingBalance).toBe(0);
    });
  });

  describe('4. OTP Requirements & Scoping', () => {
    it('should bypass OTP completely for President login', async () => {
      const otpRes = await request(app)
        .post('/api/auth/otp/send')
        .send({
          email: 'president@skyline.edu',
          role: 'USER',
        });

      expect(otpRes.status).toBe(200);
      expect(otpRes.body.data.notRequired).toBe(true);
      expect(otpRes.body.data.emailSent).toBe(false);
    });

    it('should require and deliver OTP for non-president roles', async () => {
      const studentEmail = `student_otp_check_${Date.now()}@skyline.edu`;
      await request(app)
        .post('/api/auth/user/register')
        .send({
          email: studentEmail,
          password: 'PassWord123!',
        });

      const otpRes = await request(app)
        .post('/api/auth/otp/send')
        .send({
          email: studentEmail,
          role: 'USER',
        });

      expect(otpRes.status).toBe(200);
      expect(otpRes.body.data.emailSent).toBe(true);
      expect(otpRes.body.data.notRequired).toBeUndefined();
    });
  });

  describe('5. Role-to-Portal Authorization Boundaries', () => {
    let unescalatedStudentToken;

    beforeAll(async () => {
      const reg = await request(app)
        .post('/api/auth/user/register')
        .send({
          email: `boundary_student_${Date.now()}@skyline.edu`,
          password: 'Password123!',
        });
      unescalatedStudentToken = reg.body.data.accessToken;
    });

    it('should deny student from accessing President admin dashboard', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${unescalatedStudentToken}`);

      expect(res.status).toBe(403);
    });

    it('should deny student from accessing Treasurer financial overview', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${unescalatedStudentToken}`);

      expect(res.status).toBe(403);
    });

    it('should deny student from accessing Organizer attendees list', async () => {
      const res = await request(app)
        .get('/api/organizer/attendees')
        .set('Authorization', `Bearer ${unescalatedStudentToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow President to access Admin dashboard metrics with real backend data', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.totalEvents).toBe('number');
      expect(typeof res.body.data.totalRegisteredAccounts).toBe('number');
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });
});
