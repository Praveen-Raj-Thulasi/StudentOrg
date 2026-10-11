import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User, AuditLog } from '../models/index.js';
import { RoleAssignmentService } from '../services/roleAssignment.service.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Fix President Portal Login — Compliance & Verification Tests', () => {
  const presidentEmail = 'president@skyline.edu';
  const presidentPassword = process.env.PRESIDENT_PASSWORD || 'President@Skyline2026';
  const timestamp = Date.now();
  const studentEmail = `student_guard_${timestamp}@skyline.edu`;
  const studentPassword = 'StudentPass123!';

  let presidentToken = null;
  let studentToken = null;

  beforeAll(async () => {
    await connectDB();
    memoryRateLimiter.reset();

    // 1. Ensure President is provisioned
    const prov = await RoleAssignmentService.provisionPresident({
      email: presidentEmail,
      password: presidentPassword,
      name: 'Skyline President',
      transfer: true,
    });
    expect(prov.user).toBeDefined();

    // 2. Login as President to obtain token
    const presLoginRes = await request(app)
      .post('/api/auth/user/login')
      .send({
        email: presidentEmail,
        password: presidentPassword,
        portal: 'PRESIDENT',
      });
    expect(presLoginRes.status).toBe(200);
    presidentToken = presLoginRes.body.data.accessToken;

    // 3. Register a normal student
    const studRegRes = await request(app)
      .post('/api/auth/user/register')
      .send({
        email: studentEmail,
        password: studentPassword,
      });
    expect(studRegRes.status).toBe(201);
    studentToken = studRegRes.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. President Account Provisioning & Single-Active-President Integrity', () => {
    it('should reuse existing President account without creating duplicates (idempotency)', async () => {
      const usersBefore = await User.countDocuments({ email: presidentEmail });
      expect(usersBefore).toBe(1);

      // Call provisionPresident again with the same email
      const result = await RoleAssignmentService.provisionPresident({
        email: presidentEmail,
        password: presidentPassword,
      });

      expect(result.alreadyProvisioned).toBe(true);
      expect(result.user.email).toBe(presidentEmail);

      const usersAfter = await User.countDocuments({ email: presidentEmail });
      expect(usersAfter).toBe(1); // No duplicate user created
    });

    it('should enforce password hashing and secure credential storage', async () => {
      const user = await User.findOne({ email: presidentEmail });
      expect(user).toBeDefined();
      expect(user.passwordHash).not.toBe(presidentPassword);
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
    });

    it('should prevent multiple active Presidents without explicit administrative transfer', async () => {
      const duplicateEmail = `impostor_pres_${Date.now()}@skyline.edu`;

      await expect(
        RoleAssignmentService.provisionPresident({
          email: duplicateEmail,
          password: 'AnotherPassword123!',
          transfer: false,
        })
      ).rejects.toThrow(/An active President is already provisioned/i);

      // Verify no user was created with duplicate President role
      const impostor = await User.findOne({ email: duplicateEmail });
      expect(impostor).toBeNull();
    });
  });

  describe('2. Dedicated President Authentication & Credential Verification', () => {
    it('should authenticate President with valid credentials on PRESIDENT portal', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: presidentEmail,
          password: presidentPassword,
          portal: 'PRESIDENT',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(presidentEmail);
      expect(res.body.data.user.roles).toContain('PRESIDENT');
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject invalid President password with 400 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: presidentEmail,
          password: 'IncorrectPassword999!',
          portal: 'PRESIDENT',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid Credentials/i);
    });

    it('should reject non-president student from logging in to PRESIDENT portal', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: studentEmail,
          password: studentPassword,
          portal: 'PRESIDENT',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized for the requested PRESIDENT portal/i);
    });
  });

  describe('3. Backend Authorization & Role-Based Access Control', () => {
    it('should reject unauthenticated requests to President endpoints with 401', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(401);
    });

    it('should deny student role access to President endpoints with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should grant President access to President endpoints with valid token', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should deny student access to President membership approval endpoints', async () => {
      const res = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should grant President access to President membership approval endpoints', async () => {
      const res = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Registration Security & Public Protection', () => {
    it('should strictly prohibit public registration for the President account', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          email: 'president@skyline.edu',
          password: 'HackerPassword123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Public registration for the President account is prohibited/i);
    });

    it('should allow normal student registration to work with standard STUDENT role only', async () => {
      const normalEmail = `legit_student_${Date.now()}@skyline.edu`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          email: normalEmail,
          password: 'StudentSecurePass1!',
          role: 'ADMIN', // Attacker attempt to escalate role
          roles: ['PRESIDENT', 'STUDENT'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.roles).toEqual(['STUDENT']); // Role escalation prevented
      expect(res.body.data.user.role).toBe('USER');

      const savedUser = await User.findOne({ email: normalEmail });
      expect(savedUser.roles).toEqual(['STUDENT']);
      expect(savedUser.role).toBe('USER');
    });
  });

  describe('5. Frontend Routing and Dedicated President Login Contracts', () => {
    it('should verify App.jsx redirects unauthenticated users to /admin/login when accessing President routes', () => {
      const appJsxPath = path.resolve(__dirname, '../../../frontend/src/App.jsx');
      const appJsxContent = fs.readFileSync(appJsxPath, 'utf8');

      // Check PrivateRoute redirection to /admin/login
      expect(appJsxContent).toContain('isPresidentRoute');
      expect(appJsxContent).toContain('<Navigate to="/admin/login" replace />');

      // Check that /admin/login route is configured
      expect(appJsxContent).toContain('path="/admin/login"');
      expect(appJsxContent).toContain('defaultPortal="president"');
      expect(appJsxContent).toContain('isDedicatedPresident={true}');
    });

    it('should verify Login.jsx renders fixed read-only email and omits registration link on President login', () => {
      const loginJsxPath = path.resolve(__dirname, '../../../frontend/src/pages/auth/Login.jsx');
      const loginJsxContent = fs.readFileSync(loginJsxPath, 'utf8');

      // Fixed email
      expect(loginJsxContent).toContain('president@skyline.edu');
      expect(loginJsxContent).toContain('readOnly={isPresident}');

      // No register link when isPresident is true
      expect(loginJsxContent).toContain('{!isPresident ? (');
      expect(loginJsxContent).toContain('Sign up free');
    });

    it('should verify Login.jsx bypasses OTP verification for President and logs in directly', () => {
      const loginJsxPath = path.resolve(__dirname, '../../../frontend/src/pages/auth/Login.jsx');
      const loginJsxContent = fs.readFileSync(loginJsxPath, 'utf8');

      // Direct login for President bypassing OTP
      expect(loginJsxContent).toContain('if (isPresident) {');
      expect(loginJsxContent).toContain('login(payload);');
      expect(loginJsxContent).toContain("toast.success('Welcome back, President!');");
      expect(loginJsxContent).toContain('navigate(dest, { replace: true });');
    });

    it('should verify OtpVerify.jsx redirects President away without challenging for OTP', () => {
      const otpVerifyJsxPath = path.resolve(__dirname, '../../../frontend/src/pages/auth/OtpVerify.jsx');
      const otpVerifyJsxContent = fs.readFileSync(otpVerifyJsxPath, 'utf8');

      expect(otpVerifyJsxContent).toContain("if (email === 'president@skyline.edu')");
      expect(otpVerifyJsxContent).toContain("navigate('/admin/login', { replace: true })");
    });
  });

  describe('6. OTP Removal for President Login (Backend & Scope Verification)', () => {
    it('should issue tokens directly upon email & password login for President without OTP requirement', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: presidentEmail,
          password: presidentPassword,
          portal: 'PRESIDENT',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(presidentEmail);
      expect(res.body.data.user.roles).toContain('PRESIDENT');
    });

    it('should bypass OTP generation and return notRequired when requesting OTP for President', async () => {
      const res = await request(app)
        .post('/api/auth/otp/send')
        .send({
          email: presidentEmail,
          role: 'USER',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.emailSent).toBe(false);
      expect(res.body.data.notRequired).toBe(true);
    });

    it('should preserve OTP generation and delivery requirements for normal student accounts', async () => {
      const studentEmailForOtp = `student_otp_test_${Date.now()}@skyline.edu`;
      // Register student first
      await request(app)
        .post('/api/auth/user/register')
        .send({
          email: studentEmailForOtp,
          password: 'Password123!',
        });

      const res = await request(app)
        .post('/api/auth/otp/send')
        .send({
          email: studentEmailForOtp,
          role: 'USER',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // In development/test mode, OTP is either generated or pending
      expect(res.body.data.notRequired).toBeUndefined();
    });
  });
});

