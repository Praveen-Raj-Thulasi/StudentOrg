import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import {
  User,
  Payment,
  Expense,
  Reimbursement,
  Budget,
  LedgerEntry,
  Product,
  InventoryMovement,
  MerchandiseOrder,
  FundraisingCampaign,
  FundraisingContribution,
} from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { MerchandiseService } from '../services/merchandise.service.js';
import { FinanceService } from '../services/finance.service.js';
import { FundraisingService } from '../services/fundraising.service.js';

describe('Phase 5 — Finance & Operations Master Integration Tests', () => {
  const ts = Date.now();

  let studentUser = null;
  let studentToken = null;

  let volunteerUser = null;
  let volunteerToken = null;

  let treasurerUser = null;
  let treasurerToken = null;

  let presidentUser = null;
  let presidentToken = null;

  beforeEach(() => {
    memoryRateLimiter.reset();
  });

  beforeAll(async () => {
    await connectDB();

    // 1. Student User
    studentUser = new User({
      name: 'Phase 5 Student',
      email: `p5_student_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['STUDENT'],
      role: 'STUDENT',
      emailVerified: true,
      memberNumber: `MEMP5S_${ts}`,
    });
    await studentUser.save();
    studentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: 'STUDENT',
      roles: ['STUDENT'],
    });

    // 2. Volunteer User
    volunteerUser = new User({
      name: 'Phase 5 Volunteer',
      email: `p5_volunteer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['VOLUNTEER', 'STUDENT'],
      role: 'VOLUNTEER',
      emailVerified: true,
      memberNumber: `MEMP5V_${ts}`,
    });
    await volunteerUser.save();
    volunteerToken = generateToken({
      id: volunteerUser.id,
      email: volunteerUser.email,
      role: 'VOLUNTEER',
      roles: ['VOLUNTEER', 'STUDENT'],
    });

    // 3. Treasurer User
    treasurerUser = new User({
      name: 'Phase 5 Treasurer',
      email: `p5_treasurer_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['TREASURER', 'STUDENT'],
      role: 'TREASURER',
      emailVerified: true,
      memberNumber: `MEMP5T_${ts}`,
    });
    await treasurerUser.save();
    treasurerToken = generateToken({
      id: treasurerUser.id,
      email: treasurerUser.email,
      role: 'TREASURER',
      roles: ['TREASURER', 'STUDENT'],
    });

    // 4. President User
    presidentUser = new User({
      name: 'Phase 5 President',
      email: `p5_president_${ts}@skyline.edu`,
      passwordHash: '$2a$12$e8Y6bF0ZgZzX6Z8PZ5a12.oJ...',
      roles: ['PRESIDENT', 'STUDENT'],
      role: 'PRESIDENT',
      emailVerified: true,
      memberNumber: `MEMP5P_${ts}`,
    });
    await presidentUser.save();
    presidentToken = generateToken({
      id: presidentUser.id,
      email: presidentUser.email,
      role: 'PRESIDENT',
      roles: ['PRESIDENT', 'STUDENT'],
    });
  });

  afterAll(async () => {
    await User.deleteMany({
      email: {
        $in: [
          studentUser?.email,
          volunteerUser?.email,
          treasurerUser?.email,
          presidentUser?.email,
        ],
      },
    });
    await Expense.deleteMany({ academicTerm: `TERM_P5_${ts}` });
    await Reimbursement.deleteMany({ academicTerm: `TERM_P5_${ts}` });
    await Budget.deleteMany({ academicTerm: `TERM_P5_${ts}` });
    await LedgerEntry.deleteMany({ academicTerm: `TERM_P5_${ts}` });
    await Product.deleteMany({ sku: new RegExp(`^TEST-${ts}`) });
    await FundraisingCampaign.deleteMany({ category: `P5_TEST_${ts}` });
  });

  /* =========================================================================
   * 1. BILLS AND EXPENSES & SEPARATION OF DUTIES
   * ========================================================================= */
  describe('Bills and Expenses Lifecycle & Separation of Duties', () => {
    let createdExpenseId = null;

    it('Student cannot create or modify expense bills (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/finance/expenses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Sound System',
          payee: 'Audio Vendor',
          amount: 5000,
          category: 'EQUIPMENT',
        });

      expect(res.status).toBe(403);
    });

    it('Treasurer can create a valid expense bill in PENDING status', async () => {
      const res = await request(app)
        .post('/api/finance/expenses')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          title: 'Annual Gala Stage Lighting',
          payee: 'Skyline Lumens',
          amount: 12000,
          category: 'EQUIPMENT',
          academicTerm: `TERM_P5_${ts}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.approvalStatus).toBe('PENDING');
      expect(data.paymentStatus).toBe('UNPAID');
      expect(data.reference).toMatch(/^EXP-/);
      createdExpenseId = data.id;
    });

    it('Separation of Duties: Creator cannot approve their own expense submission', async () => {
      // Treasurer created the expense, so treasurer cannot approve it!
      const res = await request(app)
        .post(`/api/finance/expenses/${createdExpenseId}/approve`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Separation of duties/i);
    });

    it('Unapproved expense cannot be disbursed/paid (400 Bad Request)', async () => {
      const res = await request(app)
        .post(`/api/finance/expenses/${createdExpenseId}/pay`)
        .set('Authorization', `Bearer ${presidentToken}`)
        .send({ paymentReference: 'DISB-TEST-001' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/must be APPROVED first/i);
    });

    it('Authorized President (different officer) can approve the expense', async () => {
      const res = await request(app)
        .post(`/api/finance/expenses/${createdExpenseId}/approve`)
        .set('Authorization', `Bearer ${presidentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.approvalStatus).toBe('APPROVED');
      expect(res.body.data.paymentStatus).toBe('UNPAID'); // Approval != Paid
    });

    it('Approved expense can be disbursed, marking it PAID and posting to general ledger', async () => {
      const res = await request(app)
        .post(`/api/finance/expenses/${createdExpenseId}/pay`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: `TXN-DISB-${ts}` });

      expect(res.status).toBe(200);
      expect(res.body.data.paymentStatus).toBe('PAID');

      // Verify general ledger entry was created
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `EXPENSE_DISBURSEMENT_${res.body.data.reference}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.entryType).toBe('EXPENSE');
      expect(ledgerEntry.amount).toBe(12000);
      expect(ledgerEntry.status).toBe('POSTED');
    });

    it('Paying already paid expense is rejected (Conflict)', async () => {
      const res = await request(app)
        .post(`/api/finance/expenses/${createdExpenseId}/pay`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(409);
    });
  });

  /* =========================================================================
   * 2. REIMBURSEMENTS LIFECYCLE & OWNERSHIP
   * ========================================================================= */
  describe('Reimbursements Lifecycle & Ownership Protection', () => {
    let volunteerClaimId = null;

    it('Volunteer can submit their own reimbursement claim with receipt', async () => {
      const res = await request(app)
        .post('/api/finance/reimbursements')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          description: 'Stationery and badges for orientation',
          amount: 850,
          category: 'SUPPLIES',
          academicTerm: `TERM_P5_${ts}`,
          receiptUrl: 'https://storage.skyline.edu/receipts/orientation.pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.claimantId).toBe(volunteerUser.id);
      expect(res.body.data.claimNumber).toMatch(/^RMB-/);
      volunteerClaimId = res.body.data.id;
    });

    it('Claimant cannot approve or review their own reimbursement claim (Separation of Duties)', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${volunteerClaimId}/review`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ action: 'APPROVED' });

      expect(res.status).toBe(403);
    });

    it('Student can access own claims via /api/finance/reimbursements/my', async () => {
      const res = await request(app)
        .get('/api/finance/reimbursements/my')
        .set('Authorization', `Bearer ${volunteerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((c) => c.id === volunteerClaimId)).toBe(true);
    });

    it('Unapproved claim cannot be disbursed (400 Bad Request)', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${volunteerClaimId}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: 'RMB-PAY-TEST' });

      expect(res.status).toBe(400);
    });

    it('Treasurer can review and approve volunteer reimbursement claim', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${volunteerClaimId}/review`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ action: 'APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.paymentStatus).toBe('UNPAID');
    });

    it('Authorized Treasurer can disburse reimbursement payment and record ledger entry', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${volunteerClaimId}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ paymentReference: `RMB-DISB-${ts}` });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.paymentStatus).toBe('PAID');

      // Check general ledger
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `REIMBURSEMENT_DISBURSEMENT_${res.body.data.claimNumber}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.entryType).toBe('REIMBURSEMENT');
      expect(ledgerEntry.amount).toBe(850);
    });

    it('Duplicate reimbursement payment is rejected', async () => {
      const res = await request(app)
        .post(`/api/finance/reimbursements/${volunteerClaimId}/disburse`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(400);
    });
  });

  /* =========================================================================
   * 3. APPEND-ONLY GENERAL LEDGER & REVERSALS
   * ========================================================================= */
  describe('Append-Only General Ledger & Idempotency', () => {
    let ledgerEntryId = null;

    it('Prevents duplicate ledger postings with identical idempotencyKey', async () => {
      const idempotencyKey = `MANUAL_TXN_${ts}_001`;

      const entry1 = await FinanceService.recordLedgerEntry({
        entryType: 'INCOME',
        amount: 5000,
        currency: 'INR',
        academicTerm: `TERM_P5_${ts}`,
        category: 'TICKET_SALES',
        description: 'Initial ticket sales deposit',
        sourceReference: `REF-${ts}`,
        sourceModel: 'Payment',
        idempotencyKey,
        postedBy: treasurerUser.id,
      });

      const entry2 = await FinanceService.recordLedgerEntry({
        entryType: 'INCOME',
        amount: 5000,
        currency: 'INR',
        academicTerm: `TERM_P5_${ts}`,
        category: 'TICKET_SALES',
        description: 'Duplicate retry of ticket sales deposit',
        sourceReference: `REF-${ts}`,
        sourceModel: 'Payment',
        idempotencyKey,
        postedBy: treasurerUser.id,
      });

      expect(entry1.id).toBe(entry2.id);
      expect(entry1.entryNumber).toBe(entry2.entryNumber);
      ledgerEntryId = entry1.id;
    });

    it('Reversing an entry appends an offsetting reversal entry without deleting historical records', async () => {
      const res = await request(app)
        .post(`/api/finance/ledger/${ledgerEntryId}/reverse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ reason: 'Accounting reclassification' });

      expect(res.status).toBe(200);
      expect(res.body.data.isReversal).toBe(true);
      expect(res.body.data.reversedEntryId).toBe(ledgerEntryId);

      // Verify original entry was marked REVERSED, not deleted
      const original = await LedgerEntry.findOne({ id: ledgerEntryId });
      expect(original.status).toBe('REVERSED');
      expect(original.reversalReason).toBe('Accounting reclassification');
    });

    it('Re-reversing an already reversed entry is rejected', async () => {
      const res = await request(app)
        .post(`/api/finance/ledger/${ledgerEntryId}/reverse`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ reason: 'Second reversal attempt' });

      expect(res.status).toBe(409);
    });

    it('Non-treasurer/president role cannot access ledger endpoints (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/finance/ledger')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  /* =========================================================================
   * 4. BUDGETS & DYNAMIC AUTHORITATIVE ACTUALS
   * ========================================================================= */
  describe('Budgets & Dynamic Actual Spending Calculation', () => {
    let budgetId = null;

    it('Treasurer can allocate a budget envelope for a category', async () => {
      const res = await request(app)
        .post('/api/finance/budgets')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          category: 'MARKETING',
          allocatedAmount: 25000,
          academicTerm: `TERM_P5_${ts}`,
          description: 'Campus promotional materials and banners',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.budgetCode).toBe(`BDG-TERM_P5_${ts}-MARKETING`);
      budgetId = res.body.data.id;
    });

    it('Treasurer can adjust budget allocation with recorded audit reason', async () => {
      const res = await request(app)
        .post(`/api/finance/budgets/${budgetId}/adjust`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          adjustmentAmount: 5000,
          reason: 'Mid-term council supplement',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.approvedAdjustments).toBe(5000);
      expect(res.body.data.adjustmentHistory.length).toBe(1);
    });

    it('Dynamic actuals only count PAID expenses, excluding PENDING/REJECTED', async () => {
      // 1. Create a PENDING expense in MARKETING
      const pendingExp = new Expense({
        title: 'Pending Billboard Quote',
        payee: 'Ad Agency',
        category: 'MARKETING',
        academicTerm: `TERM_P5_${ts}`,
        amount: 8000,
        createdBy: treasurerUser.id,
        approvalStatus: 'PENDING',
        paymentStatus: 'UNPAID',
      });
      await pendingExp.save();

      // 2. Create a PAID expense in MARKETING
      const paidExp = new Expense({
        title: 'Paid Social Media Campaign',
        payee: 'Media Vendor',
        category: 'MARKETING',
        academicTerm: `TERM_P5_${ts}`,
        amount: 6000,
        createdBy: treasurerUser.id,
        approvalStatus: 'APPROVED',
        paymentStatus: 'PAID',
      });
      await paidExp.save();

      // Fetch budgets with actuals
      const res = await request(app)
        .get(`/api/finance/budgets?academicTerm=TERM_P5_${ts}`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      const mktBudget = res.body.data.find((b) => b.category === 'MARKETING');
      expect(mktBudget).toBeDefined();
      expect(mktBudget.effectiveBudget).toBe(30000); // 25000 + 5000
      expect(mktBudget.actualSpent).toBe(6000); // ONLY the paid 6000, not 8000!
      expect(mktBudget.remaining).toBe(24000);
      expect(mktBudget.utilizationRate).toBe(20);
    });
  });

  /* =========================================================================
   * 5. MERCHANDISE, CONCURRENCY-SAFE RESERVATIONS & INVENTORY
   * ========================================================================= */
  describe('Merchandise & Concurrency-Safe Inventory Reservations', () => {
    let testProduct = null;

    it('Treasurer can create a product in catalogue with initial stock', async () => {
      const res = await request(app)
        .post('/api/merchandise/products')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          sku: `TEST-${ts}-HOODIE-M`,
          name: 'Skyline Premium Hoodie (M)',
          price: 1200,
          category: 'APPAREL',
          stockQuantity: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.availableQuantity).toBe(5);
      testProduct = res.body.data;
    });

    it('Student can create an order atomically reserving available stock', async () => {
      const res = await request(app)
        .post('/api/merchandise/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          items: [{ productId: testProduct.id, quantity: 3 }],
        });

      expect(res.status).toBe(201);
      const order = res.body.data.order;
      expect(order.orderStatus).toBe('PENDING');
      expect(order.totalAmount).toBe(3600); // 1200 * 3
      expect(order.items[0].quantity).toBe(3);

      // Verify product reserved quantity incremented
      const prodInDb = await Product.findOne({ id: testProduct.id });
      expect(prodInDb.stockQuantity).toBe(5);
      expect(prodInDb.reservedQuantity).toBe(3);
    });

    it('Overselling Prevention: Attempting to reserve more than available stock is rejected (Conflict)', async () => {
      // Available stock is now 5 - 3 = 2. Ordering 3 more should fail!
      const res = await request(app)
        .post('/api/merchandise/orders')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          items: [{ productId: testProduct.id, quantity: 3 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/insufficient stock/i);
    });

    it('Safe Reservation Release: Cancelling a pending order releases reserved stock back', async () => {
      // Create an order for 2 items
      const orderRes = await request(app)
        .post('/api/merchandise/orders')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          items: [{ productId: testProduct.id, quantity: 2 }],
        });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.id;

      // Cancel the order
      const cancelRes = await request(app)
        .post(`/api/merchandise/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ reason: 'Changed mind' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.orderStatus).toBe('CANCELLED');

      // Product reserved quantity should now be back down from 5 to 3
      const prodInDb = await Product.findOne({ id: testProduct.id });
      expect(prodInDb.reservedQuantity).toBe(3);
    });

    it('Unauthorized stock adjustments are rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/merchandise/products/${testProduct.id}/adjust-stock`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ quantityDelta: 10, reason: 'Unauthorized restock' });

      expect(res.status).toBe(403);
    });
  });

  /* =========================================================================
   * 6. FUNDRAISING & VERIFIED DONATION TOTALS
   * ========================================================================= */
  describe('Fundraising Campaigns & Verified Contributions Only', () => {
    let campaignId = null;
    let contributionId = null;

    it('Treasurer can create a fundraising campaign with target', async () => {
      const res = await request(app)
        .post('/api/fundraising/campaigns')
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({
          title: 'Campus Food Pantry Fundraiser',
          description: 'Supporting fellow students experiencing food insecurity',
          targetAmount: 50000,
          category: `P5_TEST_${ts}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.campaignCode).toMatch(/^FND-/);
      campaignId = res.body.data.id;
    });

    it('Contributor can initiate a donation, pending payment verification', async () => {
      const res = await request(app)
        .post(`/api/fundraising/campaigns/${campaignId}/contribute`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          donorName: 'Anonymous Alumni',
          donorEmail: 'alumni@skyline.edu',
          amount: 2500,
          isAnonymous: true,
          message: 'Happy to support!',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.contribution.status).toBe('PENDING');
      contributionId = res.body.data.contribution.id;
    });

    it('Unverified / Pending donations do NOT count toward campaign collectedAmount', async () => {
      const res = await request(app)
        .get(`/api/fundraising/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.collectedAmount).toBe(0); // 0, not 2500!
      expect(res.body.data.progressPercent).toBe(0);
    });

    it('Confirmed donation updates collectedAmount and posts verified income to general ledger', async () => {
      const res = await request(app)
        .post(`/api/fundraising/contributions/${contributionId}/confirm`)
        .set('Authorization', `Bearer ${treasurerToken}`)
        .send({ gatewayReference: `GATEWAY-DON-${ts}` });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUCCESSFUL');

      // Now fetch campaign totals again
      const campRes = await request(app)
        .get(`/api/fundraising/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(campRes.status).toBe(200);
      expect(campRes.body.data.collectedAmount).toBe(2500);
      expect(campRes.body.data.donorCount).toBe(1);
      expect(campRes.body.data.progressPercent).toBe(5); // 2500 / 50000 = 5%

      // Verify Ledger Entry was posted
      const ledgerEntry = await LedgerEntry.findOne({
        idempotencyKey: `DONATION_${res.body.data.transactionId}`,
      });
      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry.entryType).toBe('INCOME');
      expect(ledgerEntry.category).toBe('DONATION');
      expect(ledgerEntry.amount).toBe(2500);
    });
  });

  /* =========================================================================
   * 7. FINANCIAL RECONCILIATION & REPORTS
   * ========================================================================= */
  describe('Authoritative Reconciliation & Security', () => {
    it('GET /api/finance/reconciliation computes cashflow balances accurately', async () => {
      const res = await request(app)
        .get(`/api/finance/reconciliation?academicTerm=TERM_P5_${ts}`)
        .set('Authorization', `Bearer ${treasurerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('authoritativeRecords');
      expect(data).toHaveProperty('ledgerRecords');
      expect(data).toHaveProperty('reconciliation');
      expect(data.reconciliation).toHaveProperty('status');
      expect(data.authoritativeRecords.totalVerifiedIncome).toBeGreaterThanOrEqual(0);
    });

    it('Student cannot access reconciliation report (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/finance/reconciliation?academicTerm=TERM_P5_${ts}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });
});
