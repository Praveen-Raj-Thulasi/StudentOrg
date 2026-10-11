import {
  MembershipDues,
  Payment,
  Expense,
  Reimbursement,
  Budget,
  LedgerEntry,
  FundraisingCampaign,
  FundraisingContribution,
  Sponsorship,
  FundCollection,
  AuditLog,
  User,
} from '../models/index.js';
import { FinanceService } from './finance.service.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { validateReceipt } from '../utils/receiptValidator.js';

export class TreasurerService {
  /* =========================================================================
   * 1. FINANCIAL DASHBOARD METRICS (AUTHORITATIVE DB DERIVED)
   * ========================================================================= */

  static async getOverviewMetrics() {
    const now = new Date();

    const [
      allDues,
      successfulPayments,
      pendingPayments,
      allExpenses,
      allClaims,
      allBudgets,
      allLedgerEntries,
      activeCampaigns,
      allSponsorships,
      allCollections,
    ] = await Promise.all([
      MembershipDues.find({}).lean(),
      Payment.find({ paymentStatus: 'SUCCESSFUL' }).lean(),
      Payment.find({ paymentStatus: 'PENDING' }).lean(),
      Expense.find({}).lean(),
      Reimbursement.find({}).lean(),
      Budget.find({}).lean(),
      LedgerEntry.find({ status: 'POSTED' }).lean(),
      FundraisingCampaign.find({ status: 'ACTIVE' }).lean(),
      Sponsorship.find({}).lean(),
      FundCollection.find({}).lean(),
    ]);

    // Dues metrics
    let totalAssessed = 0;
    let totalDuesCollected = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let pendingDuesCount = 0;

    for (const d of allDues) {
      if (d.status !== 'CANCELLED' && d.status !== 'WAIVED') {
        totalAssessed += d.amount;
      }
      if (d.status === 'PAID') {
        totalDuesCollected += d.amount;
      }
      if (d.status === 'PENDING' || d.status === 'OVERDUE') {
        totalOutstanding += d.amount;
      }
      if (d.status === 'OVERDUE' || (d.status === 'PENDING' && d.dueDate && new Date(d.dueDate) < now)) {
        totalOverdue += d.amount;
      }
      if (d.status === 'PENDING') {
        pendingDuesCount++;
      }
    }

    // Payment income by type
    let totalBookingRevenue = 0;
    let totalMerchRevenue = 0;
    let totalDonations = 0;
    let paymentDuesRevenue = 0;

    for (const p of successfulPayments) {
      const amt = Number(p.amount || 0);
      if (p.paymentType === 'DUES') {
        paymentDuesRevenue += amt;
      } else if (p.paymentType === 'MERCHANDISE') {
        totalMerchRevenue += amt;
      } else if (p.paymentType === 'DONATION') {
        totalDonations += amt;
      } else {
        totalBookingRevenue += amt;
      }
    }

    // Verified collections from offline/sponsorship/direct sources
    let verifiedCollectionsTotal = 0;
    let verifiedCollectionsCount = 0;
    let pendingCollectionsCount = 0;
    let pendingCollectionsAmount = 0;

    for (const col of allCollections) {
      const amt = Number(col.amount || 0);
      if (col.status === 'VERIFIED') {
        verifiedCollectionsTotal += amt;
        verifiedCollectionsCount++;
      } else if (col.status === 'RECORDED') {
        pendingCollectionsCount++;
        pendingCollectionsAmount += amt;
      }
    }

    // Sponsorship reconciliation (promised vs verified received)
    let totalPromisedSponsorships = 0;
    let totalReceivedSponsorships = 0;
    let pendingSponsorshipCount = 0;

    for (const sp of allSponsorships) {
      totalPromisedSponsorships += Number(sp.promisedAmount || 0);
      totalReceivedSponsorships += Number(sp.receivedAmount || 0);
      if (sp.status === 'PROMISED' || sp.status === 'PARTIALLY_RECEIVED') {
        pendingSponsorshipCount++;
      }
    }

    // CRITICAL: Promised sponsorships must NEVER count as received income.
    // Total verified income includes successful payments + verified received collections
    const totalVerifiedIncome =
      totalBookingRevenue +
      (paymentDuesRevenue > 0 ? paymentDuesRevenue : totalDuesCollected) +
      totalMerchRevenue +
      totalDonations +
      verifiedCollectionsTotal;

    // Expenses calculation (avoiding double counting claim-generated expenses)
    let totalPaidExpenses = 0;
    let pendingApprovalExpensesCount = 0;
    let pendingApprovalExpensesAmount = 0;

    for (const exp of allExpenses) {
      if (exp.paymentStatus === 'PAID') {
        totalPaidExpenses += Number(exp.amount || 0);
      }
      if (exp.approvalStatus === 'PENDING') {
        pendingApprovalExpensesCount++;
        pendingApprovalExpensesAmount += Number(exp.amount || 0);
      }
    }

    // Pending expense claims & approved but unpaid reimbursements
    let pendingClaimsCount = 0;
    let pendingClaimsAmount = 0;
    let approvedUnpaidClaimsCount = 0;
    let approvedUnpaidClaimsAmount = 0;
    let totalPaidClaims = 0;

    for (const clm of allClaims) {
      const amt = Number(clm.amount || 0);
      if (clm.status === 'SUBMITTED' || clm.status === 'UNDER_REVIEW') {
        pendingClaimsCount++;
        pendingClaimsAmount += amt;
      } else if (clm.status === 'APPROVED' && clm.paymentStatus !== 'PAID') {
        approvedUnpaidClaimsCount++;
        approvedUnpaidClaimsAmount += amt;
      } else if (clm.status === 'PAID') {
        totalPaidClaims += amt;
      }
    }

    // Recorded balance = recorded income - recorded expenses
    // Note: If claim-generated expenses exist in Expense, totalPaidExpenses already includes paid claims
    // Check if any paid claim is not in Expense to ensure complete coverage:
    const claimExpenseRefs = new Set(allExpenses.map((e) => e.reference));
    let unlinkedPaidClaims = 0;
    for (const clm of allClaims) {
      if (clm.status === 'PAID' && !claimExpenseRefs.has(`EXP-${clm.claimNumber}`)) {
        unlinkedPaidClaims += Number(clm.amount || 0);
      }
    }
    const totalRecordedExpenses = totalPaidExpenses + unlinkedPaidClaims;
    const recordedBalance = Number((totalVerifiedIncome - totalRecordedExpenses).toFixed(2));

    // Budgets and alerts
    let totalBudgetAllocated = 0;
    let totalBudgetAdjustments = 0;
    const budgetAlerts = [];

    // Map paid expenses by category for budget utilization
    const expenseByCategory = {};
    for (const exp of allExpenses) {
      if (exp.paymentStatus === 'PAID') {
        expenseByCategory[exp.category] = (expenseByCategory[exp.category] || 0) + Number(exp.amount || 0);
      }
    }

    for (const b of allBudgets) {
      const allocated = Number(b.allocatedAmount || 0);
      const adj = Number(b.approvedAdjustments || 0);
      const effective = allocated + adj;
      totalBudgetAllocated += allocated;
      totalBudgetAdjustments += adj;

      const spent = Number((expenseByCategory[b.category] || 0).toFixed(2));
      const utilization = effective > 0 ? Number(((spent / effective) * 100).toFixed(1)) : 0;

      if (utilization >= 80) {
        budgetAlerts.push({
          category: b.category,
          academicTerm: b.academicTerm,
          effectiveBudget: effective,
          actualSpent: spent,
          utilizationRate: utilization,
          severity: utilization >= 100 ? 'CRITICAL' : 'WARNING',
          message:
            utilization >= 100
              ? `Budget exceeded for ${b.category}: ${utilization}% spent (₹${spent} / ₹${effective})`
              : `Budget alert for ${b.category}: ${utilization}% consumed (₹${spent} / ₹${effective})`,
        });
      }
    }

    const effectiveTotalBudget = totalBudgetAllocated + totalBudgetAdjustments;
    const remainingTotalBudget = Number((effectiveTotalBudget - totalRecordedExpenses).toFixed(2));

    // Active campaigns target progress
    const campaignProgress = [];
    for (const camp of activeCampaigns) {
      const campCollections = allCollections.filter(
        (c) => c.campaignId === camp.id && c.status === 'VERIFIED'
      );
      const collected = campCollections.reduce((sum, c) => sum + Number(c.amount || 0), 0);
      campaignProgress.push({
        id: camp.id,
        campaignCode: camp.campaignCode,
        title: camp.title,
        targetAmount: camp.targetAmount,
        collectedAmount: collected,
        progressPercent:
          camp.targetAmount > 0 ? Number(((collected / camp.targetAmount) * 100).toFixed(1)) : 0,
      });
    }

    // Recent transactions (combining payments and verified collections)
    const recentTxns = [
      ...successfulPayments.slice(0, 5).map((p) => ({
        id: p.id,
        reference: p.transactionId,
        type: 'PAYMENT',
        paymentType: p.paymentType,
        amount: p.amount,
        status: p.paymentStatus,
        date: p.paidAt || p.createdAt,
      })),
      ...allCollections
        .filter((c) => c.status === 'VERIFIED')
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          reference: c.collectionNumber,
          type: 'COLLECTION',
          source: c.source,
          amount: c.amount,
          status: c.status,
          date: c.verifiedAt || c.createdAt,
        })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return {
      recordedIncome: Number(totalVerifiedIncome.toFixed(2)),
      recordedExpenses: Number(totalRecordedExpenses.toFixed(2)),
      recordedBalance,
      pendingClaims: {
        count: pendingClaimsCount,
        amount: Number(pendingClaimsAmount.toFixed(2)),
      },
      approvedUnpaidReimbursements: {
        count: approvedUnpaidClaimsCount,
        amount: Number(approvedUnpaidClaimsAmount.toFixed(2)),
      },
      activeFundraisersCount: activeCampaigns.length,
      verifiedCollections: {
        count: verifiedCollectionsCount,
        amount: Number(verifiedCollectionsTotal.toFixed(2)),
      },
      sponsorships: {
        totalPromised: Number(totalPromisedSponsorships.toFixed(2)),
        totalVerifiedReceived: Number(totalReceivedSponsorships.toFixed(2)),
        outstandingPromised: Number(
          Math.max(0, totalPromisedSponsorships - totalReceivedSponsorships).toFixed(2)
        ),
        pendingCount: pendingSponsorshipCount,
        note: 'Promised sponsorships are segregated and never counted as income until verified received.',
      },
      budgetAlerts,
      campaignProgress,
      recentTransactions: recentTxns,
      duesSummary: {
        totalAssessed: Number(totalAssessed.toFixed(2)),
        totalCollected: Number(totalDuesCollected.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        totalOverdue: Number(totalOverdue.toFixed(2)),
        pendingCount: pendingDuesCount,
      },
      effectiveTotalBudget: Number(effectiveTotalBudget.toFixed(2)),
      remainingTotalBudget,
    };
  }

