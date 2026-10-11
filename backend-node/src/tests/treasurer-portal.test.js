import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import {
  User,
  Expense,
  Reimbursement,
  Budget,
  LedgerEntry,
  FundraisingCampaign,
  Sponsorship,
  FundCollection,
  AuditLog,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { validateReceipt } from '../utils/receiptValidator.js';
import { TreasurerService } from '../services/treasurer.service.js';

describe('Treasurer Financial Portal — Acceptance & Compliance Test Suite', () => {
  const ts = Date.now();

  let studentUser = null;
  let studentToken = null;

  let treasurerUser = null;
  let treasurerToken = null;

  let presidentUser = null;
  let presidentToken = null;

  let testCampaign = null;
  let testClaim = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Student User (Claimant)
    studentUser = new User({
      name: 'Treasurer Test Student',
      email: `tr_student_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEMTR_S_${ts}`,
    });
    await studentUser.save();
    studentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });

    // 2. Treasurer User
    treasurerUser = new User({
      name: 'Chief Treasurer',
      email: `tr_treasurer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['TREASURER'],
      role: 'TREASURER',
      emailVerified: true,
      memberNumber: `MEMTR_T_${ts}`,
    });
    await treasurerUser.save();
    treasurerToken = generateToken({
      id: treasurerUser.id,
      email: treasurerUser.email,
      role: 'TREASURER',
      roles: ['TREASURER'],
    });

    // 3. President User
    presidentUser = new User({
      name: 'Club President',
      email: `tr_president_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['PRESIDENT'],
      role: 'PRESIDENT',
      emailVerified: true,
      memberNumber: `MEMTR_P_${ts}`,
    });
    await presidentUser.save();
    presidentToken = generateToken({
      id: presidentUser.id,
      email: presidentUser.email,
      role: 'PRESIDENT',
      roles: ['PRESIDENT'],
    });

    // Setup a test campaign
    testCampaign = new FundraisingCampaign({
      title: `Annual Tech Fest Campaign ${ts}`,
      description: 'Fundraising for annual hackathon and technology symposium',
      targetAmount: 100000,
      currency: 'INR',
      status: 'ACTIVE',
      category: `TR_TEST_${ts}`,
      ownerId: treasurerUser.id,
    });
    await testCampaign.save();
  });

  afterAll(async () => {
    await User.deleteMany({
      email: { $in: [studentUser?.email, treasurerUser?.email, presidentUser?.email] },
    });
    await FundraisingCampaign.deleteMany({ category: `TR_TEST_${ts}` });
    await Sponsorship.deleteMany({ campaignId: testCampaign?.id });
    await FundCollection.deleteMany({ campaignId: testCampaign?.id });
    await Reimbursement.deleteMany({ claimantId: studentUser?.id });
    await Expense.deleteMany({ createdBy: studentUser?.id });
  });

  /* =========================================================================
   * 1. AUTHORIZATION & RBAC ENFORCEMENT
   * ========================================================================= */
  describe('1. Security & RBAC Enforcement', () => {
    it('Unauthenticated requests to Treasurer endpoints are rejected (401)', async () => {
      const res = await request(app).get('/api/treasurer/overview');
      expect(res.status).toBe(401);
    });

    it('Student role is forbidden from accessing Treasurer overview (403)', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('Treasurer can access overview and metrics successfully (200)', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('recordedIncome');
      expect(res.body.data).toHaveProperty('recordedExpenses');
      expect(res.body.data).toHaveProperty('recordedBalance');
    });

    it('President can also inspect Treasurer overview (200)', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
    });
  });

  /* =========================================================================
   * 2. FINANCIAL DASHBOARD & AUTHORITATIVE BALANCE FORMULA
   * ========================================================================= */
  describe('2. Financial Dashboard Metrics & Balance Integrity', () => {
    it('Calculates recorded balance strictly as: recorded income - recorded expenses', async () => {
      const res = await request(app)
        .get('/api/treasurer/overview')
        .set('Authorization', `Bearer ${treasurerToken}`);

      const data = res.body.data;
      expect(typeof data.recordedIncome).toBe('number');
      expect(typeof data.recordedExpenses).toBe('number');
      expect(typeof data.recordedBalance).toBe('number');

      const expectedBalance = Number((data.recordedIncome - data.recordedExpenses).toFixed(2));
      expect(data.recordedBalance).toBe(expectedBalance);
    });

    it('Segregates promised sponsorships so they NEVER count as received income', async () => {
      // 1. Snapshot initial overview
      const initialOverview = (
        await request(app)
          .get('/api/treasurer/overview')
          .set('Authorization', `Bearer ${treasurerToken}`)
      ).body.data;

      // 2. Create a promised sponsorship of ₹75,000
      const spRes = await request(app)
        .post('/api/treasurer/sponsorships')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          campaignId: testCampaign.id,
          sponsorName: 'Global Cloud Systems',
          tier: 'GOLD',
          promisedAmount: 75000,
          sponsorEmail: 'sponsorship@cloud.com',
          notes: 'Promised pending formal contract execution',
        });

      expect(spRes.status).toBe(201);
      expect(spRes.body.data.status).toBe('PROMISED');
      expect(spRes.body.data.receivedAmount).toBe(0);

      // 3. Re-inspect overview: Income and Balance MUST NOT change!
      const afterOverview = (
        await request(app)
          .get('/api/treasurer/overview')
          .set('Authorization', `Bearer ${treasurerToken}`)
      ).body.data;

      expect(afterOverview.recordedIncome).toBe(initialOverview.recordedIncome);
      expect(afterOverview.recordedBalance).toBe(initialOverview.recordedBalance);
      expect(afterOverview.sponsorships.totalPromised).toBeGreaterThanOrEqual(75000);
      expect(afterOverview.sponsorships.outstandingPromised).toBeGreaterThanOrEqual(75000);
    });
  });

  /* =========================================================================
   * 3. FUNDRAISERS, SPONSORS & COLLECTIONS VERIFICATION
   * ========================================================================= */
  describe('3. Fundraisers, Sponsorship Commitments & Collection Verification', () => {
    let createdSponsorshipId = null;
    let recordedCollectionId = null;
    const collectionAmount = 25000;

    it('Treasurer can record a sponsorship commitment with tier and academic term', async () => {
      const res = await request(app)
        .post('/api/treasurer/sponsorships')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          campaignId: testCampaign.id,
          sponsorName: 'Alpha Tech Labs',
          tier: 'PLATINUM',
          promisedAmount: 50000,
          academicTerm: '2026-2027',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.sponsorName).toBe('Alpha Tech Labs');
      expect(res.body.data.promisedAmount).toBe(50000);
      createdSponsorshipId = res.body.data.id;
    });

    it('Recording a fund collection puts it in RECORDED status pending verification', async () => {
      const res = await request(app)
        .post('/api/treasurer/collections')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          campaignId: testCampaign.id,
          sponsorshipId: createdSponsorshipId,
          source: 'SPONSORSHIP',
          amount: collectionAmount,
          receiptReference: `UTR-ALPHA-${ts}`,
          evidenceUrl: 'https://skyline.edu/evidence/utr_receipt.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('RECORDED');
      expect(res.body.data.amount).toBe(collectionAmount);
      recordedCollectionId = res.body.data.id;
    });

    it('Unverified collections do not increment recorded balance', async () => {
      const col = await FundCollection.findOne({ id: recordedCollectionId });
      expect(col.status).toBe('RECORDED');

      // Check general ledger: no entry should exist for unverified collection
      const ledgerEntry = await LedgerEntry.findOne({
        sourceReference: col.collectionNumber,
      });
      expect(ledgerEntry).toBeNull();
    });

    it('Verifying collection posts exactly-once to General Ledger and updates linked sponsorship', async () => {
      const initialOverview = (
        await request(app)
          .get('/api/treasurer/overview')
          .set('Authorization', `Bearer ${treasurerToken}`)
      ).body.data;

      const res = await request(app)
        .post(`/api/treasurer/collections/${recordedCollectionId}/verify`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ verificationNotes: 'Bank remittance verified via HDFC statement' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.ledgerEntryId).toBeTruthy();

      // Verify linked sponsorship updated
      const updatedSponsorship = await Sponsorship.findOne({ id: createdSponsorshipId });
      expect(updatedSponsorship.receivedAmount).toBe(collectionAmount);
      expect(updatedSponsorship.status).toBe('PARTIALLY_RECEIVED');

      // Verify authoritative LedgerEntry created
      const ledgerEntry = await LedgerEntry.findOne({ id: res.body.data.ledgerEntryId });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.entryType).toBe('INCOME');
      expect(ledgerEntry.amount).toBe(collectionAmount);
      expect(ledgerEntry.category).toBe('SPONSORSHIP');

      // Overview income increased by exactly collectionAmount
      const afterOverview = (
        await request(app)
          .get('/api/treasurer/overview')
          .set('Authorization', `Bearer ${treasurerToken}`)
      ).body.data;

      expect(afterOverview.recordedIncome).toBe(
        Number((initialOverview.recordedIncome + collectionAmount).toFixed(2))
      );
    });

    it('Idempotency prevents duplicate income postings on repeated verification attempts', async () => {
      const res = await request(app)
        .post(`/api/treasurer/collections/${recordedCollectionId}/verify`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      // Must return ConflictError (409)
      expect(res.status).toBe(409);

      // Verify no duplicate ledger entry created
      const entries = await LedgerEntry.find({
        idempotencyKey: `COLLECTION_VERIFIED_COL-${new Date().getFullYear()}-${String(
          recordedCollectionId
        ).padStart(4, '0')}`,
      });
      expect(entries.length).toBe(1);
    });

    it('Rejecting a collection marks it REJECTED without posting to ledger', async () => {
      // Record a new bogus collection
      const createRes = await request(app)
        .post('/api/treasurer/collections')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          campaignId: testCampaign.id,
          source: 'DIRECT_DONATION',
          amount: 5000,
          receiptReference: 'FAKE_REF_999',
        });

      const fakeId = createRes.body.data.id;

      const rejectRes = await request(app)
        .post(`/api/treasurer/collections/${fakeId}/reject`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ reason: 'Invalid fake transaction reference' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
      expect(rejectRes.body.data.verificationNotes).toBe('Invalid fake transaction reference');

      const col = await FundCollection.findOne({ id: fakeId });
      expect(col.ledgerEntryId).toBeNull();
    });
  });

  /* =========================================================================
   * 4. EXPENSE CLAIMS & RECEIPT VALIDATION / OCR
   * ========================================================================= */
  describe('4. Expense Claims, Receipt Validation & OCR Adapter', () => {
    it('Receipt validator never claims OCR succeeded when raw binary or unparseable input is provided', async () => {
      const validation = await validateReceipt({
        claimedAmount: 1500,
        receiptUrl: 'https://skyline.edu/receipts/raw_image_without_text.jpg',
      });

      expect(validation.ocrPerformed).toBe(false);
      expect(validation.status).toBe('MANUAL_REVIEW_REQUIRED');
      expect(validation.extractedTotal).toBeNull();
      expect(validation.warnings.some((w) => w.includes('manual receipt verification'))).toBe(true);
    });

    it('Receipt validator extracts total and flags amount mismatches accurately', async () => {
      const receiptText = `
        OFFICIAL TAX INVOICE
        Merchant: Stationery & Art Depot
        Date: 2026-10-10
        Items:
        - 10x Whiteboard Markers: ₹400.00
        - 5x Flip Charts: ₹350.00
        Total Amount: ₹750.00
        Paid via UPI
      `;

      // Case A: Matching claimed amount (₹750)
      const matchVal = await validateReceipt({
        claimedAmount: 750,
        receiptText,
      });
      expect(matchVal.ocrPerformed).toBe(true);
      expect(matchVal.extractedTotal).toBe(750);
      expect(matchVal.amountMismatch).toBe(false);

      // Case B: Mismatched claimed amount (Claiming ₹1200 when receipt is ₹750)
      const mismatchVal = await validateReceipt({
        claimedAmount: 1200,
        receiptText,
      });
      expect(mismatchVal.ocrPerformed).toBe(true);
      expect(mismatchVal.amountMismatch).toBe(true);
      expect(mismatchVal.mismatchDifference).toBe(450);
      expect(mismatchVal.warnings.some((w) => w.includes('Amount mismatch'))).toBe(true);
    });

    it('Receipt validator flags potential duplicate receipts used across claims', async () => {
      const duplicateUrl = `https://skyline.edu/receipts/duplicate_slip_${ts}.pdf`;

      // Seed an existing claim with this receipt URL
      const priorClaim = new Reimbursement({
        claimantId: studentUser.id,
        amount: 500,
        category: 'SUPPLIES',
        description: 'First submission with receipt',
        receiptUrl: duplicateUrl,
        status: 'SUBMITTED',
      });
      await priorClaim.save();

      // Validate a second claim using the identical URL
      const dupVal = await validateReceipt({
        claimedAmount: 500,
        receiptUrl: duplicateUrl,
        claimId: 99999, // Different claim
      });

      expect(dupVal.duplicateRisk).toBe(true);
      expect(dupVal.warnings.some((w) => w.includes('Potential duplicate receipt'))).toBe(true);

      // Clean up prior claim
      await Reimbursement.deleteOne({ id: priorClaim.id });
    });

    it('Claim inspection endpoint GET /api/treasurer/claims/:id/inspect-receipt returns validation results', async () => {
      const claim = new Reimbursement({
        claimantId: studentUser.id,
        amount: 800,
        category: 'EQUIPMENT',
        description: 'Microphone cables for stage setup',
        receiptUrl: `https://skyline.edu/receipts/mic_cables_${ts}.jpg`,
        status: 'SUBMITTED',
      });
      await claim.save();

      const res = await request(app)
        .get(`/api/treasurer/claims/${claim.id}/inspect-receipt`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.claim.id).toBe(claim.id);
      expect(res.body.data.receiptValidation).toHaveProperty('ocrPerformed');
      expect(res.body.data.receiptValidation).toHaveProperty('warnings');

      await Reimbursement.deleteOne({ id: claim.id });
    });
  });

  /* =========================================================================
   * 5. CLAIM APPROVAL, REJECTION & EXACTLY-ONCE EXPENSE CREATION
   * ========================================================================= */
  describe('5. Claim Approval, Rejection & Exactly-Once Expense Constraints', () => {
    let activeClaim = null;

    beforeEach(async () => {
      activeClaim = new Reimbursement({
        claimantId: studentUser.id,
        amount: 2500,
        category: 'SUPPLIES',
        academicTerm: '2026-2027',
        description: `Office stationary and printing cartridges ${Date.now()}`,
        status: 'SUBMITTED',
      });
      await activeClaim.save();
    });

    afterEach(async () => {
      if (activeClaim) {
        await Reimbursement.deleteOne({ id: activeClaim.id });
        await Expense.deleteOne({ reference: `EXP-${activeClaim.claimNumber}` });
      }
    });

    it('Claimant is strictly prevented from approving their own claim (Separation of Duties)', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${activeClaim.id}/review`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ action: 'APPROVED' });

      expect(res.status).toBe(403);
    });

    it('Approving a claim creates EXACTLY ONE linked expense transaction and updates status', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${activeClaim.id}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ action: 'APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.reviewerId).toBe(treasurerUser.id);
      expect(res.body.data.reviewedAt).toBeTruthy();

      // Verify exactly one linked Expense record created
      const expectedExpenseRef = `EXP-${activeClaim.claimNumber}`;
      const expenses = await Expense.find({ reference: expectedExpenseRef });
      expect(expenses.length).toBe(1);

      const exp = expenses[0];
      expect(exp.amount).toBe(2500);
      expect(exp.approvalStatus).toBe('APPROVED');
      expect(exp.paymentStatus).toBe('UNPAID');
      expect(exp.approvedBy).toBe(treasurerUser.id);
    });

    it('Repeated approvals are rejected to prevent duplicate transactions (Idempotency)', async () => {
      // First approval
      await request(app)
        .post(`/api/finance/reimbursements/${activeClaim.id}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ action: 'APPROVED' });

      // Immediate second approval attempt
      const res = await request(app)
        .post(`/api/finance/reimbursements/${activeClaim.id}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ action: 'APPROVED' });

      expect(res.status).toBe(409);

      // Confirm only one expense exists
      const expenses = await Expense.find({ reference: `EXP-${activeClaim.claimNumber}` });
      expect(expenses.length).toBe(1);
    });

    it('Rejecting a claim preserves the rejection reason and creates NO expense', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${activeClaim.id}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          action: 'REJECTED',
          reason: 'Personal expense ineligible for student association funds',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toBe(
        'Personal expense ineligible for student association funds'
      );

      // Verify NO expense was created
      const expense = await Expense.findOne({ reference: `EXP-${activeClaim.claimNumber}` });
      expect(expense).toBeNull();
    });

    it('Prevent manual entry of claim-generated expense', async () => {
      const res = await request(app)
        .post('/api/finance/expenses')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          title: 'Manual duplicate expense attempt',
          payee: 'Sneaky User',
          amount: 2500,
          reference: `EXP-${activeClaim.claimNumber}`,
        });

      expect(res.status).toBe(409);
    });
  });

  /* =========================================================================
   * 6. REIMBURSEMENT PAYOUT WORKFLOW & AUDIT TRAIL
   * ========================================================================= */
  describe('6. Reimbursement Payout Workflow & General Ledger Posting', () => {
    let claimToDisburse = null;

    beforeAll(async () => {
      claimToDisburse = new Reimbursement({
        claimantId: studentUser.id,
        amount: 3200,
        category: 'TRAVEL',
        academicTerm: '2026-2027',
        description: 'Inter-college symposium transport bus hire',
        status: 'SUBMITTED',
      });
      await claimToDisburse.save();

      // Approve claim first
      await request(app)
        .post(`/api/finance/reimbursements/${claimToDisburse.id}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ action: 'APPROVED' });
    });

    afterAll(async () => {
      if (claimToDisburse) {
        await Reimbursement.deleteOne({ id: claimToDisburse.id });
        await Expense.deleteOne({ reference: `EXP-${claimToDisburse.claimNumber}` });
        await LedgerEntry.deleteOne({
          idempotencyKey: `REIMBURSEMENT_DISBURSEMENT_${claimToDisburse.claimNumber}`,
        });
      }
    });

    it('Unapproved claim cannot be disbursed (Validation guard)', async () => {
      const unapprovedClaim = new Reimbursement({
        claimantId: studentUser.id,
        amount: 500,
        category: 'SUPPLIES',
        description: 'Awaiting approval',
        status: 'SUBMITTED',
      });
      await unapprovedClaim.save();

      const res = await request(app)
        .post(`/api/finance/reimbursements/${unapprovedClaim.id}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: 'RMB-TEST-REF' });

      expect(res.status).toBe(400);

      await Reimbursement.deleteOne({ id: unapprovedClaim.id });
    });

    it('Disbursing reimbursement requires payment reference evidence', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${claimToDisburse.id}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: '   ' }); // Empty reference

      expect(res.status).toBe(400);
    });

    it('Authorized payout updates Reimbursement, linked Expense, and posts to General Ledger', async () => {
      const paymentRef = `UTR-BANK-${ts}`;
      const res = await request(app)
        .post(`/api/finance/reimbursements/${claimToDisburse.id}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          paymentReference: paymentRef,
          disbursementMethod: 'DIRECT_TRANSFER',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.paymentStatus).toBe('PAID');
      expect(res.body.data.paymentReference).toBe(paymentRef);

      // Verify linked Expense also updated to PAID
      const linkedExpense = await Expense.findOne({
        reference: `EXP-${claimToDisburse.claimNumber}`,
      });
      expect(linkedExpense.paymentStatus).toBe('PAID');
      expect(linkedExpense.paymentReference).toBe(paymentRef);

      // Verify General Ledger entry posted idempotently
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `REIMBURSEMENT_DISBURSEMENT_${claimToDisburse.claimNumber}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.entryType).toBe('REIMBURSEMENT');
      expect(ledgerEntry.amount).toBe(3200);
    });

    it('Paid reimbursement cannot be disbursed again (Double-spend prevention)', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${claimToDisburse.id}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: `ANOTHER-REF-${ts}` });

      expect([400, 409]).toContain(res.status);
    });
  });

  /* =========================================================================
   * 7. REPORTS & CSV EXPORT
   * ========================================================================= */
  describe('7. Financial Reports & CSV Export', () => {
    it('GET /api/treasurer/reports returns structured term and dues analytics', async () => {
      const res = await request(app)
        .get('/api/treasurer/reports')
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('termReports');
      expect(res.body.data).toHaveProperty('duesStatusBreakdown');
      expect(res.body.data).toHaveProperty('paymentBreakdown');
    });

    it('GET /api/treasurer/reports/export streams valid CSV with correct headers and data', async () => {
      const res = await request(app)
        .get('/api/treasurer/reports/export?academicTerm=2026-2027')
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('Section');
      expect(res.text).toContain('Record ID');
      expect(res.text).toContain('Amount');
    });
  });

  /* =========================================================================
   * 8. AUDIT HISTORY PRESERVATION
   * ========================================================================= */
  describe('8. Audit History Integrity', () => {
    it('Audit logs are recorded across all Treasurer financial state transitions', async () => {
      const logs = await AuditLog.find({
        action: {
          $in: [
            'SPONSORSHIP_COMMITTED',
            'COLLECTION_RECORDED',
            'COLLECTION_VERIFIED',
            'REIMBURSEMENT_APPROVED',
            'REIMBURSEMENT_DISBURSED',
          ],
        },
      });

      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
  });
});
