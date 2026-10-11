import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { User, Organizer, Counter } from '../models/index.js';
import { env } from '../config/env.js';
import { otpStore } from '../security/otpStore.js';
import { refreshTokenStore } from '../security/refreshTokenStore.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_auth_test';

describe('Authentication & User Management Integration Tests', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    await User.init();
    await Organizer.init();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Organizer.deleteMany({});
    await Counter.deleteMany({});
    otpStore.clear();
    refreshTokenStore.clear();
    memoryRateLimiter.reset();
  });

  describe('User Registration & Login', () => {
    it('POST /api/auth/user/register should register user, hash password, and return AuthResponse', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Jane Student',
          email: 'jane.student@college.edu',
          password: 'Password123!',
          phone: '9876543210',
          city: 'Chennai',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.tokenType).toBe('Bearer');
      expect(res.body.data.user.email).toBe('jane.student@college.edu');
      expect(res.body.data.user.role).toBe('USER');
      expect(res.body.data.user.id).toBeGreaterThan(0);

      // Verify user in database
      const dbUser = await User.findOne({ email: 'jane.student@college.edu' });
      expect(dbUser).toBeDefined();
      expect(dbUser.passwordHash).not.toBe('Password123!');
      expect(dbUser.passwordHash).toMatch(/^\$2[aby]\$/); // BCrypt format
      expect(dbUser.userCode).toBe(`USR${String(dbUser.id).padStart(4, '0')}`);
    });

    it('POST /api/auth/user/register should reject duplicate email registration with 409 Conflict', async () => {
      await request(app).post('/api/auth/user/register').send({
        name: 'First User',
        email: 'duplicate@college.edu',
        password: 'Password123!',
      });

      const res = await request(app).post('/api/auth/user/register').send({
        name: 'Second User',
        email: 'duplicate@college.edu',
        password: 'DifferentPassword123!',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('User Already Exists');
    });

    it('POST /api/auth/user/login should authenticate with valid credentials', async () => {
      await request(app).post('/api/auth/user/register').send({
        name: 'Login User',
        email: 'login@college.edu',
        password: 'SecretPassword123',
      });

      const res = await request(app).post('/api/auth/user/login').send({
        email: 'login@college.edu',
        password: 'SecretPassword123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('login@college.edu');
    });

    it('POST /api/auth/user/login should reject invalid password with 400', async () => {
      await request(app).post('/api/auth/user/register').send({
        name: 'Valid User',
        email: 'valid@college.edu',
        password: 'CorrectPassword123',
      });

      const res = await request(app).post('/api/auth/user/login').send({
        email: 'valid@college.edu',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid Credentials');
    });

    it('should lock user account after 5 consecutive failed login attempts', async () => {
      await request(app).post('/api/auth/user/register').send({
        name: 'Target Account',
        email: 'lockout@college.edu',
        password: 'RealPassword123',
      });

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        const res = await request(app).post('/api/auth/user/login').send({
          email: 'lockout@college.edu',
          password: 'WrongPassword',
        });
        expect(res.status).toBe(400);
      }

      // 5th wrong attempt triggers lock
      const lockRes = await request(app).post('/api/auth/user/login').send({
        email: 'lockout@college.edu',
        password: 'WrongPassword',
      });

      expect(lockRes.status).toBe(403);
      expect(lockRes.body.message).toContain('Account locked');

      // Subsequent attempt with even the correct password is blocked
      const blockedRes = await request(app).post('/api/auth/user/login').send({
        email: 'lockout@college.edu',
        password: 'RealPassword123',
      });
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.message).toContain('Account is locked');
    });
  });

  describe('Organizer Registration & Login', () => {
    it('should register and authenticate organizers', async () => {
      const regRes = await request(app)
        .post('/api/auth/organizer/register')
        .send({
          organizerName: 'Prof. Alan Turing',
          organizationName: 'AI Society',
          email: 'organizer@univ.edu',
          password: 'OrgPassword123!',
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.data.user.role).toBe('ORGANIZER');
      expect(regRes.body.data.user.name).toBe('Prof. Alan Turing');

      const loginRes = await request(app)
        .post('/api/auth/organizer/login')
        .send({
          email: 'organizer@univ.edu',
          password: 'OrgPassword123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('ORGANIZER');
    });
  });

  describe('JWT Authentication Middleware & Error Contracts', () => {
    let userToken;
    let organizerToken;

    beforeEach(async () => {
      const uRes = await request(app).post('/api/auth/user/register').send({
        name: 'Student User',
        email: 'student@test.edu',
        password: 'Password123',
      });
      userToken = uRes.body.data.accessToken;

      const oRes = await request(app).post('/api/auth/organizer/register').send({
        organizerName: 'Organizer User',
        organizationName: 'Campus Club',
        email: 'organizer@test.edu',
        password: 'Password123',
      });
      organizerToken = oRes.body.data.accessToken;
    });

    it('should reject protected route when Authorization header is missing', async () => {
      const res = await request(app).get('/api/user/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNAUTHORIZED');
      expect(res.body.message).toContain('No token provided');
    });

    it('should reject expired tokens with exact TOKEN_EXPIRED error code for React silent refresh', async () => {
      // Create an expired JWT token
      const expiredToken = jwt.sign(
        { id: 1, role: 'USER' },
        env.JWT_SECRET,
        {
          subject: 'student@test.edu',
          issuer: 'event-booking-system',
          expiresIn: -10, // expired 10 seconds ago
        }
      );

      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('TOKEN_EXPIRED');
      expect(res.body.message).toBe('Access token expired');
    });

    it('should inject X-Token-Expiry header on authenticated responses', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-token-expiry']).toBeDefined();
      expect(Number(res.headers['x-token-expiry'])).toBeGreaterThan(Date.now());
    });

    it('should enforce role restrictions between users and organizers', async () => {
      // User accessing user profile -> 200 OK
      const uOk = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`);
      expect(uOk.status).toBe(200);

      // User attempting to access organizer profile -> 403 FORBIDDEN
      const uForbidden = await request(app)
        .get('/api/organizer/profile')
        .set('Authorization', `Bearer ${userToken}`);
      expect(uForbidden.status).toBe(403);
      expect(uForbidden.body.errorCode).toBe('FORBIDDEN');

      // Organizer accessing organizer profile -> 200 OK
      const oOk = await request(app)
        .get('/api/organizer/profile')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(oOk.status).toBe(200);

      // Organizer attempting to access user profile -> 403 FORBIDDEN
      const oForbidden = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(oForbidden.status).toBe(403);
      expect(oForbidden.body.errorCode).toBe('FORBIDDEN');
    });
  });

  describe('Session Status & Token Refresh', () => {
    it('GET /api/auth/session-status should report remaining session duration', async () => {
      const reg = await request(app).post('/api/auth/user/register').send({
        name: 'Session Tester',
        email: 'session@test.edu',
        password: 'Password123',
      });
      const token = reg.body.data.accessToken;

      const res = await request(app)
        .get('/api/auth/session-status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(true);
      expect(res.body.data.role).toBe('USER');
      expect(res.body.data.remainingMs).toBeGreaterThan(0);
      expect(res.body.data.expiresIn).toBe(30 * 60 * 1000); // Exactly 30 minutes (1,800,000 ms)
      expect(res.body.data.remainingMs).toBeLessThanOrEqual(30 * 60 * 1000);
    });

    it('POST /api/auth/refresh-token should issue fresh tokens and prevent replay attacks', async () => {
      const reg = await request(app).post('/api/auth/user/register').send({
        name: 'Refresh Tester',
        email: 'refresh@test.edu',
        password: 'Password123',
      });
      const { refreshToken } = reg.body.data;

      // 1. Initial refresh succeeds
      const refreshRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();
      expect(refreshRes.body.data.refreshToken).toBeDefined();

      // 2. Replay attack with same single-use refresh token must fail with 401
      const replayRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toBe('TOKEN_ALREADY_USED');
    });
  });

  describe('OTP Generation & Verification', () => {
    it('should generate, send, and verify OTP codes', async () => {
      await request(app).post('/api/auth/user/register').send({
        name: 'OTP User',
        email: 'otp.user@college.edu',
        password: 'Password123',
      });

      // 1. Send OTP
      const sendRes = await request(app).post('/api/auth/otp/send').send({
        email: 'otp.user@college.edu',
        role: 'USER',
      });

      expect(sendRes.status).toBe(200);
      expect(sendRes.body.data.emailSent).toBe(true);

      // Retrieve generated OTP from store for verification testing
      const pendingEntry = otpStore.store.get('otp.user@college.edu');
      expect(pendingEntry).toBeDefined();
      const generatedOtp = pendingEntry.otp;

      // 2. Verify with wrong code -> 400
      const wrongRes = await request(app).post('/api/auth/otp/verify').send({
        email: 'otp.user@college.edu',
        otp: '000000',
      });
      expect(wrongRes.status).toBe(400);

      // 3. Verify with correct code -> 200 & marks emailVerified
      const okRes = await request(app).post('/api/auth/otp/verify').send({
        email: 'otp.user@college.edu',
        otp: generatedOtp,
      });

      expect(okRes.status).toBe(200);
      expect(okRes.body.data.verified).toBe(true);

      // Verify database updated
      const user = await User.findOne({ email: 'otp.user@college.edu' });
      expect(user.emailVerified).toBe(true);
    });
  });

  describe('User Profile & Password Management', () => {
    let token;

    beforeEach(async () => {
      const reg = await request(app).post('/api/auth/user/register').send({
        name: 'Profile Tester',
        email: 'profile@test.edu',
        password: 'OldPassword123',
        city: 'Mumbai',
      });
      token = reg.body.data.accessToken;
    });

    it('GET /api/user/profile and PUT /api/user/profile should read and update profile', async () => {
      const getRes = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe('Profile Tester');
      expect(getRes.body.data.city).toBe('Mumbai');

      const updateRes = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          city: 'Pune',
          phone: '9998887776',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Updated Name');
      expect(updateRes.body.data.city).toBe('Pune');
    });

    it('PATCH /api/user/change-password should update credentials', async () => {
      // 1. Wrong old password fails
      const failRes = await request(app)
        .patch('/api/user/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'IncorrectOldPassword',
          newPassword: 'BrandNewPassword123',
        });

      expect(failRes.status).toBe(400);

      // 2. Correct old password succeeds
      const okRes = await request(app)
        .patch('/api/user/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'OldPassword123',
          newPassword: 'BrandNewPassword123',
        });

      expect(okRes.status).toBe(200);

      // 3. New password allows login
      const loginRes = await request(app).post('/api/auth/user/login').send({
        email: 'profile@test.edu',
        password: 'BrandNewPassword123',
      });

      expect(loginRes.status).toBe(200);
    });
  });
});
