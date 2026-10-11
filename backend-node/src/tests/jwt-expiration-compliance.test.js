import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { env } from '../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  parseDurationMs,
  getAccessExpirationMs,
  accessExpirationMs,
} from '../utils/jwt.js';
import { refreshTokenStore } from '../security/refreshTokenStore.js';
import { User, Organizer, Counter } from '../models/index.js';
import { RoleAssignmentService } from '../services/roleAssignment.service.js';

const TEST_DB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/event_booking_jwt_test';

describe('JWT 30-Minute Access Token Expiration Compliance Suite', () => {
  const testStudentEmail = `jwt_student_${Date.now()}@college.edu`;
  const testPresidentEmail = 'president@skyline.edu';
  const testPassword = 'Password123!';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }
    await User.init();
    await Organizer.init();
    await Counter.init();

    refreshTokenStore.clear();
    // Ensure President exists for president login check
    await RoleAssignmentService.provisionPresident({
      email: testPresidentEmail,
      name: 'Skyline President',
      password: testPassword,
      transfer: true,
    });
  }, 15000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    refreshTokenStore.clear();
  });

  describe('1. Configuration & Source of Truth Verification', () => {
    it('should have JWT_EXPIRES_IN configured to exactly 30m', () => {
      expect(env.JWT_EXPIRES_IN).toBe('30m');
    });

    it('should have JWT_REFRESH_EXPIRES_IN retained at 7d (not 30m)', () => {
      expect(env.JWT_REFRESH_EXPIRES_IN).toBe('7d');
    });

    it('should parse 30m duration into exactly 1,800,000 milliseconds', () => {
      expect(parseDurationMs('30m')).toBe(30 * 60 * 1000);
      expect(parseDurationMs('30m')).toBe(1800000);
    });

    it('should report exactly 1,800,000 ms from getAccessExpirationMs and accessExpirationMs', () => {
      expect(getAccessExpirationMs()).toBe(1800000);
      expect(accessExpirationMs).toBe(1800000);
    });
  });

  describe('2. Token Signing & Claims Verification', () => {
    it('should issue access tokens with lifetime of exactly 1800 seconds (30 minutes)', () => {
      const token = generateAccessToken({
        id: 101,
        email: 'test@college.edu',
        role: 'USER',
        roles: ['STUDENT'],
        memberNumber: 'MEM0001',
      });

      const decoded = decodeToken(token);
      expect(decoded).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      const lifetimeSeconds = decoded.exp - decoded.iat;
      expect(lifetimeSeconds).toBe(1800); // 30 minutes * 60 seconds
      expect(lifetimeSeconds).toBe(30 * 60);

      const verified = verifyToken(token);
      expect(verified.id).toBe(101);
      expect(verified.role).toBe('USER');
      expect(verified.roles).toContain('STUDENT');
      expect(verified.memberNumber).toBe('MEM0001');
    });

    it('should issue refresh tokens with lifetime of 7 days (604,800 seconds) retaining configured duration', () => {
      const { token: refreshToken, jti } = generateRefreshToken({
        id: 101,
        email: 'test@college.edu',
        role: 'USER',
        roles: ['STUDENT'],
      });

      expect(jti).toBeDefined();
      const decoded = decodeToken(refreshToken);
      expect(decoded.jti).toBe(jti);

      const refreshLifetimeSeconds = decoded.exp - decoded.iat;
      // 7 days = 7 * 24 * 60 * 60 = 604,800 seconds
      expect(refreshLifetimeSeconds).toBe(7 * 24 * 60 * 60);
      expect(refreshLifetimeSeconds).toBe(604800);

      // Verify refresh token expiration is distinctly NOT 30 minutes
      expect(refreshLifetimeSeconds).not.toBe(1800);

      const verified = verifyToken(refreshToken, true);
      expect(verified.id).toBe(101);
      expect(verified.jti).toBe(jti);
    });
  });

  describe('3. Registration, Login, & Session Status API Contracts', () => {
    let studentAccessToken;
    let studentRefreshToken;

    it('POST /api/auth/user/register should return expiresIn: 1800000 and 30-minute token', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'JWT Expiration Student',
          email: testStudentEmail,
          password: testPassword,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const authData = res.body.data;
      expect(authData.expiresIn).toBe(1800000); // 30 minutes in ms
      expect(authData.expiresAt).toBeGreaterThan(Date.now());
      expect(authData.expiresAt).toBeLessThanOrEqual(Date.now() + 1800000 + 5000);

      studentAccessToken = authData.accessToken;
      studentRefreshToken = authData.refreshToken;

      // Validate access token claims
      const decodedAccess = decodeToken(studentAccessToken);
      expect(decodedAccess.exp - decodedAccess.iat).toBe(1800);

      // Validate refresh token claims
      const decodedRefresh = decodeToken(studentRefreshToken);
      expect(decodedRefresh.exp - decodedRefresh.iat).toBe(604800);
    });

    it('GET /api/auth/session-status should report expiresIn: 1800000 and remainingMs <= 1800000', async () => {
      const res = await request(app)
        .get('/api/auth/session-status')
        .set('Authorization', `Bearer ${studentAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.active).toBe(true);
      expect(res.body.data.expiresIn).toBe(1800000);
      expect(res.body.data.remainingMs).toBeGreaterThan(0);
      expect(res.body.data.remainingMs).toBeLessThanOrEqual(1800000);
    });

    it('should inject X-Token-Expiry header matching the 30-minute access token expiration', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${studentAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-token-expiry']).toBeDefined();

      const decoded = decodeToken(studentAccessToken);
      const expectedExpiryMs = decoded.exp * 1000;
      expect(Number(res.headers['x-token-expiry'])).toBe(expectedExpiryMs);
    });
  });

  describe('4. Token Expiration Enforcement & Refresh Token Rotation', () => {
    it('should reject expired access tokens with 401 and TOKEN_EXPIRED error code', async () => {
      const expiredToken = jwt.sign(
        { id: 999, role: 'USER', roles: ['STUDENT'] },
        env.JWT_SECRET,
        {
          subject: 'expired@test.edu',
          issuer: 'event-booking-system',
          expiresIn: -60, // Expired 1 minute ago
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

    it('POST /api/auth/refresh-token should issue fresh 30m access token and new refresh token', async () => {
      // Register a dedicated user for refresh rotation test
      const tempEmail = `refresh_rotation_${Date.now()}@college.edu`;
      const reg = await request(app).post('/api/auth/user/register').send({
        name: 'Rotation User',
        email: tempEmail,
        password: testPassword,
      });

      const initialRefresh = reg.body.data.refreshToken;

      const refreshRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: initialRefresh });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);

      const freshAccess = refreshRes.body.data.accessToken;
      const freshRefresh = refreshRes.body.data.refreshToken;
      expect(freshAccess).toBeDefined();
      expect(freshRefresh).toBeDefined();
      expect(freshRefresh).not.toBe(initialRefresh);

      // Verify fresh access token has 30m expiration (1800s)
      const decodedAccess = decodeToken(freshAccess);
      expect(decodedAccess.exp - decodedAccess.iat).toBe(1800);
      expect(refreshRes.body.data.expiresIn).toBe(1800000);

      // Verify fresh refresh token retains 7d expiration (604800s)
      const decodedRefresh = decodeToken(freshRefresh);
      expect(decodedRefresh.exp - decodedRefresh.iat).toBe(604800);

      // Verify replay attack with old refresh token is rejected
      const replayRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: initialRefresh });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toBe('TOKEN_ALREADY_USED');

      await User.deleteOne({ email: tempEmail });
    });
  });

  describe('5. Authentication Flow Continuity', () => {
    it('President login should succeed without OTP and issue 30-minute access token', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({
          email: testPresidentEmail,
          password: testPassword,
          portal: 'PRESIDENT',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.expiresIn).toBe(1800000);

      const decoded = decodeToken(res.body.data.accessToken);
      expect(decoded.exp - decoded.iat).toBe(1800);
      expect(decoded.roles).toContain('PRESIDENT');
    });

    it('OTP flow for student login should be preserved', async () => {
      const res = await request(app)
        .post('/api/auth/otp/send')
        .send({
          email: testStudentEmail,
          role: 'USER',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notRequired).toBeFalsy();
    });
  });
});
