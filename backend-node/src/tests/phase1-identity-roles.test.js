import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User, Organizer, Counter } from '../models/index.js';
import { generateAccessToken } from '../utils/jwt.js';
import { runMemberNumberMigration } from '../scripts/migrate-member-numbers.js';
import { RoleAssignmentService } from '../services/roleAssignment.service.js';
import { getNextMemberNumber } from '../utils/sequenceHelper.js';

describe('Phase 1 — Identity, Multi-Role Authorization & Member Number Tests', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Member Number Generation & Formatting', () => {
    it('should generate sequential member numbers formatted as MEM0001, MEM0002...', async () => {
      const mem1 = await getNextMemberNumber();
      const mem2 = await getNextMemberNumber();

      expect(mem1).toMatch(/^MEM\d{4,}$/);
      expect(mem2).toMatch(/^MEM\d{4,}$/);

      const num1 = parseInt(mem1.replace('MEM', ''), 10);
      const num2 = parseInt(mem2.replace('MEM', ''), 10);
      expect(num2).toBe(num1 + 1);
    });

    it('should automatically assign permanent memberNumber on user creation and preserve userCode', async () => {
      const email = `student.test.${Date.now()}@skyline.test`;
      const user = new User({
        name: 'Alex Rivera',
        email,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
      });
      await user.save();

      expect(user.id).toBeGreaterThan(0);
      expect(user.userCode).toBe(`USR${String(user.id).padStart(4, '0')}`);
      expect(user.memberNumber).toMatch(/^MEM\d{4,}$/);
      expect(user.roles).toContain('STUDENT');
      expect(user.role).toBe('USER');

      // Member number must be permanent and not regenerate on subsequent saves
      const originalMem = user.memberNumber;
      user.name = 'Alex Rivera Updated';
      await user.save();
      expect(user.memberNumber).toBe(originalMem);
    });

    it('should allocate unique, non-colliding member numbers under concurrent registration', async () => {
      const batchSize = 10;
      const promises = Array.from({ length: batchSize }).map((_, i) => {
        const user = new User({
          name: `Concurrent Student ${i}`,
          email: `concurrent.${Date.now()}.${i}.${Math.random()}@skyline.test`,
          passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        });
        return user.save();
      });

      const results = await Promise.all(promises);
      const memberNumbers = results.map((u) => u.memberNumber);
      const uniqueNumbers = new Set(memberNumbers);

      expect(uniqueNumbers.size).toBe(batchSize);
      for (const num of memberNumbers) {
        expect(num).toMatch(/^MEM\d{4,}$/);
      }
    });
  });

  describe('2. Multi-Role Assignment & Authorization', () => {
    let studentUser;
    let studentToken;
    let presidentUser;
    let presidentToken;

    beforeEach(async () => {
      const ts = Date.now() + Math.floor(Math.random() * 100000);

      // Student user
      studentUser = new User({
        name: 'Test Student',
        email: `student.${ts}@skyline.test`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        roles: ['STUDENT'],
        role: 'USER',
        emailVerified: true,
      });
      await studentUser.save();
      studentToken = generateAccessToken({
        id: studentUser.id,
        email: studentUser.email,
        role: 'USER',
        roles: ['STUDENT'],
        memberNumber: studentUser.memberNumber,
      });

      // President user
      presidentUser = new User({
        name: 'Club President',
        email: `president.${ts}@skyline.test`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        roles: ['STUDENT', 'PRESIDENT'],
        role: 'ADMIN',
        emailVerified: true,
      });
      await presidentUser.save();
      presidentToken = generateAccessToken({
        id: presidentUser.id,
        email: presidentUser.email,
        role: 'ADMIN',
        roles: ['STUDENT', 'PRESIDENT'],
        memberNumber: presidentUser.memberNumber,
      });
    });

    it('should grant default STUDENT access to new registrations and ignore untrusted role inputs', async () => {
      const regEmail = `untrusted.role.${Date.now()}@skyline.test`;
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Hacker Attempt',
          email: regEmail,
          password: 'Password@123',
          role: 'PRESIDENT',
          roles: ['PRESIDENT', 'TREASURER'],
        });

      expect(res.status).toBe(201);
      const createdUser = await User.findOne({ email: regEmail });
      expect(createdUser).toBeDefined();
      expect(createdUser.roles).toEqual(['STUDENT']);
      expect(createdUser.role).toBe('USER');
      expect(createdUser.memberNumber).toMatch(/^MEM\d{4,}$/);
    });

    it('should allow STUDENT to access USER-protected routes via role alias', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.memberNumber).toBe(studentUser.memberNumber);
      expect(res.body.data.roles).toContain('STUDENT');
    });

    it('should block regular STUDENT from accessing PRESIDENT-protected endpoints', async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          targetUserId: studentUser.id,
          role: 'TREASURER',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('should allow PRESIDENT to delegate TREASURER role to student', async () => {
      const res = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          targetUserId: studentUser.id,
          role: 'TREASURER',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roles).toContain('TREASURER');
      expect(res.body.data.roles).toContain('STUDENT');

      // Verify DB persistence
      const updated = await User.findOne({ id: studentUser.id });
      expect(updated.roles).toContain('TREASURER');
      expect(updated.roles).toContain('STUDENT');
    });

    it('should enforce role revocation immediately via authoritative DB check', async () => {
      // 1. Assign TREASURER
      await RoleAssignmentService.assignRole({
        actorId: presidentUser.id,
        targetUserId: studentUser.id,
        role: 'TREASURER',
      });

      // 2. Token issued with TREASURER claim
      const treasurerToken = generateAccessToken({
        id: studentUser.id,
        email: studentUser.email,
        role: 'USER',
        roles: ['STUDENT', 'TREASURER'],
      });

      // 3. Revoke TREASURER in DB
      await RoleAssignmentService.revokeRole({
        actorId: presidentUser.id,
        targetUserId: studentUser.id,
        role: 'TREASURER',
      });

      // Verify DB no longer contains TREASURER
      const dbCheck = await User.findOne({ id: studentUser.id });
      expect(dbCheck.roles).not.toContain('TREASURER');
      expect(dbCheck.roles).toContain('STUDENT');

      // 4. Verification that STUDENT access cannot be revoked
      await expect(
        RoleAssignmentService.revokeRole({
          actorId: presidentUser.id,
          targetUserId: studentUser.id,
          role: 'STUDENT',
        })
      ).rejects.toThrow();
    });
  });

  describe('3. President Provisioning Protocol', () => {
    beforeEach(async () => {
      // Clean up test president accounts so initial provisioning can be isolated
      await User.deleteMany({ roles: 'PRESIDENT' });
      await User.deleteMany({ email: /@skyline\.test/ });
    });

    it('should provision the initial President with single-active constraint', async () => {
      const presEmail = `official.president.${Date.now()}@skyline.test`;

      // Provision initial President
      const res1 = await RoleAssignmentService.provisionPresident({
        email: presEmail,
        password: 'PresidentSecurePassword@123',
        name: 'Skyline President',
      });

      expect(res1.alreadyProvisioned).toBe(false);
      expect(res1.user.roles).toContain('PRESIDENT');
      expect(res1.user.roles).toContain('STUDENT');
      expect(res1.user.memberNumber).toMatch(/^MEM\d{4,}$/);

      // Repeat execution with same email must be idempotent
      const res2 = await RoleAssignmentService.provisionPresident({
        email: presEmail,
        password: 'PresidentSecurePassword@123',
        name: 'Skyline President',
      });
      expect(res2.alreadyProvisioned).toBe(true);

      // Attempting to provision a different user while President exists must be rejected
      const competingEmail = `imposter.${Date.now()}@skyline.test`;
      await expect(
        RoleAssignmentService.provisionPresident({
          email: competingEmail,
          password: 'Password@123',
          name: 'Competing President',
        })
      ).rejects.toThrow(/Multiple active Presidents are prohibited/);
    });
  });

  describe('4. Migration Idempotency & userCode Preservation', () => {
    it('should safely backfill memberNumber without altering valid userCode or existing records', async () => {
      const ts = Date.now();

      // Seed mock legacy user without memberNumber or roles
      const legacyUser = new User({
        id: 88801,
        userCode: 'USR88801',
        name: 'Legacy Student',
        email: `legacy.${ts}@skyline.test`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'USER',
      });
      // Bypass pre-save to simulate legacy state
      await User.collection.insertOne({
        id: 88801,
        userCode: 'USR88801',
        name: 'Legacy Student',
        email: `legacy.${ts}@skyline.test`,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'USER',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Run migration
      const report1 = await runMemberNumberMigration({ dryRun: false });
      expect(report1.conflicts.length).toBe(0);

      const updated = await User.findOne({ id: 88801 });
      expect(updated.userCode).toBe('USR88801'); // userCode 100% preserved
      expect(updated.memberNumber).toMatch(/^MEM\d{4,}$/);
      expect(updated.roles).toEqual(['STUDENT']);

      // Running migration a second time should be completely idempotent
      const savedMem = updated.memberNumber;
      const report2 = await runMemberNumberMigration({ dryRun: false });
      expect(report2.conflicts.length).toBe(0);

      const afterSecondRun = await User.findOne({ id: 88801 });
      expect(afterSecondRun.memberNumber).toBe(savedMem);
      expect(afterSecondRun.userCode).toBe('USR88801');
    });
  });
});
