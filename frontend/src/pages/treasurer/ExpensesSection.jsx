import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { financeAPI } from '../../services/api';
import { FiPlus, FiCheck, FiX, FiDollarSign, FiClock, FiFileText } from 'react-icons/fi';

export default function ExpensesSection() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    payee: '',
    amount: '',
    category: 'OPERATIONS',
    academicTerm: '2026-2027',
    dueDate: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const [rejectModalId, setRejectModalId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await financeAPI.getExpenses({
        approvalStatus: filterStatus !== 'ALL' ? filterStatus : undefined,
      });
      setExpenses(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [filterStatus]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await financeAPI.createExpense({
        ...createForm,
        amount: Number(createForm.amount),
      });
      toast.success('Expense bill registered successfully');
      setShowCreateModal(false);
      setCreateForm({
        title: '',
        payee: '',
        amount: '',
        category: 'OPERATIONS',
        academicTerm: '2026-2027',
        dueDate: '',
        description: '',
      });
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await financeAPI.approveExpense(id);
      toast.success('Expense approved');
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve expense');
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectModalId) return;
    try {
      await financeAPI.rejectExpense(rejectModalId, rejectReason);
      toast.success('Expense rejected');
      setRejectModalId(null);
      setRejectReason('');
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject expense');
    }
  };

  const handlePay = async (id) => {
    try {
      await financeAPI.payExpense(id, {
        paymentReference: `DISB-${Date.now()}`,
        disbursementMethod: 'DIRECT_TRANSFER',
      });
      toast.success('Expense marked as PAID and posted to General Ledger');
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process payment');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Vendor Bills & Expense Disbursements</h3>
          <p className="text-xs text-slate-500">
            Validated expense workflow with separation of approval and payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <FiPlus className="h-3.5 w-3.5" /> New Expense
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading bills and expenses...</div>
      ) : expenses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No expenses found matching the criteria.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-4 py-3">Reference / Title</th>
                <th className="px-4 py-3">Payee & Category</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Approval</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{exp.title}</p>
                    <p className="font-mono text-[11px] text-slate-500">{exp.reference}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{exp.payee}</p>
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {exp.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    ₹{exp.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        exp.approvalStatus === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : exp.approvalStatus === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {exp.approvalStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        exp.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {exp.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1.5">
                    {exp.approvalStatus === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleApprove(exp.id)}
                          className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectModalId(exp.id)}
                          className="rounded bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {exp.approvalStatus === 'APPROVED' && exp.paymentStatus === 'UNPAID' && (
                      <button
                        onClick={() => handlePay(exp.id)}
                        className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 shadow-sm"
                      >
                        Disburse Payout
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Record New Bill or Expense</h3>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Expense Title</label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Auditorium Sound System Rental"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Payee / Vendor</label>
                  <input
                    type="text"
                    required
                    value={createForm.payee}
                    onChange={(e) => setCreateForm({ ...createForm, payee: e.target.value })}
                    placeholder="e.g. Skyline Audio Rentals"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">Amount (INR)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                    placeholder="e.g. 15000"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700">Category</label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="FACILITIES">FACILITIES</option>
                    <option value="EQUIPMENT">EQUIPMENT</option>
                    <option value="SUPPLIES">SUPPLIES</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="REFRESHMENTS">REFRESHMENTS</option>
                    <option value="HONORARIUM">HONORARIUM</option>
                    <option value="OPERATIONS">OPERATIONS</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700">Due Date</label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Description</label>
                <textarea
                  rows="2"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Details regarding purpose or invoice reference..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Submit Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Reject Expense Submission</h3>
            <form onSubmit={handleReject} className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Rejection Reason</label>
                <textarea
                  rows="3"
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide reason for rejection..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalId(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
