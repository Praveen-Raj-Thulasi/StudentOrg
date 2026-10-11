import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User, Organizer } from '../models/index.js';
import { verifyToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';

describe('Phase 2 — Login Adaptation & Registration Restructuring Tests', () => {
  const timestamp = Date.now();
  const studentEmail = `phase2_student_${timestamp}@college.edu`;
  const password = 'StrongPassword123!';
  let studentUser = null;

  const multiRoleEmail = `phase2_multirole_${timestamp}@college.edu`;
  let multiRoleUser = null;

  const presidentEmail = `phase2_president_${timestamp}@college.edu`;
  let presidentUser = null;

  const organizerEmail = `phase2_org_${timestamp}@college.edu`;
  let organizerAccount = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();
    // 1. Create student account
    const studentRes = await request(app)
      .post('/api/auth/user/register')
      .send({
        email: studentEmail,
        password: password,
      });
    expect(studentRes.status).toBe(201);
    studentUser = await User.findOne({ email: studentEmail });

    // 2. Create multi-role user (STUDENT + VOLUNTEER + TREASURER)
    const multiRes = await request(app)
      .post('/api/auth/user/register')
      .send({
        email: multiRoleEmail,
        password: password,
      });
    expect(multiRes.status).toBe(201);
    multiRoleUser = await User.findOne({ email: multiRoleEmail });
    multiRoleUser.roles = ['STUDENT', 'VOLUNTEER', 'TREASURER'];
    await multiRoleUser.save();

    // 3. Create President user (STUDENT + PRESIDENT)
    const presRes = await request(app)
      .post('/api/auth/user/register')
      .send({
        email: presidentEmail,
        password: password,
      });
    expect(presRes.status).toBe(201);
    presidentUser = await User.findOne({ email: presidentEmail });
    presidentUser.roles = ['STUDENT', 'PRESIDENT'];
    await presidentUser.save();

    // 4. Create Organizer in Organizer collection
    const orgRes = await request(app)
      .post('/api/auth/organizer/register')
      .send({
        organizerName: 'Engineering Club',
        organizationName: 'Skyline Tech',
        email: organizerEmail,
        password: password,
      });
    expect(orgRes.status).toBe(201);
    organizerAccount = await Organizer.findOne({ email: organizerEmail });
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Registration Restructuring (Email and Password Only)', () => {
    it('should register a new student with ONLY email and password', async () => {
      const email = `minimal_reg_${timestamp}@college.edu`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({ email, password });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(email);
      expect(res.body.data.user.roles).toContain('STUDENT');
      expect(res.body.data.user.memberNumber).toMatch(/^MEM\d{4,}$/);

      const dbUser = await User.findOne({ email });
      expect(dbUser).not.toBeNull();
      expect(dbUser.roles).toEqual(['STUDENT']);
      expect(dbUser.name).toBe(email.split('@')[0]);
      expect(dbUser.emailVerified).toBe(false);
    });

    it('should prevent role escalation during registration', async () => {
      const email = `exploit_reg_${timestamp}@college.edu`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          email,
          password,
          role: 'ADMIN',
          roles: ['PRESIDENT', 'TREASURER', 'ORGANIZER'],
        });

      expect(res.status).toBe(201);
      const dbUser = await User.findOne({ email });
      expect(dbUser.roles).toEqual(['STUDENT']);
      expect(dbUser.role).toBe('USER');
      expect(res.body.data.user.roles).toEqual(['STUDENT']);
    });

    it('should reject invalid or weak registration payloads', async () => {
      // Missing password
      const resNoPw = await request(app)
        .post('/api/auth/user/register')
        .send({ email: `nopw_${timestamp}@college.edu` });
      expect(resNoPw.status).toBe(400);

      // Invalid email
      const resBadEmail = await request(app)
        .post('/api/auth/user/register')
        .send({ email: 'not-an-email', password });
      expect(resBadEmail.status).toBe(400);

      // Short password
      const resShortPw = await request(app)
        .post('/api/auth/user/register')
        .send({ email: `short_${timestamp}@college.edu`, password: '123' });
      expect(resShortPw.status).toBe(400);
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({ email: studentEmail, password });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Already Exists');
    });

    it('should preserve backward compatibility when legacy registration fields are sent', async () => {
      const email = `legacy_reg_${timestamp}@college.edu`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Legacy Jane',
          email,
          password,
          phone: '+15551234567',
          city: 'Metropolis',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.name).toBe('Legacy Jane');
      expect(res.body.data.user.roles).toContain('STUDENT');
      expect(res.body.data.user.memberNumber).toMatch(/^MEM\d{4,}$/);
    });
  });

  describe('2. Five-Portal Authentication & Authorization', () => {
    it('should allow authorized Student to log in to STUDENT portal', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: studentEmail,
          password,
          portal: 'STUDENT',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.roles).toContain('STUDENT');
    });

    it('should deny unauthorized Student from logging in to PRESIDENT, TREASURER, VOLUNTEER, or ORGANIZER portals', async () => {
      const privilegedPortals = ['PRESIDENT', 'TREASURER', 'VOLUNTEER', 'ORGANIZER'];

      for (const portal of privilegedPortals) {
        const res = await request(app)
          .post('/api/auth/user/login')
          .send({
            email: studentEmail,
            password,
            portal,
          });

        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe('FORBIDDEN_PORTAL_ACCESS');
        expect(res.body.message).toContain(`not authorized for the requested ${portal} portal`);
      }
    });

    it('should allow multi-role user to log in to any of their authorized portals', async () => {
      // Can access STUDENT
      const resStudent = await request(app)
        .post('/api/auth/user/login')
        .send({ email: multiRoleEmail, password, portal: 'STUDENT' });
      expect(resStudent.status).toBe(200);

      // Can access VOLUNTEER
      const resVolunteer = await request(app)
        .post('/api/auth/user/login')
        .send({ email: multiRoleEmail, password, portal: 'VOLUNTEER' });
      expect(resVolunteer.status).toBe(200);

      // Can access TREASURER
      const resTreasurer = await request(app)
        .post('/api/auth/user/login')
        .send({ email: multiRoleEmail, password, portal: 'TREASURER' });
      expect(resTreasurer.status).toBe(200);

      // CANNOT access PRESIDENT
      const resPresident = await request(app)
        .post('/api/auth/user/login')
        .send({ email: multiRoleEmail, password, portal: 'PRESIDENT' });
      expect(resPresident.status).toBe(403);
      expect(resPresident.body.errorCode).toBe('FORBIDDEN_PORTAL_ACCESS');
    });

    it('should allow President to access both PRESIDENT and STUDENT portals', async () => {
      const presRes = await request(app)
        .post('/api/auth/user/login')
        .send({ email: presidentEmail, password, portal: 'PRESIDENT' });
      expect(presRes.status).toBe(200);
      expect(presRes.body.data.user.roles).toContain('PRESIDENT');

      const studRes = await request(app)
        .post('/api/auth/user/login')
        .send({ email: presidentEmail, password, portal: 'STUDENT' });
      expect(studRes.status).toBe(200);
    });

    it('should allow Organizer in Organizer collection to log in to ORGANIZER portal', async () => {
      const res = await request(app)
        .post('/api/auth/organizer/login')
        .send({ email: organizerEmail, password, portal: 'ORGANIZER' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ORGANIZER');
    });

    it('should deny Organizer in Organizer collection from accessing STUDENT portal', async () => {
      const res = await request(app)
        .post('/api/auth/organizer/login')
        .send({ email: organizerEmail, password, portal: 'STUDENT' });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN_PORTAL_ACCESS');
    });

    it('should fail with 400 INVALID_CREDENTIALS for wrong password regardless of portal parameter', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: studentEmail,
          password: 'IncorrectPassword!',
          portal: 'PRESIDENT',
        });

      // Must fail password verification first without disclosing role authorization
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid Credentials');
    });

    it('should preserve backward-compatible login when portal parameter is omitted', async () => {
      const resUser = await request(app)
        .post('/api/auth/user/login')
        .send({ email: studentEmail, password });
      expect(resUser.status).toBe(200);

      const resOrg = await request(app)
        .post('/api/auth/organizer/login')
        .send({ email: organizerEmail, password });
      expect(resOrg.status).toBe(200);
    });
  });

  describe('3. Session Continuity & Token Claims Verification', () => {
    it('should issue tokens with authoritative roles and memberNumber preserved across refresh', async () => {
      const loginRes = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: multiRoleUser.email,
          password,
          portal: 'TREASURER',
        });

      expect(loginRes.status).toBe(200);
      const { accessToken, refreshToken, user } = loginRes.body.data;
      expect(user.memberNumber).toMatch(/^MEM\d{4,}$/);
      expect(user.roles).toContain('TREASURER');
      expect(user.roles).toContain('STUDENT');

      // Verify claims in access token
      const claims = verifyToken(accessToken);
      expect(claims.roles).toEqual(expect.arrayContaining(['TREASURER', 'STUDENT']));
      expect(claims.memberNumber).toBe(user.memberNumber);

      // Refresh token
      const refreshRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.user.roles).toEqual(expect.arrayContaining(['TREASURER', 'STUDENT']));
      expect(refreshRes.body.data.user.memberNumber).toBe(user.memberNumber);
    });
  });
});
