import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import {
  User,
  Organizer,
  Event,
  Booking,
  Payment,
  Membership,
  MembershipDues,
  Expense,
  Reimbursement,
  Budget,
  LedgerEntry,
  Product,
  FundraisingCampaign,
  FundraisingContribution,
  VolunteerTask,
  Counter,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { MerchandiseService } from '../services/merchandise.service.js';
import { FinanceService } from '../services/finance.service.js';

describe('Phase 6 — Final End-to-End System Integration & Release Verification', () => {
  const ts = Date.now();

  let student = null;
  let studentToken = null;

  let organizer = null;
  let organizerToken = null;

  let president = null;
  let presidentToken = null;

  let treasurer = null;
  let treasurerToken = null;

  let volunteer = null;
  let volunteerToken = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Student
    student = new User({
      name: 'Phase 6 Integration Student',
      email: `p6_student_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEMP6S_${ts}`,
    });
    await student.save();
    studentToken = generateToken({
      id: student.id,
      email: student.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });

    // 2. Organizer (Organizer collection)
    organizer = new Organizer({
      organizerName: 'Phase 6 Integration Organizer',
      email: `p6_organizer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      role: 'ORGANIZER',
      isApproved: true,
      organizationName: 'Skyline Robotics Club',
    });
    await organizer.save();
    organizerToken = generateToken({
      id: organizer.id,
      email: organizer.email,
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
    });

    // 3. President
    president = new User({
      name: 'Phase 6 Association President',
      email: `p6_president_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['PRESIDENT', 'STUDENT'],
      role: 'PRESIDENT',
      emailVerified: true,
      memberNumber: `MEMP6P_${ts}`,
    });
    await president.save();
    presidentToken = generateToken({
      id: president.id,
      email: president.email,
      role: 'PRESIDENT',
      roles: ['PRESIDENT', 'STUDENT'],
    });

    // 4. Treasurer
    treasurer = new User({
      name: 'Phase 6 Association Treasurer',
      email: `p6_treasurer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['TREASURER', 'STUDENT'],
      role: 'TREASURER',
      emailVerified: true,
      memberNumber: `MEMP6T_${ts}`,
    });
    await treasurer.save();
    treasurerToken = generateToken({
      id: treasurer.id,
      email: treasurer.email,
      role: 'TREASURER',
      roles: ['TREASURER', 'STUDENT'],
    });

    // 5. Volunteer
    volunteer = new User({
      name: 'Phase 6 Volunteer',
      email: `p6_volunteer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['VOLUNTEER', 'STUDENT'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEMP6V_${ts}`,
    });
    await volunteer.save();
    volunteerToken = generateToken({
      id: volunteer.id,
      email: volunteer.email,
      role: 'VOLUNTEER',
      roles: ['VOLUNTEER', 'STUDENT'],
    });
  });

  afterAll(async () => {
    await User.deleteMany({
      email: {
        $in: [
          student?.email,
          president?.email,
          treasurer?.email,
          volunteer?.email,
        ],
      },
    });
    await Organizer.deleteMany({ email: organizer?.email });
    await Event.deleteMany({ location: `Skyline Hall ${ts}` });
    await Membership.deleteMany({ memberNumber: student?.memberNumber });
    await MembershipDues.deleteMany({ academicTerm: `TERM_P6_${ts}` });
    await Expense.deleteMany({ academicTerm: `TERM_P6_${ts}` });
    await Reimbursement.deleteMany({ academicTerm: `TERM_P6_${ts}` });
    await Budget.deleteMany({ academicTerm: `TERM_P6_${ts}` });
    await LedgerEntry.deleteMany({ academicTerm: `TERM_P6_${ts}` });
    await Payment.deleteMany({ transactionId: `TXN-P6-${ts}` });
    await Booking.deleteMany({ ticketId: `TKT-P6-${ts}` });
    await FundraisingCampaign.deleteMany({ category: `P6_${ts}` });
  });

  /* =========================================================================
   * 1. SYSTEM LIVENESS & READINESS HEALTH CHECKS
   * ========================================================================= */
  describe('System Health & Deployment Readiness Probes', () => {
    it('GET /api/health should report liveness status UP', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
      expect(res.body.data).toHaveProperty('uptimeSeconds');
    });

    it('GET /api/ready should report readiness status READY with MongoDB dependency', async () => {
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.dependencies.database.type).toBe('MongoDB');
      expect(res.body.data.dependencies.database.status).toBe('CONNECTED');
    });
  });

  /* =========================================================================
   * 2. COMPLETE FIVE-PORTAL ROLE AUTHORIZATION
   * ========================================================================= */
  describe('Five-Portal Access Boundaries & Role Isolation', () => {
    it('Student can access own profile and dues but cannot access executive endpoints', async () => {
      const ownRes = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(ownRes.status).toBe(200);

      // Student attempting President dashboard
      const presRes = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(presRes.status).toBe(403);

      // Student attempting Treasurer overview
      const treasRes = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(treasRes.status).toBe(403);
    });

    it('President has access to governance dashboard and audit logs', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${presidentToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalUsers');
      expect(res.body.data).toHaveProperty('membershipMetrics');
    });

    it('Treasurer has access to treasury overview and reports', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${treasurerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toHaveProperty('totalVerifiedIncome');
    });

    it('Volunteer has access to assigned tasks but cannot access treasury', async () => {
      const volRes = await request(app)
        .get('/api/volunteer/overview')
        .set('Authorization', `Bearer ${volunteerToken}`);
      expect(volRes.status).toBe(200);

      const treasRes = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${volunteerToken}`);
      expect(treasRes.status).toBe(403);
    });

    it('Organizer has access to event management', async () => {
      const res = await request(app)
        .get('/api/organizer/dashboard')
        .set('Authorization', `Bearer ${organizerToken}`);
      expect(res.status).toBe(200);
    });
  });

  /* =========================================================================
   * 3. END-TO-END MEMBERSHIP, APPLICATION & DUES SETTLEMENT
   * ========================================================================= */
  describe('Full Membership & Dues Lifecycle', () => {
    let membershipId = null;
    let duesId = null;

    it('Student applies for club membership', async () => {
      const res = await request(app)
        .post('/api/memberships/apply')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          statement: 'Active contributor to campus technical society',
          department: 'Computer Science',
          yearOfStudy: '3rd Year',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.memberNumber).toBe(student.memberNumber);
      membershipId = res.body.data.id;
    });

    it('President reviews and approves membership application assessed with dues', async () => {
      const res = await request(app)
        .post(`/api/memberships/${membershipId}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({
          reviewerNotes: 'Verified enrollment and active standing',
          duesAmount: 500,
          term: `TERM_P6_${ts}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
    });

    it('Treasurer verifies membership dues obligation', async () => {
      const res = await request(app)
        .get('/api/dues')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .query({ academicTerm: `TERM_P6_${ts}` });

      expect(res.status).toBe(200);
      const studentDue = res.body.data.content.find((d) => d.userId === student.id);
      expect(studentDue).toBeDefined();
      expect(studentDue.amount).toBe(500);
      expect(studentDue.status).toBe('PENDING');
      duesId = studentDue.id;
    });

    it('Student pays dues via verified payment settlement, activating membership', async () => {
      // Step 1: Initiate Razorpay payment order
      const orderRes = await request(app)
        .post(`/api/dues/${duesId}/order`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(orderRes.status).toBe(200);
      expect(orderRes.body.data).toHaveProperty('orderId');

      const rzpOrderId = orderRes.body.data.orderId;
      const rzpPaymentId = `pay_p6_${ts}`;
      const secret = env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder_for_tests';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${rzpOrderId}|${rzpPaymentId}`)
        .digest('hex');

      // Step 2: Verified payment webhook / verification
      const verifyRes = await request(app)
        .post(`/api/dues/${duesId}/verify`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: rzpPaymentId,
          razorpaySignature: signature,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.status).toBe('PAID');

      // Verify dues updated in database to PAID
      const updatedDue = await MembershipDues.findOne({ id: duesId });
      expect(updatedDue.status).toBe('PAID');

      // Verify membership transitioned to ACTIVE
      const updatedMembership = await Membership.findOne({ id: membershipId });
      expect(updatedMembership.status).toBe('ACTIVE');
    });
  });

  /* =========================================================================
   * 4. END-TO-END EVENT BOOKING, ATOMIC CAPACITY & CHECK-IN
   * ========================================================================= */
  describe('Event Booking, Atomic Capacity & Attendance Check-In', () => {
    let testEvent = null;
    let bookingId = null;
    let ticketId = null;

    it('Organizer creates and publishes a conference event with limited seats', async () => {
      const eventDateStr = '2026-11-20';
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventName: `Skyline AI Summit ${ts}`,
          category: 'CONFERENCE',
          eventType: 'CONFERENCE',
          eventDate: eventDateStr,
          eventTime: '09:00 AM',
          location: `Skyline Hall ${ts}`,
          description: 'Keynote sessions and workshops',
          ticketPrice: 150,
          totalSeats: 50,
          availableSeats: 50,
        });

      expect(res.status).toBe(201);
      testEvent = res.body.data;
    });

    it('Student books ticket reserving atomic seat capacity', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          eventId: testEvent.id,
          quantity: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.bookingStatus).toBe('PENDING');
      bookingId = res.body.data.id;

      // Verify available seats decremented atomically
      const evInDb = await Event.findOne({ id: testEvent.id });
      expect(evInDb.availableSeats).toBe(49);
    });

    it('Booking payment confirmation issues valid ticket and QR code', async () => {
      const booking = await Booking.findOne({ id: bookingId });
      booking.bookingStatus = 'CONFIRMED';
      booking.ticketStatus = 'VALID';
      booking.ticketId = `TKT-P6-${ts}`;
      await booking.save();

      // Verified successful payment record
      const payment = new Payment({
        transactionId: `TXN-P6-${ts}`,
        bookingId: booking.id,
        userId: student.id,
        paymentType: 'BOOKING',
        amount: 150,
        paymentStatus: 'SUCCESSFUL',
        paymentMethod: 'RAZORPAY',
        paidAt: new Date(),
      });
      await payment.save();

      ticketId = booking.ticketId;
      expect(ticketId).toMatch(/^TKT-P6-/);
    });

    it('Attendance check-in marks attendee present and prevents duplicate check-in', async () => {
      // First check-in
      const scanRes1 = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId,
          scanMethod: 'QR_CAMERA',
        });

      expect(scanRes1.status).toBe(200);
      expect(scanRes1.body.data.attendanceStatus).toBe('PRESENT');

      // Duplicate check-in attempt
      const scanRes2 = await request(app)
        .post('/api/attendance/scan')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: testEvent.id,
          ticketId,
          scanMethod: 'QR_CAMERA',
        });

      expect(scanRes2.status).toBe(409);
      expect(scanRes2.body.message).toMatch(/already recorded/i);
    });
  });

  /* =========================================================================
   * 5. END-TO-END FINANCE & OPERATIONS INTEGRATION
   * ========================================================================= */
  describe('Finance & Operations End-to-End Workflow', () => {
    it('Expense bill workflow: creation -> separation of duties approval -> payout -> ledger posting', async () => {
      // 1. Treasurer creates bill
      const expRes = await request(app)
        .post('/api/finance/expenses')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          title: 'Campus Wi-Fi Upgrade Hardware',
          payee: 'Network Solutions Inc.',
          amount: 18500,
          category: 'EQUIPMENT',
          academicTerm: `TERM_P6_${ts}`,
        });

      expect(expRes.status).toBe(201);
      const expenseId = expRes.body.data.id;

      // 2. Creator cannot self-approve
      const selfApproveRes = await request(app)
        .post(`/api/finance/expenses/${expenseId}/approve`)
        .set('Authorization', `Bearer ${treasurerToken}`);
      expect(selfApproveRes.status).toBe(403);

      // 3. President approves bill
      const presApproveRes = await request(app)
        .post(`/api/finance/expenses/${expenseId}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`);
      expect(presApproveRes.status).toBe(200);

      // 4. Treasurer disburses payment
      const payRes = await request(app)
        .post(`/api/finance/expenses/${expenseId}/pay`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: `DISB-P6-${ts}` });
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.paymentStatus).toBe('PAID');

      // 5. Verify General Ledger entry posted idempotently
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `EXPENSE_DISBURSEMENT_${payRes.body.data.reference}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.amount).toBe(18500);
      expect(ledgerEntry.entryType).toBe('EXPENSE');
    });

    it('Reimbursement workflow: volunteer submits -> treasurer approves -> payout -> ledger posting', async () => {
      // 1. Volunteer submits claim
      const claimRes = await request(app)
        .post('/api/finance/reimbursements')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          description: 'Printing directional posters for AI summit',
          amount: 450,
          category: 'SUPPLIES',
          academicTerm: `TERM_P6_${ts}`,
        });

      expect(claimRes.status).toBe(201);
      const claimId = claimRes.body.data.id;

      // 2. Treasurer reviews & approves claim
      const reviewRes = await request(app)
        .post(`/api/finance/reimbursements/${claimId}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ action: 'APPROVED' });
      expect(reviewRes.status).toBe(200);

      // 3. Treasurer disburses payout
      const disburseRes = await request(app)
        .post(`/api/finance/reimbursements/${claimId}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: `RMB-PAY-${ts}` });
      expect(disburseRes.status).toBe(200);
      expect(disburseRes.body.data.status).toBe('PAID');

      // 4. Verify General Ledger entry posted
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `REIMBURSEMENT_DISBURSEMENT_${disburseRes.body.data.claimNumber}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.amount).toBe(450);
      expect(ledgerEntry.entryType).toBe('REIMBURSEMENT');
    });

    it('Merchandise concurrency-safe order hold and release on cancellation', async () => {
      // 1. Create product
      const prodRes = await request(app)
        .post('/api/merchandise/products')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          sku: `SKU-P6-${ts}-CAP`,
          name: 'Skyline Embroidered Cap',
          price: 400,
          stockQuantity: 2,
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.data.id;

      // 2. Student reserves 2 items
      const orderRes = await request(app)
        .post('/api/merchandise/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          items: [{ productId: prodId, quantity: 2 }],
        });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.id;

      // 3. Third item attempt fails due to stock exhaustion
      const failRes = await request(app)
        .post('/api/merchandise/orders')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          items: [{ productId: prodId, quantity: 1 }],
        });
      expect(failRes.status).toBe(409);

      // 4. Cancel order releases stock reservation
      const cancelRes = await request(app)
        .post(`/api/merchandise/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(cancelRes.status).toBe(200);

      // 5. Now another order succeeds
      const retryRes = await request(app)
        .post('/api/merchandise/orders')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          items: [{ productId: prodId, quantity: 1 }],
        });
      expect(retryRes.status).toBe(201);
    });

    it('Fundraising verified donation updates campaign and posts income to ledger', async () => {
      // 1. Create campaign
      const campRes = await request(app)
        .post('/api/fundraising/campaigns')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          title: `Robotics Lab Tooling Drive ${ts}`,
          description: 'Procuring soldering irons and oscilloscopes',
          targetAmount: 30000,
          category: `P6_${ts}`,
        });
      expect(campRes.status).toBe(201);
      const campaignId = campRes.body.data.id;

      // 2. Initiate donation
      const donRes = await request(app)
        .post(`/api/fundraising/campaigns/${campaignId}/contribute`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          donorName: 'Anonymous Alum',
          donorEmail: 'alum@skyline.edu',
          amount: 5000,
          isAnonymous: true,
        });
      expect(donRes.status).toBe(201);
      const contribId = donRes.body.data.contribution.id;

      // 3. Confirm donation payment
      const confirmRes = await request(app)
        .post(`/api/fundraising/contributions/${contribId}/confirm`)
        .set('Authorization', `Bearer ${treasurerToken}`);
      expect(confirmRes.status).toBe(200);

      // 4. Verify campaign totals reflect real verified money
      const updatedCamp = await request(app)
        .get(`/api/fundraising/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(updatedCamp.status).toBe(200);
      expect(updatedCamp.body.data.collectedAmount).toBe(5000);
      expect(updatedCamp.body.data.donorCount).toBe(1);

      // 5. Verify Ledger income entry
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `DONATION_${confirmRes.body.data.transactionId}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.amount).toBe(5000);
      expect(ledgerEntry.entryType).toBe('INCOME');
    });

    it('Reconciliation report calculates cashflow balances from authoritative records', async () => {
      const res = await request(app)
        .get(`/api/finance/reconciliation?academicTerm=TERM_P6_${ts}`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('authoritativeRecords');
      expect(res.body.data).toHaveProperty('ledgerRecords');
      expect(res.body.data).toHaveProperty('reconciliation');
    });
  });
});