  /* =========================================================================
   * 2. SPONSORSHIPS & COMMITMENTS
   * ========================================================================= */

  static async createSponsorship(data, userId) {
    if (!data.campaignId || !data.sponsorName || data.promisedAmount === undefined) {
      throw new BadRequestError('campaignId, sponsorName, and promisedAmount are required');
    }
    const promised = Number(data.promisedAmount);
    if (isNaN(promised) || promised <= 0) {
      throw new BadRequestError('Promised amount must be a positive number');
    }

    const campaign = await FundraisingCampaign.findOne({ id: Number(data.campaignId) });
    if (!campaign) throw new NotFoundError(`Campaign #${data.campaignId} not found`);

    const sponsorship = new Sponsorship({
      campaignId: campaign.id,
      sponsorName: data.sponsorName.trim(),
      sponsorContact: (data.sponsorContact || '').trim() || null,
      sponsorEmail: (data.sponsorEmail || '').trim() || null,
      tier: data.tier || 'BRONZE',
      promisedAmount: promised,
      receivedAmount: 0,
      currency: data.currency || 'INR',
      academicTerm: data.academicTerm || '2026-2027',
      status: 'PROMISED',
      notes: (data.notes || '').trim() || null,
      createdBy: userId,
    });

    const saved = await sponsorship.save();

    await AuditLog.create({
      userId,
      role: 'TREASURER',
      action: 'SPONSORSHIP_COMMITTED',
      resourceType: 'FUNDRAISING',
      resourceId: String(saved.id),
      details: `Committed sponsorship ${saved.sponsorshipCode} from ${saved.sponsorName} for ₹${saved.promisedAmount} (Promised)`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async getSponsorships(filter = {}) {
    const query = {};
    if (filter.campaignId) query.campaignId = Number(filter.campaignId);
    if (filter.status) query.status = filter.status;
    if (filter.tier) query.tier = filter.tier;
    if (filter.academicTerm && filter.academicTerm !== 'ALL') {
      query.academicTerm = filter.academicTerm;
    }
    return Sponsorship.find(query).sort({ createdAt: -1 });
  }

  static async getSponsorshipById(id) {
    const sp = await Sponsorship.findOne({ id: Number(id) });
    if (!sp) throw new NotFoundError(`Sponsorship #${id} not found`);
    return sp;
  }

  /* =========================================================================
   * 3. FUND COLLECTIONS & LEDGER LINKING
   * ========================================================================= */

  static async recordCollection(data, collectorId, collectorName) {
    if (!data.campaignId || data.amount === undefined) {
      throw new BadRequestError('campaignId and amount are required');
    }
    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestError('Collection amount must be a positive number');
    }

    const campaign = await FundraisingCampaign.findOne({ id: Number(data.campaignId) });
    if (!campaign) throw new NotFoundError(`Campaign #${data.campaignId} not found`);

    if (data.sponsorshipId) {
      const sp = await Sponsorship.findOne({ id: Number(data.sponsorshipId) });
      if (!sp) throw new NotFoundError(`Linked sponsorship #${data.sponsorshipId} not found`);
    }

    const collection = new FundCollection({
      campaignId: campaign.id,
      sponsorshipId: data.sponsorshipId ? Number(data.sponsorshipId) : null,
      collectorId,
      collectorName: collectorName || `User #${collectorId}`,
      source: data.source || 'DIRECT_DONATION',
      amount,
      currency: data.currency || 'INR',
      academicTerm: data.academicTerm || '2026-2027',
      evidenceUrl: (data.evidenceUrl || '').trim() || null,
      receiptReference: (data.receiptReference || '').trim() || null,
      status: 'RECORDED',
    });

    const saved = await collection.save();

    await AuditLog.create({
      userId: collectorId,
      role: 'TREASURER',
      action: 'COLLECTION_RECORDED',
      resourceType: 'FUNDRAISING',
      resourceId: String(saved.id),
      details: `Recorded fund collection ${saved.collectionNumber} of ₹${saved.amount} for campaign #${saved.campaignId}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async getCollections(filter = {}) {
    const query = {};
    if (filter.campaignId) query.campaignId = Number(filter.campaignId);
    if (filter.status) query.status = filter.status;
    if (filter.source) query.source = filter.source;
    if (filter.sponsorshipId) query.sponsorshipId = Number(filter.sponsorshipId);
    if (filter.academicTerm && filter.academicTerm !== 'ALL') {
      query.academicTerm = filter.academicTerm;
    }
    return FundCollection.find(query).sort({ createdAt: -1 });
  }

  static async verifyCollection(collectionId, verifiedBy, { verificationNotes } = {}) {
    const collection = await FundCollection.findOne({ id: Number(collectionId) });
    if (!collection) throw new NotFoundError(`Collection #${collectionId} not found`);

    if (collection.status === 'VERIFIED') {
      throw new ConflictError(`Collection ${collection.collectionNumber} is already verified.`);
    }
    if (collection.status !== 'RECORDED') {
      throw new BadRequestError(`Cannot verify collection in status: ${collection.status}`);
    }

    collection.status = 'VERIFIED';
    collection.verifiedBy = verifiedBy;
    collection.verifiedAt = new Date();
    collection.verificationNotes = (verificationNotes || 'Verified by Treasurer').trim();

    // If linked to sponsorship, update sponsorship receivedAmount
    if (collection.sponsorshipId) {
      const sp = await Sponsorship.findOne({ id: collection.sponsorshipId });
      if (sp) {
        sp.receivedAmount = Number((sp.receivedAmount + collection.amount).toFixed(2));
        if (sp.receivedAmount >= sp.promisedAmount) {
          sp.status = 'VERIFIED_RECEIVED';
        } else {
          sp.status = 'PARTIALLY_RECEIVED';
        }
        sp.verifiedBy = verifiedBy;
        sp.verifiedAt = new Date();
        await sp.save();
      }
    }

    // Exactly-once General Ledger Posting with unique idempotencyKey
    const idempotencyKey = `COLLECTION_VERIFIED_${collection.collectionNumber}`;
    const ledgerEntry = await FinanceService.recordLedgerEntry({
      entryType: 'INCOME',
      amount: collection.amount,
      currency: collection.currency,
      academicTerm: collection.academicTerm,
      category: collection.source === 'SPONSORSHIP' ? 'SPONSORSHIP' : 'DONATION',
      description: `Verified ${collection.source} collection ${collection.collectionNumber} for campaign #${collection.campaignId}`,
      sourceReference: collection.collectionNumber,
      sourceModel: 'FundCollection',
      idempotencyKey,
      postedBy: verifiedBy,
    });

    collection.ledgerEntryId = ledgerEntry.id;
    const saved = await collection.save();

    await AuditLog.create({
      userId: verifiedBy,
      role: 'TREASURER',
      action: 'COLLECTION_VERIFIED',
      resourceType: 'FUNDRAISING',
      resourceId: String(saved.id),
      details: `Verified collection ${saved.collectionNumber} (₹${saved.amount}) and posted to ledger ${ledgerEntry.entryNumber}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async rejectCollection(collectionId, reviewerId, { reason }) {
    const collection = await FundCollection.findOne({ id: Number(collectionId) });
    if (!collection) throw new NotFoundError(`Collection #${collectionId} not found`);

    if (collection.status === 'VERIFIED') {
      throw new ConflictError('Cannot reject an already verified collection without refund procedure.');
    }

    collection.status = 'REJECTED';
    collection.verificationNotes = (reason || 'Rejected by finance authority').trim();
    collection.verifiedBy = reviewerId;
    collection.verifiedAt = new Date();

    const saved = await collection.save();

    await AuditLog.create({
      userId: reviewerId,
      role: 'TREASURER',
      action: 'COLLECTION_REJECTED',
      resourceType: 'FUNDRAISING',
      resourceId: String(saved.id),
      details: `Rejected collection ${saved.collectionNumber}: ${saved.verificationNotes}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  /* =========================================================================
   * 4. EXPENSE CLAIM REVIEW WITH RECEIPT OCR VALIDATION
   * ========================================================================= */

  static async inspectClaimReceipt(claimId) {
    const claim = await Reimbursement.findOne({ id: Number(claimId) });
    if (!claim) throw new NotFoundError(`Reimbursement claim #${claimId} not found`);
    const claimant = await User.findOne({ id: claim.claimantId }).select('name email memberNumber').lean();

    const validation = await validateReceipt({
      claimedAmount: claim.amount,
      receiptUrl: claim.receiptUrl,
      claimId: claim.id,
      academicTerm: claim.academicTerm,
    });

    return {
      claim: { ...claim.toObject(), claimant },
      receiptValidation: validation,
    };
  }

  /* =========================================================================
   * 5. FINANCIAL REPORTS & CSV EXPORT
   * ========================================================================= */

  static async generateCsvReport({ academicTerm = '2026-2027', category = null } = {}) {
    const termFilter = academicTerm && academicTerm !== 'ALL' ? { academicTerm } : {};
    const categoryFilter = category && category !== 'ALL' ? { category } : {};

    const [payments, expenses, reimbursements, collections, budgets] = await Promise.all([
      Payment.find({ paymentStatus: 'SUCCESSFUL' }).lean(),
      Expense.find({ ...termFilter, ...categoryFilter }).lean(),
      Reimbursement.find({ ...termFilter }).lean(),
      FundCollection.find({ ...termFilter }).lean(),
      Budget.find({ ...termFilter, ...categoryFilter }).lean(),
    ]);

    const rows = [];
    rows.push(['Section', 'Record ID', 'Date', 'Category/Type', 'Payee/Source', 'Amount', 'Currency', 'Status', 'Reference']);

    // Payments
    for (const p of payments) {
      rows.push([
        'INCOME_PAYMENT',
        p.id,
        (p.paidAt || p.createdAt || '').toString().slice(0, 10),
        p.paymentType,
        `User #${p.userId || 'Guest'}`,
        p.amount,
        'INR',
        p.paymentStatus,
        p.transactionId,
      ]);
    }

    // Collections
    for (const c of collections) {
      rows.push([
        'INCOME_COLLECTION',
        c.collectionNumber,
        (c.verifiedAt || c.createdAt || '').toString().slice(0, 10),
        c.source,
        c.collectorName,
        c.amount,
        c.currency,
        c.status,
        c.receiptReference || '',
      ]);
    }

    // Expenses
    for (const e of expenses) {
      rows.push([
        'EXPENSE',
        e.reference,
        (e.approvedAt || e.createdAt || '').toString().slice(0, 10),
        e.category,
        e.payee,
        e.amount,
        e.currency,
        `${e.approvalStatus}/${e.paymentStatus}`,
        e.paymentReference || '',
      ]);
    }

    // Reimbursements
    for (const r of reimbursements) {
      rows.push([
        'REIMBURSEMENT',
        r.claimNumber,
        (r.reviewedAt || r.createdAt || '').toString().slice(0, 10),
        r.category,
        `Claimant #${r.claimantId}`,
        r.amount,
        r.currency,
        `${r.status}/${r.paymentStatus}`,
        r.paymentReference || '',
      ]);
    }

    // Budgets
    for (const b of budgets) {
      rows.push([
        'BUDGET',
        b.budgetCode,
        (b.createdAt || '').toString().slice(0, 10),
        b.category,
        'Club Budget Allocation',
        b.allocatedAmount + (b.approvedAdjustments || 0),
        b.currency,
        'ALLOCATED',
        `Adjustments: ${b.approvedAdjustments || 0}`,
      ]);
    }

    // Format as CSV text
    const csvContent = rows
      .map((r) =>
        r
          .map((field) => {
            const str = String(field === null || field === undefined ? '' : field);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\r\n');

    return csvContent;
  }
}

export default TreasurerService;
