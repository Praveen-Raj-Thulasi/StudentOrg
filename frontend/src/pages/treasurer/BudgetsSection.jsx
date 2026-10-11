import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { financeAPI } from '../../services/api';
import { FiPlus, FiSliders, FiPieChart } from 'react-icons/fi';

export default function BudgetsSection() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState('2026-2027');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    category: 'OPERATIONS',
    allocatedAmount: '',
    academicTerm: '2026-2027',
    description: '',
  });

  const [adjustModalBudget, setAdjustModalBudget] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const res = await financeAPI.getBudgets({ academicTerm: selectedTerm });
      setBudgets(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [selectedTerm]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await financeAPI.createBudget({
        ...createForm,
        allocatedAmount: Number(createForm.allocatedAmount),
      });
      toast.success('Budget allocation established');
      setShowCreateModal(false);
      setCreateForm({
        category: 'OPERATIONS',
        allocatedAmount: '',
        academicTerm: '2026-2027',
        description: '',
      });
      fetchBudgets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create budget');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustModalBudget) return;
    setSubmitting(true);
    try {
      await financeAPI.adjustBudget(adjustModalBudget.id, {
        adjustmentAmount: Number(adjustAmount),
        reason: adjustReason,
      });
      toast.success('Budget adjusted successfully');
      setAdjustModalBudget(null);
      setAdjustAmount('');
      setAdjustReason('');
      fetchBudgets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to adjust budget');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Budget Allocations & Spend Ceilings</h3>
          <p className="text-xs text-slate-500">
            Real-time expenditure tracking derived strictly from authoritative paid records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            placeholder="2026-2027"
            className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          />
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <FiPlus className="h-3.5 w-3.5" /> Allocate Budget
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading budgets...</div>
      ) : budgets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No budget allocations configured for term {selectedTerm}.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {budgets.map((b) => (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {b.category}
                  </span>
                  <h4 className="mt-1 font-mono text-xs font-bold text-slate-500">{b.budgetCode}</h4>
                </div>
                <button
                  onClick={() => setAdjustModalBudget(b)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                  title="Adjust Budget Allocation"
                >
                  <FiSliders className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-3 flex items-baseline justify-between text-xs">
                <span className="text-slate-500">Actual Spent: ₹{b.actualSpent.toLocaleString()}</span>
                <span className="font-bold text-slate-900">
                  Effective Budget: ₹{b.effectiveBudget.toLocaleString()}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    b.utilizationRate > 90
                      ? 'bg-rose-500'
                      : b.utilizationRate > 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, b.utilizationRate)}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Utilization: {b.utilizationRate}%</span>
                <span className={b.remaining < 0 ? 'font-bold text-rose-600' : 'text-slate-600'}>
                  Remaining: ₹{b.remaining.toLocaleString()}
                </span>
              </div>

              {b.adjustmentHistory?.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                  Adjustments approved: {b.adjustmentHistory.length} times (Net:{' '}
                  {b.approvedAdjustments >= 0 ? `+₹${b.approvedAdjustments}` : `-₹${Math.abs(b.approvedAdjustments)}`})
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">New Category Budget Allocation</h3>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Category</label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="OPERATIONS">OPERATIONS</option>
                  <option value="FACILITIES">FACILITIES</option>
                  <option value="EQUIPMENT">EQUIPMENT</option>
                  <option value="SUPPLIES">SUPPLIES</option>
                  <option value="MARKETING">MARKETING</option>
                  <option value="REFRESHMENTS">REFRESHMENTS</option>
                  <option value="HONORARIUM">HONORARIUM</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Allocated Amount (INR)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={createForm.allocatedAmount}
                  onChange={(e) => setCreateForm({ ...createForm, allocatedAmount: e.target.value })}
                  placeholder="e.g. 50000"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Academic Term</label>
                <input
                  type="text"
                  required
                  value={createForm.academicTerm}
                  onChange={(e) => setCreateForm({ ...createForm, academicTerm: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Create Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST MODAL */}
      {adjustModalBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Adjust {adjustModalBudget.category} Budget
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Current Allocation: ₹{adjustModalBudget.effectiveBudget.toLocaleString()}
            </p>
            <form onSubmit={handleAdjust} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Adjustment Amount (positive to increase, negative to decrease)
                </label>
                <input
                  type="number"
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 5000 or -2000"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Reason / Executive Justification</label>
                <textarea
                  rows="3"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Additional equipment needed for annual festival..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalBudget(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
