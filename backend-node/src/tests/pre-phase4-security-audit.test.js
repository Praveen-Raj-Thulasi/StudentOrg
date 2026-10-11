import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
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
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { env } from '../config/env.js';
import { RoleAssignmentService } from '../services/roleAssignment.service.js';

describe('Pre-Phase 4 — Security Verification Audit Tests', () => {
  const ts = Date.now();

  let studentA = null;
  let studentAToken = null;

  let studentB = null;
  let studentBToken = null;

  let president = null;
  let presidentToken = null;

  let treasurer = null;
  let treasurerToken = null;

  let organizer = null;
  let organizerToken = null;

  let paidEvent = null;
  let freeEvent = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Student A
    studentA = new User({
      name: 'Audit Student A',
      email: `audit_student_a_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
    });
    await studentA.save();
    studentAToken = generateToken({
      id: studentA.id,
      email: studentA.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });

    // 2. Student B (for cross-user checks)
    studentB = new User({
      name: 'Audit Student B',
      email: `audit_student_b_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
    });
    await studentB.save();
    studentBToken = generateToken({
      id: studentB.id,
      email: studentB.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });

    // 3. President User
    president = new User({
      name: 'Audit President',
      email: `audit_president_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'PRESIDENT'],
      role: 'ADMIN',
      emailVerified: true,
    });
    await president.save();
    presidentToken = generateToken({
      id: president.id,
      email: president.email,
      role: 'ADMIN',
      roles: ['STUDENT', 'PRESIDENT'],
    });

    // 4. Treasurer User
    treasurer = new User({
      name: 'Audit Treasurer',
      email: `audit_treasurer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT', 'TREASURER'],
      role: 'STUDENT',
      emailVerified: true,
    });
    await treasurer.save();
    treasurerToken = generateToken({
      id: treasurer.id,
      email: treasurer.email,
      role: 'STUDENT',
      roles: ['STUDENT', 'TREASURER'],
    });

    // 5. Organizer
    organizer = new Organizer({
      organizerName: 'Audit Organizer',
      email: `audit_organizer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      organizationName: 'Audit Org',
      role: 'ORGANIZER',
      isApproved: true,
    });
    await organizer.save();
    organizerToken = generateToken({
      id: organizer.id,
      email: organizer.email,
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
    });

    // 6. Test Events
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 15);

    paidEvent = new Event({
      eventName: 'Security Audit Paid Event',
      category: 'CONFERENCE',
      eventType: 'CONFERENCE',
      eventTime: '10:00 AM',
      organizerId: organizer.id,
      organizer: organizer._id,
      eventDate,
      ticketPrice: 500,
      totalSeats: 100,
      availableSeats: 100,
      status: 'PUBLISHED',
    });
    await paidEvent.save();

    freeEvent = new Event({
      eventName: 'Security Audit Free Workshop',
      category: 'WORKSHOP',
      eventType: 'WORKSHOP',
      eventTime: '02:00 PM',
      organizerId: organizer.id,
      organizer: organizer._id,
      eventDate,
      ticketPrice: 0,
      totalSeats: 50,
      availableSeats: 50,
      status: 'PUBLISHED',
    });
    await freeEvent.save();
  });

  afterAll(async () => {
    await User.deleteMany({ email: new RegExp(String(ts)) });
    await Organizer.deleteMany({ email: new RegExp(String(ts)) });
    await Event.deleteMany({ eventName: /Security Audit/ });
    await disconnectDB();
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECK 1: MEMBERSHIP DUES PAYMENT AND ACTIVATION
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Check 1 — Membership Dues Payment and Activation', () => {
    let membershipDoc = null;
    let duesDoc = null;

    beforeAll(async () => {
      // Create student membership application and approve it with dues
      membershipDoc = new Membership({
        userId: studentA.id,
        user: studentA._id,
        memberNumber: studentA.memberNumber,
        status: 'APPROVED',
        department: 'Computer Science',
      });
      await membershipDoc.save();

      duesDoc = new MembershipDues({
        membershipId: membershipDoc.id,
        membership: membershipDoc._id,
        userId: studentA.id,
        user: studentA._id,
        title: 'Spring 2026 Association Dues',
        academicTerm: `TERM-${ts}`,
        amount: 350,
        currency: 'INR',
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: 'PENDING',
        assessedBy: president.id,
      });
      await duesDoc.save();
    });

    it('1.1 should REJECT forged dues payment payload without trusted gateway verification', async () => {
      const res = await request(app)
        .post(`/api/dues/${duesDoc.id}/pay`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          paymentMethod: 'ONLINE',
          gatewayTransactionId: 'FABRICATED-TXN-12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNVERIFIED_PAYMENT');
      expect(res.body.message).toContain('Client-side confirmation is not trusted');

      // Verify dues obligation remains PENDING
      const checkDue = await MembershipDues.findOne({ id: duesDoc.id });
      expect(checkDue.status).toBe('PENDING');
      expect(checkDue.paidAt).toBeNull();
    });

    it('1.2 should PREVENT membership activation when dues payment is unverified', async () => {
      // Membership must remain APPROVED, NOT activated to ACTIVE
      const checkMem = await Membership.findOne({ id: membershipDoc.id });
      expect(checkMem.status).toBe('APPROVED');
      expect(checkMem.activatedAt).toBeNull();
    });

    it('1.3 should REJECT dues verification when signature is invalid or forged', async () => {
      // Step A: Initiate genuine order
      const orderRes = await request(app)
        .post(`/api/dues/${duesDoc.id}/order`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(orderRes.status).toBe(200);
      const { orderId } = orderRes.body.data;

      // Step B: Submit forged signature
      const verifyRes = await request(app)
        .post(`/api/dues/${duesDoc.id}/verify`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: 'pay_fabricated_999',
          razorpaySignature: 'bad_signature_hex_1234567890abcdef',
        });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.message).toContain('Razorpay signature verification failed');

      // Verify dues still remains PENDING
      const checkDue = await MembershipDues.findOne({ id: duesDoc.id });
      expect(checkDue.status).toBe('PENDING');
    });

    it('1.4 should REJECT dues verification when orderId does not match server order', async () => {
      const verifyRes = await request(app)
        .post(`/api/dues/${duesDoc.id}/verify`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          razorpayOrderId: 'order_completely_wrong_000',
          razorpayPaymentId: 'pay_test_000',
          razorpaySignature: 'signature_test',
        });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.message).toContain('Razorpay order mismatch');
    });

    it('1.5 should ACTIVATE membership ONLY after trusted cryptographic Razorpay settlement', async () => {
      // Order created in 1.3 is reused or re-fetched
      const payment = await Payment.findOne({ duesId: duesDoc.id, paymentType: 'DUES' });
      expect(payment).toBeTruthy();
      const orderId = payment.gatewayOrderId;

      const mockPaymentId = `pay_valid_audit_${Date.now()}`;
      const payload = `${orderId}|${mockPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      const verifyRes = await request(app)
        .post(`/api/dues/${duesDoc.id}/verify`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: mockPaymentId,
          razorpaySignature: validSignature,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.status).toBe('PAID');

      // Membership is now officially ACTIVE
      const updatedMem = await Membership.findOne({ id: membershipDoc.id });
      expect(updatedMem.status).toBe('ACTIVE');
      expect(updatedMem.activatedAt).toBeTruthy();
    });

    it('1.6 should handle duplicate dues settlement IDEMPOTENTLY without errors', async () => {
      const dupRes = await request(app)
        .post(`/api/dues/${duesDoc.id}/pay`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({});

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.data.status).toBe('PAID');
    });

    it('1.7 should PREVENT cross-user access: student cannot pay or modify another student dues', async () => {
      // Student B attempting to pay Student A's dues
      const rogueRes = await request(app)
        .post(`/api/dues/${duesDoc.id}/order`)
        .set('Authorization', `Bearer ${studentBToken}`);

      expect(rogueRes.status).toBe(403);
      expect(rogueRes.body.message).toContain('Unauthorized: You do not own this dues obligation');
    });

    it('1.8 should settle dues and activate membership via trusted Razorpay webhook idempotently', async () => {
      // Create another member with pending dues
      const mem2 = new Membership({
        userId: studentB.id,
        user: studentB._id,
        memberNumber: studentB.memberNumber,
        status: 'APPROVED',
      });
      await mem2.save();

      const dues2 = new MembershipDues({
        membershipId: mem2.id,
        membership: mem2._id,
        userId: studentB.id,
        user: studentB._id,
        title: 'Webhook Dues Test',
        academicTerm: `TERM-WH-${ts}`,
        amount: 200,
        currency: 'INR',
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: 'PENDING',
        assessedBy: president.id,
      });
      await dues2.save();

      // Create dues order
      const orderRes = await request(app)
        .post(`/api/dues/${dues2.id}/order`)
        .set('Authorization', `Bearer ${studentBToken}`);
      expect(orderRes.status).toBe(200);
      const orderId = orderRes.body.data.orderId;

      // Construct genuine Razorpay webhook
      const webhookPayload = JSON.stringify({
        event: 'order.paid',
        payload: {
          order: { entity: { id: orderId } },
          payment: { entity: { id: `pay_wh_${Date.now()}`, order_id: orderId } },
        },
      });

      const webhookSig = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(webhookPayload)
        .digest('hex');

      // Delivery 1: Processed
      const whRes1 = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', webhookSig)
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(whRes1.status).toBe(200);
      expect(whRes1.body.processed).toBe(true);

      const checkDues2 = await MembershipDues.findOne({ id: dues2.id });
      expect(checkDues2.status).toBe('PAID');

      const checkMem2 = await Membership.findOne({ id: mem2.id });
      expect(checkMem2.status).toBe('ACTIVE');

      // Delivery 2: Idempotent skip
      const whRes2 = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', webhookSig)
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(whRes2.status).toBe(200);
      expect(whRes2.body.idempotent).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECK 2: BOOKING PAYMENT AND markSuccess
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Check 2 — Booking Payment and markSuccess', () => {
    let paidBooking = null;
    let paidPayment = null;

    beforeAll(async () => {
      // Create a paid booking for Student A
      const bookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          eventId: paidEvent.id,
          quantity: 1,
        });

      expect(bookRes.status).toBe(201);
      paidBooking = bookRes.body.data;
      paidPayment = await Payment.findOne({ bookingId: paidBooking.id });
      expect(paidPayment.amount).toBe(500);
    });

    it('2.1 should REJECT untrusted client markSuccess request for paid booking', async () => {
      const res = await request(app)
        .post(`/api/payments/bookings/${paidBooking.id}/success`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          paymentMethod: 'FABRICATED_CLIENT_SUCCESS',
          gatewayTransactionId: 'FAKE-GW-12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNVERIFIED_PAYMENT');
      expect(res.body.message).toContain('Client-side confirmation is not trusted');

      // Booking must remain PENDING
      const bookingInDb = await Booking.findOne({ id: paidBooking.id });
      expect(bookingInDb.bookingStatus).toBe('PENDING');
    });

    it('2.2 should REJECT invalid or mismatched HMAC signature on booking verification', async () => {
      const orderRes = await request(app)
        .post(`/api/payments/bookings/${paidBooking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(orderRes.status).toBe(200);
      const { orderId } = orderRes.body.data;

      // Send forged signature
      const verifyRes = await request(app)
        .post(`/api/payments/bookings/${paidBooking.id}/razorpay/verify`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: 'pay_bogus_123',
          razorpaySignature: 'forged_signature_hex_00000000000000',
        });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.message).toContain('Razorpay signature verification failed');

      // Payment marked FAILED in DB
      const checkPayment = await Payment.findOne({ bookingId: paidBooking.id });
      expect(checkPayment.paymentStatus).toBe('FAILED');
      expect(checkPayment.failureReason).toContain('signature verification failed');
    });

    it('2.3 should SAFELY CONFIRM zero-value booking through server-controlled workflow', async () => {
      // Book free event
      const freeBookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          eventId: freeEvent.id,
          quantity: 1,
        });

      expect(freeBookRes.status).toBe(201);
      const freeBooking = freeBookRes.body.data;
      expect(freeBooking.totalAmount).toBe(0);

      // Order creation confirms free booking automatically
      const orderRes = await request(app)
        .post(`/api/payments/bookings/${freeBooking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(orderRes.status).toBe(200);
      expect(orderRes.body.data.displayAmount).toBe(0);

      // Verify confirmed in DB with valid ticket and QR code
      const checkFree = await Booking.findOne({ id: freeBooking.id });
      expect(checkFree.bookingStatus).toBe('CONFIRMED');
      expect(checkFree.ticketStatus).toBe('VALID');
      expect(checkFree.qrCodePath).toBeTruthy();
    });

    it('2.4 should REJECT attempt to exploit zero-value bypass on a paid booking', async () => {
      // Re-create order for paid booking
      const orderRes = await request(app)
        .post(`/api/payments/bookings/${paidBooking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${studentAToken}`);
      expect(orderRes.status).toBe(200);

      // Directly tampering payment amount to 0 in memory/database
      // Backend payment service must reject confirmation if payment amount <= 0 but booking totalAmount > 0
      const paymentInDb = await Payment.findOne({ bookingId: paidBooking.id });
      paymentInDb.amount = 0;
      await paymentInDb.save();

      const exploitRes = await request(app)
        .post(`/api/payments/bookings/${paidBooking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(exploitRes.status).toBe(400);
      expect(exploitRes.body.errorCode).toBe('AMOUNT_MISMATCH');

      // Restore legitimate payment amount
      paymentInDb.amount = 500;
      await paymentInDb.save();
    });

    it('2.5 should REJECT payment confirmation for cancelled booking and release capacity', async () => {
      // Cancel booking
      const cancelRes = await request(app)
        .patch(`/api/bookings/${paidBooking.id}/cancel`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .query({ reason: 'Audit cancellation test' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.bookingStatus).toBe('CANCELLED');

      // Attempting to create order for cancelled booking must fail
      const orderRes = await request(app)
        .post(`/api/payments/bookings/${paidBooking.id}/razorpay/order`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(orderRes.status).toBe(400);
      expect(orderRes.body.message).toContain('cancelled');
    });

    it('2.6 should PREVENT ordinary student from marking refund completed', async () => {
      // Student attempting to access admin refund update endpoint
      const res = await request(app)
        .patch('/api/admin/refunds/1/status')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // CHECK 3: PRESIDENT AUTHORIZATION & ROLE SECURITY
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Check 3 — President Authorization and Role Security', () => {
    let targetStudent = null;
    let targetMem = null;

    beforeAll(async () => {
      targetStudent = new User({
        name: 'Target Student',
        email: `target_student_${ts}@skyline.edu`,
        passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
        roles: ['STUDENT'],
        role: 'STUDENT',
        emailVerified: true,
      });
      await targetStudent.save();

      targetMem = new Membership({
        userId: targetStudent.id,
        user: targetStudent._id,
        memberNumber: targetStudent.memberNumber,
        status: 'PENDING',
      });
      await targetMem.save();
    });

    it('3.1 should PREVENT Student, Organizer, and Treasurer from approving memberships', async () => {
      // Student attempt
      const studentRes = await request(app)
        .post(`/api/memberships/${targetMem.id}/approve`)
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({});
      expect(studentRes.status).toBe(403);

      // Organizer attempt
      const orgRes = await request(app)
        .post(`/api/memberships/${targetMem.id}/approve`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({});
      expect(orgRes.status).toBe(403);

      // Treasurer attempt
      const treasRes = await request(app)
        .post(`/api/memberships/${targetMem.id}/approve`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({});
      expect(treasRes.status).toBe(403);
    });

    it('3.2 should ALLOW authoritative President to approve membership', async () => {
      const res = await request(app)
        .post(`/api/memberships/${targetMem.id}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ note: 'Approved by President', duesAmount: 0 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('3.3 should PREVENT role escalation via user profile update', async () => {
      const res = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          name: 'Hacker Student',
          role: 'PRESIDENT',
          roles: ['STUDENT', 'PRESIDENT', 'ADMIN'],
        });

      expect(res.status).toBe(200);

      // Inspect DB: roles must remain ['STUDENT']
      const checkUser = await User.findOne({ id: studentA.id });
      expect(checkUser.roles).toEqual(['STUDENT']);
      expect(checkUser.role).not.toBe('PRESIDENT');
      expect(checkUser.role).not.toBe('ADMIN');
    });

    it('3.4 should REJECT role assignment from non-President or assignment of PRESIDENT role', async () => {
      // Student attempting to assign role to Student B
      const nonPresRes = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          targetUserId: studentB.id,
          role: 'TREASURER',
        });
      expect(nonPresRes.status).toBe(403);

      // President attempting to assign PRESIDENT role (only DELEGABLE_ROLES allowed)
      const presAssignPres = await request(app)
        .post('/api/roles/assign')
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          targetUserId: studentB.id,
          role: 'PRESIDENT',
        });
      expect(presAssignPres.status).toBe(400);
      expect(presAssignPres.body.message).toContain('Cannot assign role');
    });

    it('3.5 should ENFORCE real-time role revocation from DB immediately on the next request', async () => {
      // Create a temporary President
      const tempPres = new User({
        name: 'Temporary President',
        email: `temp_pres_${ts}@skyline.edu`,
        passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
        roles: ['STUDENT', 'PRESIDENT'],
        role: 'ADMIN',
        emailVerified: true,
      });
      await tempPres.save();

      const tempPresToken = generateToken({
        id: tempPres.id,
        email: tempPres.email,
        role: 'ADMIN',
        roles: ['STUDENT', 'PRESIDENT'],
      });

      // Request 1: Succeeds with President permissions
      const res1 = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${tempPresToken}`);
      expect(res1.status).toBe(200);

      // Revoke PRESIDENT role directly in the database
      tempPres.roles = ['STUDENT'];
      tempPres.role = 'STUDENT';
      await tempPres.save();

      // Request 2: Must be immediately denied (HTTP 403) despite presenting the existing token
      const res2 = await request(app)
        .get('/api/memberships/pending')
        .set('Authorization', `Bearer ${tempPresToken}`);
      expect(res2.status).toBe(403);
      expect(res2.body.message).toContain('Insufficient role permissions');
    });

    it('3.6 should ENFORCE single-active-President safeguard against duplicate provisioning', async () => {
      // Attempting to provision another President without transfer must throw ConflictError
      await expect(
        RoleAssignmentService.provisionPresident({
          email: `duplicate_pres_${ts}@skyline.edu`,
          password: 'Password123!',
          name: 'Rival President',
          transfer: false,
        })
      ).rejects.toThrow(/Multiple active Presidents are prohibited/);
    });
  });
});
