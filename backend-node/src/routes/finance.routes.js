import { Router } from 'express';
import { FinanceController } from '../controllers/finance.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Expenses & Bills
router.post(
  '/finance/expenses',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.createExpense)
);

router.get(
  '/finance/expenses',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN', 'ORGANIZER'),
  asyncHandler(FinanceController.getExpenses)
);

router.get(
  '/finance/expenses/:id',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN', 'ORGANIZER'),
  asyncHandler(FinanceController.getExpenseById)
);

router.post(
  '/finance/expenses/:id/approve',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.approveExpense)
);

router.post(
  '/finance/expenses/:id/reject',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.rejectExpense)
);

router.post(
  '/finance/expenses/:id/pay',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.payExpense)
);

// Reimbursements
router.post(
  '/finance/reimbursements',
  authenticateToken,
  asyncHandler(FinanceController.submitReimbursement)
);

router.get(
  '/finance/reimbursements/my',
  authenticateToken,
  asyncHandler(FinanceController.getMyReimbursements)
);

router.get(
  '/finance/reimbursements',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.getAllReimbursements)
);

router.post(
  '/finance/reimbursements/:id/review',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.reviewReimbursement)
);

router.post(
  '/finance/reimbursements/:id/disburse',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.disburseReimbursement)
);

// Budgets
router.get(
  '/finance/budgets',
  authenticateToken,
  asyncHandler(FinanceController.getBudgets)
);

router.post(
  '/finance/budgets',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.createBudget)
);

router.post(
  '/finance/budgets/:id/adjust',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.adjustBudget)
);

// General Ledger & Reconciliation
router.get(
  '/finance/ledger',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.getLedgerEntries)
);

router.post(
  '/finance/ledger/:id/reverse',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.reverseLedgerEntry)
);

router.get(
  '/finance/reconciliation',
  authenticateToken,
  requireRole('TREASURER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(FinanceController.getReconciliation)
);

export default router;
