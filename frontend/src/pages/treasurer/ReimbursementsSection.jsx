import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { financeAPI, treasurerAPI } from '../../services/api';
import {
  FiCheck,
  FiX,
  FiDollarSign,
  FiEye,
  FiAlertTriangle,
  FiCheckCircle,
  FiShield,
  FiInfo,
} from 'react-icons/fi';

export default function ReimbursementsSection() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modals
  const [rejectModalId, setRejectModalId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [disburseModalId, setDisburseModalId] = useState(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [disbMethod, setDisbMethod] = useState('DIRECT_TRANSFER');

  // Inspection modal
  const [inspectModalClaim, setInspectModalClaim] = useState(null);
  const [inspectionData, setInspectionData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await financeAPI.getReimbursements({
        status: filterStatus !== 'ALL' ? filterStatus : undefined,
      });
      setClaims(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load reimbursement claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [filterStatus]);

  const handleReview = async (id, action) => {
    try {
      await financeAPI.reviewReimbursement(id, { action });
      toast.success(`Claim marked as ${action} and linked expense record generated`);
      fetchClaims();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} claim`);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectModalId) return;
    try {
      await financeAPI.reviewReimbursement(rejectModalId, {
        action: 'REJECTED',
        reason: rejectReason,
      });
      toast.success('Claim rejected');
      setRejectModalId(null);
      setRejectReason('');
      fetchClaims();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject claim');
    }
  };

  const handleOpenDisburse = (id) => {
    setDisburseModalId(id);
    setPaymentRef(`RMB-PAY-${Date.now()}`);
  };

  const handleDisburseSubmit = async (e) => {
    e.preventDefault();
    if (!disburseModalId || !paymentRef.trim()) {
      toast.warn('Payment reference is required');
      return;
    }
    try {
      await financeAPI.disburseReimbursement(disburseModalId, {
        paymentReference: paymentRef.trim(),
        disbursementMethod: disbMethod,
      });
      toast.success('Reimbursement disbursed and recorded in General Ledger');
      setDisburseModalId(null);
      setPaymentRef('');
      fetchClaims();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disburse claim');
    }
  };

  const handleInspectReceipt = async (claim) => {
    setInspectModalClaim(claim);
    setInspectLoading(true);
    try {
      const res = await treasurerAPI.inspectClaimReceipt(claim.id);
      setInspectionData(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to inspect receipt');
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Member & Volunteer Reimbursements</h3>
          <p className="text-xs text-slate-500">
            Lifecycle tracking with receipt OCR validation, separation of duties, and ledger disbursement.
          </p>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          <option value="ALL">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved (Awaiting Disbursement)</option>
          <option value="PAID">Disbursed (Paid)</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading claims...</div>
      ) : claims.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No reimbursement claims found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-md">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-4 py-3">Claim Number / User</th>
                <th className="px-4 py-3">Description & Category</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Receipt Validation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.map((clm) => (
                <tr key={clm.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-mono font-bold text-slate-900">{clm.claimNumber}</p>
                    <p className="text-[11px] text-slate-500">Claimant ID #{clm.claimantId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{clm.description}</p>
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {clm.category}
                    </span>
                    {clm.receiptUrl && (
                      <a
                        href={clm.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-[10px] text-blue-600 underline"
                      >
                        Receipt File
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    ₹{clm.amount?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleInspectReceipt(clm)}
                      className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                    >
                      <FiEye className="h-3 w-3" /> Inspect OCR
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        clm.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : clm.status === 'PAID'
                          ? 'bg-blue-100 text-blue-800'
                          : clm.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {clm.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold text-slate-700">
                      {clm.paymentStatus}
                    </span>
                    {clm.paymentReference && (
                      <p className="font-mono text-[9px] text-slate-400 mt-0.5">{clm.paymentReference}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1.5">
                    {(clm.status === 'SUBMITTED' || clm.status === 'UNDER_REVIEW') && (
                      <>
                        <button
                          onClick={() => handleReview(clm.id, 'APPROVED')}
                          className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectModalId(clm.id)}
                          className="rounded bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {clm.status === 'APPROVED' && clm.paymentStatus === 'UNPAID' && (
                      <button
                        onClick={() => handleOpenDisburse(clm.id)}
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

      {/* INSPECT RECEIPT OCR MODAL */}
      {inspectModalClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Receipt Validation & OCR Analysis</h3>
                <p className="text-xs text-slate-500 font-mono">{inspectModalClaim.claimNumber}</p>
              </div>
              <button
                onClick={() => {
                  setInspectModalClaim(null);
                  setInspectionData(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {inspectLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">Analyzing receipt & checking duplicates...</div>
            ) : inspectionData ? (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-[10px] font-bold uppercase text-slate-500">Claimant</span><p className="mt-0.5 font-semibold text-slate-800">{inspectionData.claim?.claimant?.name || `User #${inspectionData.claim?.claimantId ?? inspectModalClaim.claimantId}`}</p></div>
                    <div><span className="text-[10px] font-bold uppercase text-slate-500">Submitted</span><p className="mt-0.5 font-semibold text-slate-800">{new Date(inspectionData.claim?.createdAt || inspectModalClaim.createdAt).toLocaleDateString()}</p></div>
                    <div><span className="text-[10px] font-bold uppercase text-slate-500">Category</span><p className="mt-0.5 font-semibold text-slate-800">{inspectionData.claim?.category || inspectModalClaim.category}</p></div>
                    <div><span className="text-[10px] font-bold uppercase text-slate-500">Status</span><p className="mt-0.5 font-semibold text-slate-800">{inspectionData.claim?.status || inspectModalClaim.status}</p></div>
                  </div>
                  <p className="mt-2 border-t border-slate-100 pt-2 text-slate-700">{inspectionData.claim?.description || inspectModalClaim.description}</p>
                </div>
                {inspectionData.claim?.receiptUrl ? (
                  <a href={inspectionData.claim.receiptUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img src={inspectionData.claim.receiptUrl} alt={`Receipt for ${inspectionData.claim.claimNumber || inspectModalClaim.claimNumber}`} className="max-h-64 w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                    <span className="block border-t border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-bold text-blue-700">Open full receipt image</span>
                  </a>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No receipt image was attached. Review this claim manually.</div>
                )}
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Claimed Amount</span>
                    <p className="text-base font-bold text-slate-900">₹{inspectModalClaim.amount}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Extracted Total</span>
                    <p className="text-base font-bold text-emerald-700">
                      {inspectionData.receiptValidation?.extractedTotal
                        ? `₹${inspectionData.receiptValidation.extractedTotal}`
                        : 'N/A (Manual Review)'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between py-1 border-b">
                    <span className="text-slate-500">OCR Engine Status:</span>
                    <span className="font-semibold text-slate-800">
                      {inspectionData.receiptValidation?.ocrPerformed ? 'Processed' : 'Unavailable (Raw Attachment)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b">
                    <span className="text-slate-500">Duplicate Receipt Risk:</span>
                    <span
                      className={`font-bold ${
                        inspectionData.receiptValidation?.duplicateRisk ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {inspectionData.receiptValidation?.duplicateRisk ? 'FLAGGED (Found Duplicates)' : 'None Detected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b">
                    <span className="text-slate-500">Amount Mismatch:</span>
                    <span
                      className={`font-bold ${
                        inspectionData.receiptValidation?.amountMismatch ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {inspectionData.receiptValidation?.amountMismatch ? 'MISMATCH DETECTED' : 'Matched / Pending'}
                    </span>
                  </div>
                </div>

                {inspectionData.receiptValidation?.warnings?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <FiAlertTriangle className="h-4 w-4 text-amber-600" /> Validation Warnings
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                      {inspectionData.receiptValidation.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setInspectModalClaim(null);
                  setInspectionData(null);
                }}
                className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISBURSE PAYOUT MODAL */}
      {disburseModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Disburse Reimbursement Payout</h3>
            <p className="text-xs text-slate-500 mt-1">
              Mark reimbursement paid and append disbursement entry to the authoritative General Ledger.
            </p>
            <form onSubmit={handleDisburseSubmit} className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Payment Reference / UTR Number</label>
                <input
                  type="text"
                  required
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UTR-982138219"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Disbursement Method</label>
                <select
                  value={disbMethod}
                  onChange={(e) => setDisbMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="DIRECT_TRANSFER">Direct Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Petty Cash</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisburseModalId(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Confirm Payout
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
            <h3 className="text-base font-bold text-slate-900">Reject Reimbursement Claim</h3>
            <form onSubmit={handleRejectSubmit} className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Rejection Justification</label>
                <textarea
                  rows="3"
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Ineligible expenditure, receipt missing VAT detail..."
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
