import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { treasurerAPI, duesAPI } from '../../services/api';
import ExpensesSection from './ExpensesSection';
import ReimbursementsSection from './ReimbursementsSection';
import BudgetsSection from './BudgetsSection';
import LedgerSection from './LedgerSection';
import FundraisingSection from './FundraisingSection';
import MerchandiseSection from './MerchandiseSection';
import {
  FiDollarSign,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
  FiFilter,
  FiSearch,
  FiRefreshCw,
  FiFileText,
  FiCreditCard,
  FiPlusCircle,
  FiChevronLeft,
  FiChevronRight,
  FiInfo,
  FiShield,
  FiCalendar,
  FiDownload,
} from 'react-icons/fi';
import { MdAccountBalance, MdPayments, MdReceiptLong } from 'react-icons/md';

export default function TreasurerDashboard() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'dues' | 'reports' | 'expenses' | 'reimbursements' | 'budgets' | 'ledger' | 'phase5'
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Dues state
  const [duesList, setDuesList] = useState([]);
  const [duesLoading, setDuesLoading] = useState(false);
  const [duesPage, setDuesPage] = useState(0);
  const [duesTotalPages, setDuesTotalPages] = useState(1);
  const [duesTotalElements, setDuesTotalElements] = useState(0);
  const [duesSummary, setDuesSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [termFilter, setTermFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTerms, setAvailableTerms] = useState([]);

  // Reports state
  const [reports, setReports] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportTerm, setReportTerm] = useState('ALL');

  // Modal state
  const [showAssessModal, setShowAssessModal] = useState(false);
  const [assessForm, setAssessForm] = useState({
    userId: '',
    amount: '',
    title: 'Annual Student Association Membership Dues',
    academicTerm: '2026-2027',
    dueDate: '',
  });
  const [assessSubmitting, setAssessSubmitting] = useState(false);

  const [waiveModalDue, setWaiveModalDue] = useState(null);
  const [waiverReason, setWaiverReason] = useState('');
  const [waiveSubmitting, setWaiveSubmitting] = useState(false);

  // Fetch Overview
  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await treasurerAPI.getOverview();
      setOverview(res.data?.data || {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load treasury overview');
    } finally {
      setLoadingOverview(false);
    }
  };

  // Fetch Dues
  const fetchDues = async () => {
    setDuesLoading(true);
    try {
      const res = await duesAPI.getAll({
        page: duesPage,
        size: 15,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        academicTerm: termFilter !== 'ALL' ? termFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      const data = res.data?.data || {};
      setDuesList(data.content || []);
      setDuesTotalPages(data.totalPages || 1);
      setDuesTotalElements(data.totalElements || 0);
      setDuesSummary(data.summary || null);
      if (data.availableTerms && data.availableTerms.length > 0) {
        setAvailableTerms(data.availableTerms);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch dues obligations');
    } finally {
      setDuesLoading(false);
    }
  };

  // Fetch Reports
  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const res = await treasurerAPI.getReports({
        academicTerm: reportTerm !== 'ALL' ? reportTerm : undefined,
      });
      setReports(res.data?.data || {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load financial reports');
    } finally {
      setReportsLoading(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await treasurerAPI.exportReportsCsv({
        academicTerm: reportTerm !== 'ALL' ? reportTerm : undefined,
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-report-${reportTerm !== 'ALL' ? reportTerm : 'all'}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Financial report CSV downloaded successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export financial report CSV');
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    if (activeTab === 'dues') fetchDues();
  }, [activeTab, duesPage, statusFilter, termFilter]);

  useEffect(() => {
    if (activeTab === 'reports') fetchReports();
  }, [activeTab, reportTerm]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setDuesPage(0);
    fetchDues();
  };

  const handleAssessSubmit = async (e) => {
    e.preventDefault();
    if (!assessForm.userId || !assessForm.amount) {
      toast.error('Please enter target User ID and dues amount');
      return;
    }
    setAssessSubmitting(true);
    try {
      await duesAPI.assess({
        userId: Number(assessForm.userId),
        amount: Number(assessForm.amount),
        title: assessForm.title,
        academicTerm: assessForm.academicTerm,
        dueDate: assessForm.dueDate || undefined,
      });
      toast.success('Dues obligation assessed successfully');
      setShowAssessModal(false);
      setAssessForm({
        userId: '',
        amount: '',
        title: 'Annual Student Association Membership Dues',
        academicTerm: '2026-2027',
        dueDate: '',
      });
      fetchDues();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assess dues');
    } finally {
      setAssessSubmitting(false);
    }
  };

  const handleWaiveSubmit = async (e) => {
    e.preventDefault();
    if (!waiveModalDue) return;
    setWaiveSubmitting(true);
    try {
      await duesAPI.waive(waiveModalDue.id, { reason: waiverReason });
      toast.success(`Dues obligation #${waiveModalDue.id} waived successfully`);
      setWaiveModalDue(null);
      setWaiverReason('');
      fetchDues();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to waive dues obligation');
    } finally {
      setWaiveSubmitting(false);
    }
  };

  const sum = overview?.summary || {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              <MdAccountBalance className="h-3.5 w-3.5" /> TREASURER PORTAL
            </span>
            <span className="text-xs text-slate-400">Skyline Student Association Treasury</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            Financial Management & Dues Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time dues assessment, verified payment collection, and financial accountability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (activeTab === 'overview') fetchOverview();
              else if (activeTab === 'dues') fetchDues();
              else if (activeTab === 'reports') fetchReports();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <FiRefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAssessModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <FiPlusCircle className="h-4 w-4" />
            Assess Dues
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'overview'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MdPayments className="h-4 w-4" /> Executive Summary
        </button>
        <button
          onClick={() => setActiveTab('dues')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'dues'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MdReceiptLong className="h-4 w-4" /> Dues Obligations
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'expenses'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiFileText className="h-4 w-4" /> Bills & Expenses
        </button>
        <button
          onClick={() => setActiveTab('reimbursements')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'reimbursements'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiCreditCard className="h-4 w-4" /> Reimbursements
        </button>
        <button
          onClick={() => setActiveTab('budgets')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'budgets'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiDollarSign className="h-4 w-4" /> Club Budgets
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'ledger'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiShield className="h-4 w-4" /> General Ledger
        </button>
        <button
          onClick={() => setActiveTab('fundraising')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'fundraising'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiDollarSign className="h-4 w-4" /> Fundraisers & Sponsors
        </button>
        <button
          onClick={() => setActiveTab('merchandise')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === 'merchandise' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <FiPlusCircle className="h-4 w-4" /> Merchandise
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'reports'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiFileText className="h-4 w-4" /> Reports
        </button>
      </div>

      {/* TAB 1: EXECUTIVE SUMMARY */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-6">
          {/* Primary Financial Overview KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Recorded Balance
                </span>
                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                  <FiDollarSign className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-emerald-700">
                ₹{(overview?.recordedBalance ?? sum.recordedBalance ?? 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Recorded Income (₹{(overview?.recordedIncome ?? sum.recordedIncome ?? 0).toLocaleString()}) − Expenses (₹{(overview?.recordedExpenses ?? sum.recordedExpenses ?? 0).toLocaleString()})
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Verified Income
                </span>
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                  <FiCheckCircle className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-slate-900">
                ₹{(overview?.recordedIncome ?? sum.totalVerifiedIncome ?? 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Verified settlements & collections (Promised sponsorships excluded)
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Recorded Expenses
                </span>
                <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                  <FiFileText className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-rose-700">
                ₹{(overview?.recordedExpenses ?? sum.totalPaidExpenses ?? 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Authoritative paid bills and reimbursed claims
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pending Expense Claims
                </span>
                <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                  <FiClock className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-amber-600">
                {overview?.pendingClaims?.count ?? sum.pendingClaimsCount ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ₹{(overview?.pendingClaims?.amount ?? sum.pendingClaimsAmount ?? 0).toLocaleString()} awaiting Treasurer review
              </p>
            </div>
          </div>

          {/* Secondary Financial Indicators */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-slate-500">Approved Unpaid Reimbursements</span>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {overview?.approvedUnpaidReimbursements?.count ?? 0} <span className="text-sm font-semibold text-slate-500">claims</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                ₹{(overview?.approvedUnpaidReimbursements?.amount ?? 0).toLocaleString()} approved awaiting disbursement payout
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-slate-500">Active Fundraisers & Verified Collections</span>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {overview?.activeFundraisersCount ?? 0} <span className="text-sm font-semibold text-slate-500">campaigns</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                ₹{(overview?.verifiedCollections?.amount ?? 0).toLocaleString()} verified from {overview?.verifiedCollections?.count ?? 0} collections
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-slate-500">Club Budget Headroom</span>
              <p className="mt-2 text-2xl font-black text-slate-900">
                ₹{(overview?.remainingTotalBudget ?? sum.remainingTotalBudget ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Of ₹{(overview?.effectiveTotalBudget ?? sum.effectiveTotalBudget ?? 0).toLocaleString()} total allocated budget
              </p>
            </div>
          </div>

          {/* Sponsorships Reconciliation Banner */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
                <FiInfo className="h-5 w-5 text-blue-600" />
                <span>Sponsorship Reconciliation & Accounting Integrity</span>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                Segregated Accounting
              </span>
            </div>
            <p className="text-xs text-blue-900">
              {overview?.sponsorships?.note || 'Promised sponsorships are segregated and never counted as income until verified received.'}
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl bg-white p-3 border border-blue-100">
                <span className="text-[10px] font-bold uppercase text-slate-500">Promised Sponsorships</span>
                <p className="text-lg font-black text-amber-700">₹{(overview?.sponsorships?.totalPromised ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white p-3 border border-blue-100">
                <span className="text-[10px] font-bold uppercase text-slate-500">Verified Received (Income)</span>
                <p className="text-lg font-black text-emerald-700">₹{(overview?.sponsorships?.totalVerifiedReceived ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white p-3 border border-blue-100">
                <span className="text-[10px] font-bold uppercase text-slate-500">Outstanding Commitments</span>
                <p className="text-lg font-black text-slate-700">₹{(overview?.sponsorships?.outstandingPromised ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Budget Alerts Banner */}
          {overview?.budgetAlerts?.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                <FiAlertTriangle className="h-5 w-5 text-amber-600" />
                <span>Budget Expenditure Alerts ({overview.budgetAlerts.length})</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {overview.budgetAlerts.map((alt, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 bg-white text-xs ${
                      alt.severity === 'CRITICAL' ? 'border-rose-300 text-rose-900' : 'border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{alt.category}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${alt.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                        {alt.utilizationRate}%
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 text-slate-600">{alt.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue Alert */}
          {sum.totalOverdue > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm">
              <div className="flex items-center gap-3">
                <FiAlertTriangle className="h-5 w-5 text-rose-600" />
                <div>
                  <p className="text-sm font-bold">
                    ₹{sum.totalOverdue?.toLocaleString()} in Overdue Obligations
                  </p>
                  <p className="text-xs text-rose-700">
                    Obligations past due date require review, reminder notifications, or hardship waivers.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStatusFilter('OVERDUE');
                  setActiveTab('dues');
                }}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
              >
                Inspect Overdue
              </button>
            </div>
          )}

          {/* Recent Verified Transactions Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-900">Recent Verified Transactions</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly verified gateway payment records from database. Pending transactions are excluded from income.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Transaction ID</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview?.recentTransactions?.length === 0 && (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500 text-xs">
                        No verified transactions found in database.
                      </td>
                    </tr>
                  )}
                  {overview?.recentTransactions?.map((tx) => (
                    <tr key={tx.id || tx.transactionId} className="hover:bg-slate-50/75">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">
                        {tx.transactionId}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                          {tx.paymentType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        ₹{tx.amount}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {tx.paymentMethod || 'ONLINE'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(tx.paidAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          VERIFIED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DUES OBLIGATIONS */}
      {activeTab === 'dues' && (
        <div className="mt-6 space-y-4">
          {/* Dues Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 max-w-md">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search student name, email, or member number..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setDuesPage(0);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Settlement</option>
                <option value="PAID">Paid & Verified</option>
                <option value="OVERDUE">Overdue</option>
                <option value="WAIVED">Waived</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={termFilter}
                onChange={(e) => {
                  setTermFilter(e.target.value);
                  setDuesPage(0);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Terms</option>
                {availableTerms.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {!availableTerms.includes('2026-2027') && (
                  <option value="2026-2027">2026-2027</option>
                )}
              </select>
            </div>
          </div>

          {/* Dues Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Student Member</th>
                    <th className="px-5 py-3.5">Term</th>
                    <th className="px-5 py-3.5">Amount</th>
                    <th className="px-5 py-3.5">Due Date</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Payment Reference</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {duesLoading && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-500">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mr-2 align-middle" />
                        Loading dues records...
                      </td>
                    </tr>
                  )}

                  {!duesLoading && duesList.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-500">
                        No dues obligations found matching filters.
                      </td>
                    </tr>
                  )}

                  {!duesLoading &&
                    duesList.map((d) => {
                      let statusBadge = 'bg-amber-100 text-amber-800';
                      if (d.status === 'PAID') statusBadge = 'bg-emerald-100 text-emerald-800 font-bold';
                      else if (d.status === 'OVERDUE') statusBadge = 'bg-rose-100 text-rose-800 font-bold';
                      else if (d.status === 'WAIVED') statusBadge = 'bg-slate-100 text-slate-700';

                      return (
                        <tr key={d.id} className="hover:bg-slate-50/75 transition">
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-900">{d.user?.name || `User #${d.userId}`}</div>
                            <div className="text-xs text-slate-500">
                              {d.user?.memberNumber || '—'} · {d.user?.email || ''}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-semibold text-slate-700">
                            {d.academicTerm}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-900">
                            ₹{d.amount}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-600">
                            {d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge}`}>
                              {d.status}
                            </span>
                            {d.waiverReason && (
                              <p className="text-[11px] text-slate-400 mt-0.5 italic">
                                Reason: {d.waiverReason}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                            {d.paymentReference || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {d.status !== 'PAID' && d.status !== 'WAIVED' && (
                              <button
                                onClick={() => {
                                  setWaiveModalDue(d);
                                  setWaiverReason('');
                                }}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                Waive Dues
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
              <p className="text-xs text-slate-500">
                Showing page <span className="font-bold">{duesPage + 1}</span> of <span className="font-bold">{duesTotalPages}</span> ({duesTotalElements} total obligations)
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDuesPage((p) => Math.max(0, p - 1))}
                  disabled={duesPage === 0 || duesLoading}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  <FiChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDuesPage((p) => Math.min(duesTotalPages - 1, p + 1))}
                  disabled={duesPage >= duesTotalPages - 1 || duesLoading}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  <FiChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VERIFIED REPORTS */}
      {activeTab === 'reports' && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Financial Reports & Obligation Summaries</h3>
              <p className="text-xs text-slate-500">Database-derived statements with audit verification</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={reportTerm}
                onChange={(e) => setReportTerm(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Academic Terms</option>
                {availableTerms.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {!availableTerms.includes('2026-2027') && (
                  <option value="2026-2027">2026-2027</option>
                )}
              </select>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
              >
                <FiDownload className="h-4 w-4" /> Export CSV Report
              </button>
            </div>
          </div>

          {reportsLoading && (
            <div className="p-12 text-center text-slate-500">Loading verified reports...</div>
          )}

          {!reportsLoading && reports && (
            <>
              {/* Term Breakdown Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reports.termReports?.map((r) => (
                  <div key={r.academicTerm} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{r.academicTerm}</span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        {r.collectionRate}% Collected
                      </span>
                    </div>
                    <div className="mt-4 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Total Assessed:</span>
                        <span className="font-bold text-slate-900">₹{r.totalAssessed?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Verified Collected:</span>
                        <span className="font-bold text-emerald-700">₹{r.totalCollected?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Assessed Records:</span>
                        <span className="font-semibold">{r.recordCount}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Breakdown Summary */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h4 className="font-bold text-slate-900 text-sm">Obligation Status Distribution</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {Object.entries(reports.duesStatusBreakdown?.counts || {}).map(([st, cnt]) => (
                    <div key={st} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{st}</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{cnt} records</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        ₹{reports.duesStatusBreakdown?.amounts?.[st]?.toLocaleString() ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: PHASE 5 ROADMAP */}
      {/* TAB: BILLS & EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="mt-6">
          <ExpensesSection />
        </div>
      )}

      {/* TAB: REIMBURSEMENTS */}
      {activeTab === 'reimbursements' && (
        <div className="mt-6">
          <ReimbursementsSection />
        </div>
      )}

      {/* TAB: CLUB BUDGETS */}
      {activeTab === 'budgets' && (
        <div className="mt-6">
          <BudgetsSection />
        </div>
      )}

      {/* TAB: GENERAL LEDGER */}
      {activeTab === 'ledger' && (
        <div className="mt-6">
          <LedgerSection />
        </div>
      )}

      {/* TAB: FUNDRAISERS & SPONSORS */}
      {activeTab === 'fundraising' && (
        <div className="mt-6">
          <FundraisingSection />
        </div>
      )}
      {activeTab === 'merchandise' && <MerchandiseSection />}

      {/* TAB: PHASE 5 OVERVIEW */}
      {activeTab === 'phase5' && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <FiShield className="h-5 w-5 text-emerald-600" />
              <span>Skyline Student Association — Phase 5 Finance & Operations Active</span>
            </div>
            <p className="mt-1 text-xs text-emerald-800 leading-relaxed">
              All financial domains are fully integrated with real persisted backend collections, append-only double-entry general ledger, and separation-of-duties enforcement.
            </p>
          </div>
          <LedgerSection />
        </div>
      )}

      {/* ASSESS DUES MODAL */}
      {showAssessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Assess New Dues Obligation</h3>
            <p className="mt-1 text-xs text-slate-500">
              Create an official student association dues assessment for an approved member.
            </p>

            <form onSubmit={handleAssessSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Target User ID</label>
                <input
                  type="number"
                  required
                  value={assessForm.userId}
                  onChange={(e) => setAssessForm({ ...assessForm, userId: e.target.value })}
                  placeholder="e.g. 101"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Amount (INR)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={assessForm.amount}
                  onChange={(e) => setAssessForm({ ...assessForm, amount: e.target.value })}
                  placeholder="e.g. 500"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Academic Term</label>
                <input
                  type="text"
                  required
                  value={assessForm.academicTerm}
                  onChange={(e) => setAssessForm({ ...assessForm, academicTerm: e.target.value })}
                  placeholder="2026-2027"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Due Date</label>
                <input
                  type="date"
                  value={assessForm.dueDate}
                  onChange={(e) => setAssessForm({ ...assessForm, dueDate: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Title / Description</label>
                <input
                  type="text"
                  value={assessForm.title}
                  onChange={(e) => setAssessForm({ ...assessForm, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssessModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assessSubmitting}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {assessSubmitting ? 'Assessing...' : 'Confirm Assessment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WAIVE DUES MODAL */}
      {waiveModalDue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Waive Dues Obligation</h3>
            <p className="mt-1 text-xs text-slate-500">
              Apply an authorized executive waiver for Obligation #{waiveModalDue.id} (₹{waiveModalDue.amount} for User #{waiveModalDue.userId}).
            </p>

            <form onSubmit={handleWaiveSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Waiver Reason / Justification</label>
                <textarea
                  rows="3"
                  required
                  value={waiverReason}
                  onChange={(e) => setWaiverReason(e.target.value)}
                  placeholder="e.g. Merit scholarship recipient, financial hardship committee approval, executive exemption..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWaiveModalDue(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={waiveSubmitting}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {waiveSubmitting ? 'Waiving...' : 'Confirm Waiver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
