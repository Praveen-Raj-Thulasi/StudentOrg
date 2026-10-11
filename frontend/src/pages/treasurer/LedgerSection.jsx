import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { financeAPI } from '../../services/api';
import { FiRotateCcw, FiShield, FiCheckCircle, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

export default function LedgerSection() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState('ALL');

  const [reconciliation, setReconciliation] = useState(null);
  const [recLoading, setRecLoading] = useState(false);

  const [reverseModalEntry, setReverseModalEntry] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await financeAPI.getLedger({
        page,
        limit: 25,
        entryType: filterType !== 'ALL' ? filterType : undefined,
      });
      const data = res.data?.data || {};
      setEntries(data.entries || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchReconciliation = async () => {
    setRecLoading(true);
    try {
      const res = await financeAPI.getReconciliation({ academicTerm: '2026-2027' });
      setReconciliation(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch reconciliation report');
    } finally {
      setRecLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [page, filterType]);

  useEffect(() => {
    fetchReconciliation();
  }, []);

  const handleReverse = async (e) => {
    e.preventDefault();
    if (!reverseModalEntry) return;
    setReversing(true);
    try {
      await financeAPI.reverseLedger(reverseModalEntry.id, { reason: reverseReason });
      toast.success('Ledger entry reversed with offsetting correction');
      setReverseModalEntry(null);
      setReverseReason('');
      fetchLedger();
      fetchReconciliation();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reverse entry');
    } finally {
      setReversing(false);
    }
  };

  const auth = reconciliation?.authoritativeRecords;
  const led = reconciliation?.ledgerRecords;
  const isBalanced = reconciliation?.reconciliation?.isBalanced;

  return (
    <div className="space-y-6">
      {/* Reconciliation Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <FiShield className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">Authoritative Reconciliation Audit</h3>
          </div>
          <button
            onClick={fetchReconciliation}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 self-start sm:self-auto"
          >
            <FiRefreshCw className="h-3.5 w-3.5" /> Re-audit
          </button>
        </div>

        {recLoading ? (
          <div className="py-6 text-center text-xs text-slate-500">Calculating reconciliation totals...</div>
        ) : reconciliation ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase text-slate-500">Verified Income</span>
                <p className="mt-1 text-xl font-black text-slate-900">
                  ₹{auth?.totalVerifiedIncome?.toLocaleString() ?? 0}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  From real payments (Dues, Events, Merch, Donations)
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <span className="text-xs font-bold uppercase text-slate-500">Disbursed Cashflow Out</span>
                <p className="mt-1 text-xl font-black text-slate-900">
                  ₹{((auth?.totalPaidExpenses || 0) + (auth?.totalPaidReimbursements || 0)).toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Paid expenses ({auth?.paidExpensesCount}) + Reimbursements ({auth?.paidReimbursementsCount})
                </p>
              </div>

              <div
                className={`rounded-xl border p-4 ${
                  isBalanced
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-amber-200 bg-amber-50/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-600">Reconciliation Status</span>
                  {isBalanced ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <FiCheckCircle className="h-4 w-4" /> BALANCED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                      <FiAlertTriangle className="h-4 w-4" /> DISCREPANCY
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xl font-black text-slate-900">
                  Net Ledger: ₹{led?.netLedgerCashflow?.toLocaleString() ?? 0}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {reconciliation.reconciliation.note}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Append-Only Ledger Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Append-Only General Ledger Journal</h3>
            <p className="text-xs text-slate-500">
              Immutable journal entries with unique idempotency keys and reversing correction entries.
            </p>
          </div>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value="ALL">All Entry Types</option>
            <option value="INCOME">Income Entries</option>
            <option value="EXPENSE">Expense Entries</option>
            <option value="REIMBURSEMENT">Reimbursement Entries</option>
            <option value="REFUND">Refund Entries</option>
            <option value="ADJUSTMENT">Adjustment Entries</option>
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading ledger journal...</div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No ledger entries found.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-4 py-3">Entry Number / Date</th>
                  <th className="px-4 py-3">Type & Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Source Ref / Idempotency Key</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((ent) => (
                  <tr key={ent.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-slate-900">{ent.entryNumber}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(ent.postedAt || ent.createdAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          ent.entryType === 'INCOME'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ent.entryType === 'EXPENSE'
                            ? 'bg-rose-100 text-rose-800'
                            : ent.entryType === 'REIMBURSEMENT'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {ent.entryType}
                      </span>
                      <p className="mt-0.5 text-[10px] text-slate-500">{ent.category}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{ent.description}</p>
                      {ent.isReversal && (
                        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 mt-0.5">
                          REVERSAL CORRECTION
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                      <p>{ent.sourceReference}</p>
                      <p className="truncate max-w-[140px] text-slate-400">{ent.idempotencyKey}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      ₹{ent.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          ent.status === 'POSTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600 line-through'
                        }`}
                      >
                        {ent.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ent.status === 'POSTED' && !ent.isReversal && (
                        <button
                          onClick={() => setReverseModalEntry(ent)}
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                        >
                          <FiRotateCcw className="h-3 w-3" /> Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* REVERSE ENTRY MODAL */}
      {reverseModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Reverse Ledger Entry {reverseModalEntry.entryNumber}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              This will mark the original entry as REVERSED and append an offsetting reversal record into the journal. Historical data is never deleted.
            </p>
            <form onSubmit={handleReverse} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Reason for Reversal</label>
                <textarea
                  rows="3"
                  required
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Booking refund processed, accounting reallocation..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReverseModalEntry(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversing}
                  className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Post Reversal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
