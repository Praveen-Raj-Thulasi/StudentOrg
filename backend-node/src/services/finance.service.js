import {
  Expense,
  Reimbursement,
  Budget,
  LedgerEntry,
  Payment,
  AuditLog,
  User,
} from '../models/index.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class FinanceService {
  /* =========================================================================
   * 1. BILLS AND EXPENSES
   * ========================================================================= */

  static async createExpense(data, userId) {
    if (!data.title || !data.payee || data.amount === undefined) {
      throw new BadRequestError('Title, payee, and amount are required');
    }
    if (data.reference && (data.reference.startsWith('EXP-RMB-') || data.reference.startsWith('RMB-'))) {
      throw new ConflictError('Cannot manually create an expense for a reimbursement claim. Claims must be approved via the reimbursement workflow.');
    }
    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestError('Expense amount must be a positive number');
    }

    const expense = new Expense({
      title: data.title.trim(),
      payee: data.payee.trim(),
      description: (data.description || '').trim(),
      category: data.category || 'OPERATIONS',
      academicTerm: data.academicTerm || '2026-2027',
      amount,
      currency: data.currency || 'INR',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      receiptUrl: data.receiptUrl || null,
      createdBy: userId,
      approvalStatus: 'PENDING',
      paymentStatus: 'UNPAID',
    });

    const saved = await expense.save();

    await AuditLog.create({
      userId,
      role: 'TREASURER',
      action: 'EXPENSE_CREATED',
      resourceType: 'EXPENSE',
      resourceId: String(saved.id),
      details: `Created expense ${saved.reference} for ${saved.payee} amounting to ${saved.amount}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async getExpenses(filter = {}) {
    const query = {};
    if (filter.academicTerm && filter.academicTerm !== 'ALL') {
      query.academicTerm = filter.academicTerm;
    }
    if (filter.category) query.category = filter.category;
    if (filter.approvalStatus) query.approvalStatus = filter.approvalStatus;
    if (filter.paymentStatus) query.paymentStatus = filter.paymentStatus;

    return Expense.find(query).sort({ createdAt: -1 });
  }

  static async getExpenseById(expenseId) {
    const expense = await Expense.findOne({ id: Number(expenseId) });
    if (!expense) throw new NotFoundError(`Expense #${expenseId} not found`);
    return expense;
  }

  static async approveExpense(expenseId, reviewerId) {
    const expense = await this.getExpenseById(expenseId);

    if (expense.approvalStatus !== 'PENDING') {
      throw new ConflictError(`Expense is already ${expense.approvalStatus}`);
    }

    // Separation of duties rule: creator cannot approve their own expense
    if (expense.createdBy === reviewerId) {
      throw new ForbiddenError(
        'Separation of duties violation: You cannot approve your own expense submission'
      );
    }

    expense.approvalStatus = 'APPROVED';
    expense.approvedBy = reviewerId;
    expense.approvedAt = new Date();
    expense.rejectionReason = null;

    const saved = await expense.save();

    await AuditLog.create({
      userId: reviewerId,
      role: 'TREASURER',
      action: 'EXPENSE_APPROVED',
      resourceType: 'EXPENSE',
      resourceId: String(saved.id),
      details: `Approved expense ${saved.reference} for ${saved.amount}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async rejectExpense(expenseId, reviewerId, reason) {
    const expense = await this.getExpenseById(expenseId);

    if (expense.paymentStatus === 'PAID') {
      throw new ConflictError('Cannot reject an expense that has already been paid');
    }
    if (expense.createdBy === reviewerId) {
      throw new ForbiddenError(
        'Separation of duties violation: You cannot reject your own expense submission'
      );
    }

    expense.approvalStatus = 'REJECTED';
    expense.approvedBy = reviewerId;
    expense.approvedAt = new Date();
    expense.rejectionReason = (reason || 'Rejected by finance authority').trim();

    const saved = await expense.save();

    await AuditLog.create({
      userId: reviewerId,
      role: 'TREASURER',
      action: 'EXPENSE_REJECTED',
      resourceType: 'EXPENSE',
      resourceId: String(saved.id),
      details: `Rejected expense ${saved.reference}: ${expense.rejectionReason}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async payExpense(expenseId, payerId, { paymentReference, disbursementMethod = 'DIRECT_TRANSFER' } = {}) {
    const expense = await this.getExpenseById(expenseId);

    // Rule: Must be approved first before disbursement
    if (expense.approvalStatus !== 'APPROVED') {
      throw new BadRequestError(
        `Cannot pay expense with approvalStatus ${expense.approvalStatus}. Expense must be APPROVED first.`
      );
    }

    if (expense.paymentStatus === 'PAID') {
      throw new ConflictError(`Expense ${expense.reference} has already been paid.`);
    }

    expense.paymentStatus = 'PAID';
    expense.paidAt = new Date();
    expense.paidBy = payerId;
    expense.paymentReference = paymentReference || `DISB-${Date.now()}`;

    const saved = await expense.save();

    // Append to general ledger idempotently
    await this.recordLedgerEntry({
      entryType: 'EXPENSE',
      amount: saved.amount,
      currency: saved.currency,
      academicTerm: saved.academicTerm,
      category: saved.category,
      description: `Disbursement for expense ${saved.reference} to payee ${saved.payee}`,
      sourceReference: saved.reference,
      sourceModel: 'Expense',
      idempotencyKey: `EXPENSE_DISBURSEMENT_${saved.reference}`,
      postedBy: payerId,
    });

    await AuditLog.create({
      userId: payerId,
      role: 'TREASURER',
      action: 'EXPENSE_DISBURSED',
      resourceType: 'EXPENSE',
      resourceId: String(saved.id),
      details: `Paid expense ${saved.reference} (${saved.amount} ${saved.currency}) via ${disbursementMethod}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  /* =========================================================================
   * 2. REIMBURSEMENTS
   * ========================================================================= */

  static async submitReimbursementClaim(data, userId) {
    if (!data.description || data.amount === undefined) {
      throw new BadRequestError('Description and amount are required for reimbursement');
    }
    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestError('Reimbursement claim amount must be greater than zero');
    }

    const claim = new Reimbursement({
      claimantId: userId,
      category: data.category || 'SUPPLIES',
      academicTerm: data.academicTerm || '2026-2027',
      amount,
      currency: data.currency || 'INR',
      description: data.description.trim(),
      receiptUrl: data.receiptUrl || null,
      status: 'SUBMITTED',
      paymentStatus: 'UNPAID',
    });

    const saved = await claim.save();

    await AuditLog.create({
      userId,
      role: 'STUDENT',
      action: 'REIMBURSEMENT_CLAIMED',
      resourceType: 'REIMBURSEMENT',
      resourceId: String(saved.id),
      details: `Submitted reimbursement claim ${saved.claimNumber} for ${saved.amount}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async getMyClaims(userId) {
    return Reimbursement.find({ claimantId: userId }).sort({ createdAt: -1 });
  }

  static async getAllClaims(filter = {}) {
    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.paymentStatus) query.paymentStatus = filter.paymentStatus;
    if (filter.academicTerm && filter.academicTerm !== 'ALL') {
      query.academicTerm = filter.academicTerm;
    }
    return Reimbursement.find(query).sort({ createdAt: -1 });
  }

  static async getClaimById(claimId) {
    const claim = await Reimbursement.findOne({ id: Number(claimId) });
    if (!claim) throw new NotFoundError(`Reimbursement claim #${claimId} not found`);
    return claim;
  }

  static async reviewClaim(claimId, reviewerId, { action, reason } = {}) {
    const claim = await this.getClaimById(claimId);

    if (claim.status === 'PAID' || claim.status === 'CANCELLED') {
      throw new ConflictError(`Cannot review claim in ${claim.status} status`);
    }

    // Separation of duties rule: claimant cannot approve their own claim
    if (claim.claimantId === reviewerId) {
      throw new ForbiddenError(
        'Separation of duties violation: You cannot review or approve your own reimbursement claim'
      );
    }

    if (action === 'APPROVED') {
      if (claim.status !== 'SUBMITTED' && claim.status !== 'UNDER_REVIEW') {
        throw new ConflictError(`Cannot approve claim in status ${claim.status}. Claim must be SUBMITTED or UNDER_REVIEW.`);
      }

      claim.status = 'APPROVED';
      claim.reviewerId = reviewerId;
      claim.reviewedAt = new Date();
      claim.rejectionReason = null;

      const saved = await claim.save();

      // Create exactly one linked expense transaction (idempotent check)
      const linkedExpenseRef = `EXP-${claim.claimNumber}`;
      let linkedExpense = await Expense.findOne({ reference: linkedExpenseRef });
      if (!linkedExpense) {
        const validCategories = ['SUPPLIES', 'MARKETING', 'FACILITIES', 'HONORARIUM', 'REFRESHMENTS', 'EQUIPMENT', 'OPERATIONS'];
        const expCategory =
          claim.category === 'TRAVEL'
            ? 'OPERATIONS'
            : claim.category === 'FOOD_EVENT'
            ? 'REFRESHMENTS'
            : validCategories.includes(claim.category)
            ? claim.category
            : 'OPERATIONS';

        linkedExpense = new Expense({
          reference: linkedExpenseRef,
          title: `Reimbursement: ${(claim.description || '').slice(0, 150)}`,
          payee: `Claimant #${claim.claimantId}`,
          description: `Auto-generated from approved claim ${claim.claimNumber}`,
          category: expCategory,
          academicTerm: claim.academicTerm || '2026-2027',
          amount: claim.amount,
          currency: claim.currency || 'INR',
          dueDate: null,
          receiptUrl: claim.receiptUrl || null,
          createdBy: claim.claimantId,
          approvedBy: reviewerId,
          approvedAt: new Date(),
          approvalStatus: 'APPROVED',
          paymentStatus: 'UNPAID',
        });
        await linkedExpense.save();
      }

      await AuditLog.create({
        userId: reviewerId,
        role: 'TREASURER',
        action: 'REIMBURSEMENT_APPROVED',
        resourceType: 'REIMBURSEMENT',
        resourceId: String(saved.id),
        details: `Approved reimbursement claim ${saved.claimNumber} and generated linked expense ${linkedExpenseRef}`,
      }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

      return saved;
    } else if (action === 'REJECTED') {
      if (!reason || !reason.trim()) {
        throw new BadRequestError('Rejection reason is required');
      }
      claim.status = 'REJECTED';
      claim.reviewerId = reviewerId;
      claim.reviewedAt = new Date();
      claim.rejectionReason = reason.trim();

      const saved = await claim.save();

      await AuditLog.create({
        userId: reviewerId,
        role: 'TREASURER',
        action: 'REIMBURSEMENT_REJECTED',
        resourceType: 'REIMBURSEMENT',
        resourceId: String(saved.id),
        details: `Rejected reimbursement claim ${saved.claimNumber}: ${saved.rejectionReason}`,
      }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

      return saved;
    } else {
      throw new BadRequestError('Action must be either APPROVED or REJECTED');
    }
  }

  static async disburseClaim(claimId, payerId, { paymentReference, disbursementMethod = 'DIRECT_TRANSFER' } = {}) {
    const claim = await this.getClaimById(claimId);

    if (claim.status !== 'APPROVED') {
      throw new BadRequestError(
        `Cannot disburse claim in ${claim.status} state. Claim must be APPROVED first.`
      );
    }

    if (claim.paymentStatus === 'PAID') {
      throw new ConflictError(`Reimbursement claim ${claim.claimNumber} has already been paid.`);
    }

    if (!paymentReference || !paymentReference.trim()) {
      throw new BadRequestError('Payment reference and evidence are required to disburse reimbursements.');
    }

    claim.status = 'PAID';
    claim.paymentStatus = 'PAID';
    claim.paidAt = new Date();
    claim.paidBy = payerId;
    claim.disbursementMethod = disbursementMethod;
    claim.paymentReference = paymentReference.trim();

    const saved = await claim.save();

    // Also update linked Expense if it exists
    const linkedExpenseRef = `EXP-${claim.claimNumber}`;
    const linkedExp = await Expense.findOne({ reference: linkedExpenseRef });
    if (linkedExp && linkedExp.paymentStatus !== 'PAID') {
      linkedExp.paymentStatus = 'PAID';
      linkedExp.paidAt = new Date();
      linkedExp.paidBy = payerId;
      linkedExp.paymentReference = paymentReference.trim();
      await linkedExp.save();
    }

    // Append to general ledger idempotently
    await this.recordLedgerEntry({
      entryType: 'REIMBURSEMENT',
      amount: saved.amount,
      currency: saved.currency,
      academicTerm: saved.academicTerm,
      category: 'REIMBURSEMENT',
      description: `Disbursement for claim ${saved.claimNumber} to user ${saved.claimantId}`,
      sourceReference: saved.claimNumber,
      sourceModel: 'Reimbursement',
      idempotencyKey: `REIMBURSEMENT_DISBURSEMENT_${saved.claimNumber}`,
      postedBy: payerId,
    });

    await AuditLog.create({
      userId: payerId,
      role: 'TREASURER',
      action: 'REIMBURSEMENT_DISBURSED',
      resourceType: 'REIMBURSEMENT',
      resourceId: String(saved.id),
      details: `Paid reimbursement ${saved.claimNumber} (${saved.amount} ${saved.currency}) via ${disbursementMethod}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  /* =========================================================================
   * 3. BUDGETS
   * ========================================================================= */

  static async createBudget(data, userId) {
    if (!data.category || data.allocatedAmount === undefined) {
      throw new BadRequestError('Category and allocatedAmount are required');
    }
    const allocated = Number(data.allocatedAmount);
    if (isNaN(allocated) || allocated < 0) {
      throw new BadRequestError('Allocated amount must be non-negative');
    }

    const academicTerm = data.academicTerm || '2026-2027';

    const existing = await Budget.findOne({ academicTerm, category: data.category });
    if (existing) {
      throw new ConflictError(`Budget for category ${data.category} in term ${academicTerm} already exists`);
    }

    const budget = new Budget({
      academicTerm,
      category: data.category,
      allocatedAmount: allocated,
      approvedAdjustments: 0,
      description: (data.description || '').trim(),
      createdBy: userId,
    });

    const saved = await budget.save();

    await AuditLog.create({
      userId,
      role: 'TREASURER',
      action: 'BUDGET_CREATED',
      resourceType: 'BUDGET',
      resourceId: String(saved.id),
      details: `Created budget ${saved.budgetCode} for ${saved.allocatedAmount}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async adjustBudget(budgetId, { adjustmentAmount, reason }, userId) {
    const budget = await Budget.findOne({ id: Number(budgetId) });
    if (!budget) throw new NotFoundError(`Budget #${budgetId} not found`);

    const adj = Number(adjustmentAmount);
    if (isNaN(adj) || adj === 0) {
      throw new BadRequestError('Adjustment amount must be a non-zero number');
    }
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Reason is required for budget adjustment');
    }

    const newAdjustments = budget.approvedAdjustments + adj;
    if (budget.allocatedAmount + newAdjustments < 0) {
      throw new BadRequestError('Adjustment would result in negative total allocated budget');
    }

    budget.approvedAdjustments = newAdjustments;
    budget.adjustmentHistory.push({
      adjustmentAmount: adj,
      reason: reason.trim(),
      adjustedBy: userId,
      adjustedAt: new Date(),
    });

    const saved = await budget.save();

    await AuditLog.create({
      userId,
      role: 'TREASURER',
      action: 'BUDGET_ADJUSTED',
      resourceType: 'BUDGET',
      resourceId: String(saved.id),
      details: `Adjusted budget ${saved.budgetCode} by ${adj} (${reason})`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  /**
   * Derive budget vs actual expenses dynamically from authoritative records.
   * Only PAID expenses count toward actuals.
   */
  static async getBudgetsWithActuals(academicTerm = '2026-2027') {
    const termFilter = academicTerm && academicTerm !== 'ALL' ? { academicTerm } : {};
    const budgets = await Budget.find(termFilter).lean();

    // Pull authoritative paid expenses
    const paidExpenses = await Expense.find({
      ...termFilter,
      paymentStatus: 'PAID',
    }).select('category amount').lean();

    // Sum actual expenses by category
    const actualsMap = {};
    for (const exp of paidExpenses) {
      actualsMap[exp.category] = (actualsMap[exp.category] || 0) + Number(exp.amount || 0);
    }

    return budgets.map((b) => {
      const effectiveBudget = Number((b.allocatedAmount + (b.approvedAdjustments || 0)).toFixed(2));
      const actualSpent = Number((actualsMap[b.category] || 0).toFixed(2));
      const remaining = Number((effectiveBudget - actualSpent).toFixed(2));
      const utilizationRate =
        effectiveBudget > 0 ? Number(((actualSpent / effectiveBudget) * 100).toFixed(1)) : 0;

      return {
        ...b,
        effectiveBudget,
        actualSpent,
        remaining,
        utilizationRate,
      };
    });
  }

  /* =========================================================================
   * 4. APPEND-ONLY GENERAL LEDGER & AUDIT TRAIL
   * ========================================================================= */

  static async recordLedgerEntry({
    entryType,
    amount,
    currency = 'INR',
    academicTerm = '2026-2027',
    category = 'OPERATIONS',
    description,
    sourceReference,
    sourceModel,
    idempotencyKey,
    postedBy,
  }) {
    if (!idempotencyKey) {
      throw new BadRequestError('idempotencyKey is required for ledger entries');
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new BadRequestError('Ledger entry amount must be positive');
    }

    // Check existing entry by idempotency key
    const existing = await LedgerEntry.findOne({ idempotencyKey });
    if (existing) {
      logger.info(`Idempotent ledger hit for key: ${idempotencyKey}`);
      return existing;
    }

    const entry = new LedgerEntry({
      entryType,
      amount: numAmount,
      currency,
      academicTerm,
      category,
      description: description.trim(),
      sourceReference,
      sourceModel,
      idempotencyKey,
      postedBy,
      status: 'POSTED',
      isReversal: false,
    });

    return entry.save();
  }

  static async reverseLedgerEntry(entryId, { reason }, postedBy) {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Reason is required to reverse a ledger entry');
    }

    const original = await LedgerEntry.findOne({ id: Number(entryId) });
    if (!original) throw new NotFoundError(`Ledger entry #${entryId} not found`);

    if (original.status === 'REVERSED') {
      throw new ConflictError(`Ledger entry #${entryId} is already reversed`);
    }
    if (original.isReversal) {
      throw new BadRequestError('Cannot reverse an entry that is already a reversal entry');
    }

    const reversalIdempotencyKey = `REVERSAL_${original.entryNumber}`;
    const existingReversal = await LedgerEntry.findOne({ idempotencyKey: reversalIdempotencyKey });
    if (existingReversal) {
      return existingReversal;
    }

    // Mark original as REVERSED
    original.status = 'REVERSED';
    original.reversalReason = reason.trim();
    await original.save();

    // Create opposite reversal entry
    const reversalEntry = new LedgerEntry({
      entryType: original.entryType,
      amount: original.amount,
      currency: original.currency,
      academicTerm: original.academicTerm,
      category: original.category,
      description: `REVERSAL for ${original.entryNumber}: ${reason.trim()}`,
      sourceReference: original.sourceReference,
      sourceModel: original.sourceModel,
      idempotencyKey: reversalIdempotencyKey,
      postedBy,
      status: 'POSTED',
      isReversal: true,
      reversedEntryId: original.id,
      reversalReason: reason.trim(),
    });

    const savedReversal = await reversalEntry.save();

    await AuditLog.create({
      userId: postedBy,
      role: 'TREASURER',
      action: 'LEDGER_ENTRY_REVERSED',
      resourceType: 'LEDGER',
      resourceId: String(original.id),
      details: `Reversed ledger entry ${original.entryNumber} via reversal entry ${savedReversal.entryNumber}: ${reason}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return savedReversal;
  }

  static async getLedgerEntries(filter = {}, page = 1, limit = 50) {
    const query = {};
    if (filter.academicTerm && filter.academicTerm !== 'ALL') {
      query.academicTerm = filter.academicTerm;
    }
    if (filter.entryType) query.entryType = filter.entryType;
    if (filter.status) query.status = filter.status;
    if (filter.category) query.category = filter.category;

    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const [entries, total] = await Promise.all([
      LedgerEntry.find(query).sort({ id: -1 }).skip(skip).limit(Number(limit)),
      LedgerEntry.countDocuments(query),
    ]);

    return {
      entries,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  /* =========================================================================
   * 5. RECONCILIATION & ACCREDITED TOTALS REPORT
   * ========================================================================= */

  static async getReconciliationReport(academicTerm = '2026-2027') {
    const termQuery = academicTerm && academicTerm !== 'ALL' ? { academicTerm } : {};

    // 1. Authoritative verified payments
    const verifiedPayments = await Payment.find({ paymentStatus: 'SUCCESSFUL' }).lean();
    let totalVerifiedPayments = 0;
    const paymentsByType = { BOOKING: 0, DUES: 0, MERCHANDISE: 0, DONATION: 0 };

    for (const p of verifiedPayments) {
      const amt = Number(p.amount || 0);
      totalVerifiedPayments += amt;
      const t = p.paymentType || 'BOOKING';
      paymentsByType[t] = (paymentsByType[t] || 0) + amt;
    }

    // 2. Authoritative paid expenses
    const paidExpenses = await Expense.find({
      ...termQuery,
      paymentStatus: 'PAID',
    }).lean();
    const totalPaidExpenses = paidExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 3. Authoritative paid reimbursements
    const paidReimbursements = await Reimbursement.find({
      ...termQuery,
      status: 'PAID',
    }).lean();
    const totalPaidReimbursements = paidReimbursements.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    // 4. Ledger postings
    const ledgerFilter = academicTerm && academicTerm !== 'ALL' ? { academicTerm } : {};
    const ledgerEntries = await LedgerEntry.find({ ...ledgerFilter, status: 'POSTED' }).lean();

    let ledgerIncome = 0;
    let ledgerExpenses = 0;
    let ledgerReimbursements = 0;

    for (const entry of ledgerEntries) {
      const amt = Number(entry.amount || 0);
      if (entry.entryType === 'INCOME') {
        ledgerIncome += entry.isReversal ? -amt : amt;
      } else if (entry.entryType === 'EXPENSE') {
        ledgerExpenses += entry.isReversal ? -amt : amt;
      } else if (entry.entryType === 'REIMBURSEMENT') {
        ledgerReimbursements += entry.isReversal ? -amt : amt;
      }
    }

    const netAuthoritativeCashflow = totalVerifiedPayments - (totalPaidExpenses + totalPaidReimbursements);
    const netLedgerCashflow = ledgerIncome - (ledgerExpenses + ledgerReimbursements);

    const discrepancy = Number(Math.abs(netAuthoritativeCashflow - netLedgerCashflow).toFixed(2));

    return {
      academicTerm,
      authoritativeRecords: {
        totalVerifiedIncome: Number(totalVerifiedPayments.toFixed(2)),
        incomeBreakdown: paymentsByType,
        totalPaidExpenses: Number(totalPaidExpenses.toFixed(2)),
        paidExpensesCount: paidExpenses.length,
        totalPaidReimbursements: Number(totalPaidReimbursements.toFixed(2)),
        paidReimbursementsCount: paidReimbursements.length,
        netAuthoritativeCashflow: Number(netAuthoritativeCashflow.toFixed(2)),
      },
      ledgerRecords: {
        postedIncome: Number(ledgerIncome.toFixed(2)),
        postedExpenses: Number(ledgerExpenses.toFixed(2)),
        postedReimbursements: Number(ledgerReimbursements.toFixed(2)),
        netLedgerCashflow: Number(netLedgerCashflow.toFixed(2)),
      },
      reconciliation: {
        isBalanced: discrepancy === 0,
        discrepancyAmount: discrepancy,
        status: discrepancy === 0 ? 'BALANCED' : 'DISCREPANCY_DETECTED',
        note:
          discrepancy === 0
            ? 'All authoritative transactions match posted general ledger entries.'
            : `Variance of INR ${discrepancy} detected between authoritative records and posted general ledger.`,
      },
    };
  }
}

export default FinanceService;
