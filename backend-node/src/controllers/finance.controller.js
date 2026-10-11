import { FinanceService } from '../services/finance.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class FinanceController {
  /* ==================== EXPENSES ==================== */

  static async createExpense(req, res, next) {
    try {
      const expense = await FinanceService.createExpense(req.body, req.user.id);
      return ApiResponse.created(res, expense, 'Expense bill created successfully');
    } catch (err) {
      next(err);
    }
  }

  static async getExpenses(req, res, next) {
    try {
      const expenses = await FinanceService.getExpenses(req.query);
      return ApiResponse.success(res, expenses);
    } catch (err) {
      next(err);
    }
  }

  static async getExpenseById(req, res, next) {
    try {
      const expense = await FinanceService.getExpenseById(req.params.id);
      return ApiResponse.success(res, expense);
    } catch (err) {
      next(err);
    }
  }

  static async approveExpense(req, res, next) {
    try {
      const expense = await FinanceService.approveExpense(req.params.id, req.user.id);
      return ApiResponse.success(res, expense, 'Expense approved successfully');
    } catch (err) {
      next(err);
    }
  }

  static async rejectExpense(req, res, next) {
    try {
      const expense = await FinanceService.rejectExpense(
        req.params.id,
        req.user.id,
        req.body?.reason
      );
      return ApiResponse.success(res, expense, 'Expense rejected');
    } catch (err) {
      next(err);
    }
  }

  static async payExpense(req, res, next) {
    try {
      const expense = await FinanceService.payExpense(
        req.params.id,
        req.user.id,
        req.body || {}
      );
      return ApiResponse.success(res, expense, 'Expense marked as paid and posted to ledger');
    } catch (err) {
      next(err);
    }
  }

  /* ==================== REIMBURSEMENTS ==================== */

  static async submitReimbursement(req, res, next) {
    try {
      const claim = await FinanceService.submitReimbursementClaim(req.body, req.user.id);
      return ApiResponse.created(res, claim, 'Reimbursement claim submitted');
    } catch (err) {
      next(err);
    }
  }

  static async getMyReimbursements(req, res, next) {
    try {
      const claims = await FinanceService.getMyClaims(req.user.id);
      return ApiResponse.success(res, claims);
    } catch (err) {
      next(err);
    }
  }

  static async getAllReimbursements(req, res, next) {
    try {
      const claims = await FinanceService.getAllClaims(req.query);
      return ApiResponse.success(res, claims);
    } catch (err) {
      next(err);
    }
  }

  static async reviewReimbursement(req, res, next) {
    try {
      const claim = await FinanceService.reviewClaim(
        req.params.id,
        req.user.id,
        req.body || {}
      );
      return ApiResponse.success(res, claim, `Claim marked as ${claim.status}`);
    } catch (err) {
      next(err);
    }
  }

  static async disburseReimbursement(req, res, next) {
    try {
      const claim = await FinanceService.disburseClaim(
        req.params.id,
        req.user.id,
        req.body || {}
      );
      return ApiResponse.success(res, claim, 'Claim disbursed and posted to ledger');
    } catch (err) {
      next(err);
    }
  }

  /* ==================== BUDGETS ==================== */

  static async createBudget(req, res, next) {
    try {
      const budget = await FinanceService.createBudget(req.body, req.user.id);
      return ApiResponse.created(res, budget, 'Budget allocation created');
    } catch (err) {
      next(err);
    }
  }

  static async adjustBudget(req, res, next) {
    try {
      const budget = await FinanceService.adjustBudget(
        req.params.id,
        req.body,
        req.user.id
      );
      return ApiResponse.success(res, budget, 'Budget adjusted successfully');
    } catch (err) {
      next(err);
    }
  }

  static async getBudgets(req, res, next) {
    try {
      const term = req.query.academicTerm || '2026-2027';
      const budgets = await FinanceService.getBudgetsWithActuals(term);
      return ApiResponse.success(res, budgets);
    } catch (err) {
      next(err);
    }
  }

  /* ==================== LEDGER & RECONCILIATION ==================== */

  static async getLedgerEntries(req, res, next) {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 50;
      const result = await FinanceService.getLedgerEntries(req.query, page, limit);
      return ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  static async reverseLedgerEntry(req, res, next) {
    try {
      const reversal = await FinanceService.reverseLedgerEntry(
        req.params.id,
        req.body || {},
        req.user.id
      );
      return ApiResponse.success(res, reversal, 'Ledger entry reversed with offsetting entry');
    } catch (err) {
      next(err);
    }
  }

  static async getReconciliation(req, res, next) {
    try {
      const term = req.query.academicTerm || '2026-2027';
      const report = await FinanceService.getReconciliationReport(term);
      return ApiResponse.success(res, report);
    } catch (err) {
      next(err);
    }
  }
}

export default FinanceController;
