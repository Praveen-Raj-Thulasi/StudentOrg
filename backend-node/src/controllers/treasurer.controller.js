import {
  MembershipDues,
  Payment,
  Expense,
  Reimbursement,
  Budget,
  LedgerEntry,
} from '../models/index.js';
import { TreasurerService } from '../services/treasurer.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class TreasurerController {
  /**
   * Executive Financial Overview for Treasurer & President.
   * Pulls real data strictly from persisted collections.
   */
  static async getOverview(_req, res, next) {
    try {
      const metrics = await TreasurerService.getOverviewMetrics();

      const [
        allDues,
        successfulPayments,
        pendingPayments,
        allExpenses,
        allClaims,
        allBudgets,
        allLedgerEntries,
      ] = await Promise.all([
        MembershipDues.find({}),
        Payment.find({ paymentStatus: 'SUCCESSFUL' })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        Payment.find({ paymentStatus: 'PENDING' }).lean(),
        Expense.find({}).lean(),
        Reimbursement.find({}).lean(),
        Budget.find({}).lean(),
        LedgerEntry.find({ status: 'POSTED' }).lean(),
      ]);

      const now = new Date();
      let totalAssessed = 0;
      let totalCollected = 0;
      let totalOutstanding = 0;
      let totalOverdue = 0;
      let pendingDuesCount = 0;

      for (const d of allDues) {
        if (d.status !== 'CANCELLED' && d.status !== 'WAIVED') {
          totalAssessed += d.amount;
        }
        if (d.status === 'PAID') {
          totalCollected += d.amount;
        }
        if (d.status === 'PENDING' || d.status === 'OVERDUE') {
          totalOutstanding += d.amount;
        }
        if (d.status === 'OVERDUE' || (d.status === 'PENDING' && d.dueDate && d.dueDate < now)) {
          totalOverdue += d.amount;
        }
        if (d.status === 'PENDING') {
          pendingDuesCount++;
        }
      }

      // Ledger calculations
      let ledgerIncome = 0;
      let ledgerExpenses = 0;
      for (const l of allLedgerEntries) {
        const amt = Number(l.amount || 0);
        if (l.entryType === 'INCOME') {
          ledgerIncome += l.isReversal ? -amt : amt;
        } else if (l.entryType === 'EXPENSE' || l.entryType === 'REIMBURSEMENT') {
          ledgerExpenses += l.isReversal ? -amt : amt;
        }
      }

      const summary = {
        totalAssessed: Number(totalAssessed.toFixed(2)),
        totalCollected: Number(totalCollected.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        totalOverdue: Number(totalOverdue.toFixed(2)),
        pendingDuesCount,
        totalVerifiedIncome: metrics.recordedIncome,
        recordedIncome: metrics.recordedIncome,
        recordedExpenses: metrics.recordedExpenses,
        recordedBalance: metrics.recordedBalance,
        totalPaidExpenses: metrics.recordedExpenses,
        pendingApprovalExpensesCount: metrics.pendingClaims.count,
        pendingApprovalExpensesAmount: metrics.pendingClaims.amount,
        totalPaidReimbursements: metrics.recordedExpenses,
        pendingClaimsCount: metrics.pendingClaims.count,
        pendingClaimsAmount: metrics.pendingClaims.amount,
        approvedUnpaidReimbursementsCount: metrics.approvedUnpaidReimbursements.count,
        approvedUnpaidReimbursementsAmount: metrics.approvedUnpaidReimbursements.amount,
        effectiveTotalBudget: metrics.effectiveTotalBudget,
        remainingTotalBudget: metrics.remainingTotalBudget,
        ledgerIncome: Number(ledgerIncome.toFixed(2)),
        ledgerExpenses: Number(ledgerExpenses.toFixed(2)),
        postedLedgerCount: allLedgerEntries.length,
      };

      return ApiResponse.success(res, {
        ...metrics,
        summary,
        recentTransactions: successfulPayments.map((p) => ({
          id: p.id,
          transactionId: p.transactionId,
          amount: p.amount,
          paymentType: p.paymentType,
          paymentMethod: p.paymentMethod,
          paidAt: p.paidAt || p.createdAt,
          gatewayReference: p.gatewayReference,
        })),
        phase5Status: {
          ledger: {
            modeled: false,
            status: 'ACTIVE_PHASE_5',
            message: 'Append-only double-entry general ledger with idempotency and reversible transactions is fully active.',
          },
          billsAndExpenses: {
            modeled: false,
            status: 'ACTIVE_PHASE_5',
            message: 'Vendor bills, expense disbursements, and separation-of-duties approvals are active.',
          },
          reimbursements: {
            modeled: false,
            status: 'ACTIVE_PHASE_5',
            message: 'Member and volunteer reimbursement workflows with receipt verification and disbursement are active.',
          },
          budgets: {
            modeled: false,
            status: 'ACTIVE_PHASE_5',
            message: 'Club budget allocation, adjustment tracking, and dynamic expenditure controls are active.',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Detailed Financial Reports based on actual backend records.
   */
  static async getReports(req, res, next) {
    try {
      const { academicTerm } = req.query;
      const duesFilter = {};
      if (academicTerm && academicTerm !== 'ALL') {
        duesFilter.academicTerm = academicTerm;
      }

      const dues = await MembershipDues.find(duesFilter).lean();

      // Aggregate by status
      const statusCounts = {};
      const statusAmounts = {};
      for (const d of dues) {
        statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
        statusAmounts[d.status] = Number(((statusAmounts[d.status] || 0) + d.amount).toFixed(2));
      }

      // Aggregate by term
      const termBreakdown = {};
      for (const d of dues) {
        const term = d.academicTerm || 'Unknown';
        if (!termBreakdown[term]) {
          termBreakdown[term] = { assessed: 0, collected: 0, count: 0 };
        }
        termBreakdown[term].count += 1;
        if (d.status !== 'CANCELLED' && d.status !== 'WAIVED') {
          termBreakdown[term].assessed += d.amount;
        }
        if (d.status === 'PAID') {
          termBreakdown[term].collected += d.amount;
        }
      }

      const termReports = Object.entries(termBreakdown).map(([term, data]) => ({
        academicTerm: term,
        totalAssessed: Number(data.assessed.toFixed(2)),
        totalCollected: Number(data.collected.toFixed(2)),
        collectionRate: data.assessed > 0 ? Number(((data.collected / data.assessed) * 100).toFixed(1)) : 0,
        recordCount: data.count,
      }));

      const payments = await Payment.find({}).select('paymentStatus amount').lean();
      const paymentBreakdown = {};
      for (const p of payments) {
        const st = p.paymentStatus || 'UNKNOWN';
        if (!paymentBreakdown[st]) {
          paymentBreakdown[st] = { count: 0, amount: 0 };
        }
        paymentBreakdown[st].count += 1;
        paymentBreakdown[st].amount = Number((paymentBreakdown[st].amount + Number(p.amount || 0)).toFixed(2));
      }

      return ApiResponse.success(res, {
        termReports,
        duesStatusBreakdown: {
          counts: statusCounts,
          amounts: statusAmounts,
        },
        paymentBreakdown,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Financial Reports CSV Streaming Export
   */
  static async exportReportsCsv(req, res, next) {
    try {
      const csv = await TreasurerService.generateCsvReport(req.query);
      const filename = `financial-report-${req.query.academicTerm || '2026-2027'}-${Date.now()}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Sponsorship Management
   */
  static async createSponsorship(req, res, next) {
    try {
      const sp = await TreasurerService.createSponsorship(req.body, req.user.id);
      return ApiResponse.created(res, sp, 'Sponsorship commitment recorded');
    } catch (err) {
      next(err);
    }
  }

  static async getSponsorships(req, res, next) {
    try {
      const sponsorships = await TreasurerService.getSponsorships(req.query);
      return ApiResponse.success(res, sponsorships);
    } catch (err) {
      next(err);
    }
  }

  static async getSponsorshipById(req, res, next) {
    try {
      const sp = await TreasurerService.getSponsorshipById(req.params.id);
      return ApiResponse.success(res, sp);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Fund Collections & Ledger Verification
   */
  static async recordFundCollection(req, res, next) {
    try {
      const col = await TreasurerService.recordCollection(
        req.body,
        req.user.id,
        req.user.name || req.user.email || `User #${req.user.id}`
      );
      return ApiResponse.created(res, col, 'Fund collection recorded pending verification');
    } catch (err) {
      next(err);
    }
  }

  static async getFundCollections(req, res, next) {
    try {
      const collections = await TreasurerService.getCollections(req.query);
      return ApiResponse.success(res, collections);
    } catch (err) {
      next(err);
    }
  }

  static async verifyFundCollection(req, res, next) {
    try {
      const col = await TreasurerService.verifyCollection(
        req.params.id,
        req.user.id,
        req.body || {}
      );
      return ApiResponse.success(res, col, 'Collection verified and posted to general ledger');
    } catch (err) {
      next(err);
    }
  }

  static async rejectFundCollection(req, res, next) {
    try {
      const col = await TreasurerService.rejectCollection(
        req.params.id,
        req.user.id,
        req.body || {}
      );
      return ApiResponse.success(res, col, 'Collection rejected');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Receipt Inspection & OCR Mismatch Flagging
   */
  static async inspectClaimReceipt(req, res, next) {
    try {
      const result = await TreasurerService.inspectClaimReceipt(req.params.id);
      return ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export default TreasurerController;
