import { useEffect, useState } from 'react';
import { useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { adminAPI, membershipAPI } from '../../services/api';
import ConfirmModal from '../../components/common/ConfirmModal';
import ReasonModal from '../../components/common/ReasonModal';
import { FiCheck, FiX, FiAlertTriangle } from 'react-icons/fi';

export default function Approvals() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('events'); // 'events' | 'memberships'
  const [rows, setRows] = useState([]);
  const [membershipRows, setMembershipRows] = useState([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  // Modal States
  const [eventReasonModal, setEventReasonModal] = useState({
    open: false,
    eventId: null,
    decision: 'REJECT', // 'REJECT' | 'REQUEST_MODIFICATIONS'
    eventName: '',
  });

  const [eventApproveModal, setEventApproveModal] = useState({
    open: false,
    eventId: null,
    eventName: '',
  });

  const [membershipRejectModal, setMembershipRejectModal] = useState({
    open: false,
    membershipId: null,
    studentName: '',
  });

  const [membershipApproveModal, setMembershipApproveModal] = useState({
    open: false,
    membership: null,
  });

  const [approveDuesAmount, setApproveDuesAmount] = useState('0');
  const [approveNote, setApproveNote] = useState('Welcome to Skyline Student Association!');
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadEvents = () => {
    adminAPI.approvals({ page: 0, size: 20 })
      .then((r) => setRows(r.data?.data?.content ?? []))
      .catch(() => {});
  };

  const loadMemberships = () => {
    setLoadingMemberships(true);
    membershipAPI.getPending()
      .then((r) => setMembershipRows(r.data?.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingMemberships(false));
  };

  useEffect(() => {
    loadEvents();
    loadMemberships();
  }, []);

  // Event Approval
  const handleApproveEventSubmit = async () => {
    if (!eventApproveModal.eventId) return;
    setActionLoading(true);
    setModalError('');
    try {
      await adminAPI.reviewEvent(eventApproveModal.eventId, { decision: 'APPROVE', reason: '' });
      toast.success('Event approved successfully');
      setEventApproveModal({ open: false, eventId: null, eventName: '' });
      qc.invalidateQueries('events');
      qc.invalidateQueries('org-events');
      qc.invalidateQueries('org-events-dash');
      qc.invalidateQueries('org-dash');
      qc.invalidateQueries('notifs');
      loadEvents();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to approve event';
      setModalError(msg);
      toast.error(msg, { toastId: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Event Rejection / Request Modifications with Reason
  const handleEventReasonSubmit = async (reason) => {
    if (!eventReasonModal.eventId) return;
    setActionLoading(true);
    setModalError('');
    try {
      await adminAPI.reviewEvent(eventReasonModal.eventId, {
        decision: eventReasonModal.decision,
        reason,
      });
      toast.success(
        eventReasonModal.decision === 'REQUEST_MODIFICATIONS'
          ? 'Modifications requested for organizer'
          : 'Event rejected'
      );
      setEventReasonModal({ open: false, eventId: null, decision: 'REJECT', eventName: '' });
      qc.invalidateQueries('events');
      qc.invalidateQueries('org-events');
      qc.invalidateQueries('org-events-dash');
      qc.invalidateQueries('org-dash');
      qc.invalidateQueries('notifs');
      loadEvents();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit review';
      setModalError(msg);
      toast.error(msg, { toastId: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Membership Approval
  const handleMembershipApproveSubmit = async (e) => {
    e.preventDefault();
    if (!membershipApproveModal.membership?.id) return;
    setActionLoading(true);
    setModalError('');
    try {
      const duesAmount = Number(approveDuesAmount) || 0;
      await membershipAPI.approve(membershipApproveModal.membership.id, {
        note: approveNote,
        duesAmount,
      });
      toast.success('Membership application approved!');
      setMembershipApproveModal({ open: false, membership: null });
      loadMemberships();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to approve application';
      setModalError(msg);
      toast.error(msg, { toastId: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Membership Rejection with Reason
  const handleMembershipRejectSubmit = async (reason) => {
    if (!membershipRejectModal.membershipId) return;
    setActionLoading(true);
    setModalError('');
    try {
      await membershipAPI.reject(membershipRejectModal.membershipId, { reason });
      toast.success('Membership application rejected');
      setMembershipRejectModal({ open: false, membershipId: null, studentName: '' });
      loadMemberships();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to reject application';
      setModalError(msg);
      toast.error(msg, { toastId: msg });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-950">Approval Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review event publication requests and student association membership applications.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('events')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'events'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Events ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('memberships')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'memberships'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Membership Applications ({membershipRows.length})
          </button>
        </div>
      </div>

      {tab === 'events' && (
        <div className="mt-6 space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No pending event approval requests.
            </div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{row.event?.eventName || `Event #${row.event?.id}`}</p>
                  <p className="text-sm text-slate-500">
                    Status: <span className="font-medium text-amber-600">{row.status}</span>
                  </p>
                  {row.requestedAt && (
                    <p className="text-xs text-slate-400 mt-1">
                      Requested: {new Date(row.requestedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
                    onClick={() => {
                      setModalError('');
                      setEventApproveModal({
                        open: true,
                        eventId: row.event.id,
                        eventName: row.event.eventName,
                      });
                    }}
                  >
                    <FiCheck className="w-4 h-4" /> Approve
                  </button>
                  <button
                    className="btn-outline px-4 py-2 text-sm"
                    onClick={() => {
                      setModalError('');
                      setEventReasonModal({
                        open: true,
                        eventId: row.event.id,
                        decision: 'REQUEST_MODIFICATIONS',
                        eventName: row.event.eventName,
                      });
                    }}
                  >
                    Request Changes
                  </button>
                  <button
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors flex items-center gap-1.5"
                    onClick={() => {
                      setModalError('');
                      setEventReasonModal({
                        open: true,
                        eventId: row.event.id,
                        decision: 'REJECT',
                        eventName: row.event.eventName,
                      });
                    }}
                  >
                    <FiX className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'memberships' && (
        <div className="mt-6 space-y-3">
          {loadingMemberships && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              Loading membership applications...
            </div>
          )}
          {!loadingMemberships && membershipRows.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No pending student membership applications.
            </div>
          )}
          {!loadingMemberships && membershipRows.map((mem) => (
            <div key={mem.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900 text-lg">{mem.user?.name || 'Student'}</p>
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                      {mem.memberNumber}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      {mem.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Email:</span> {mem.user?.email}
                    {mem.department && <span> · <span className="font-medium">Dept:</span> {mem.department}</span>}
                    {mem.yearOfStudy && <span> · <span className="font-medium">Year:</span> {mem.yearOfStudy}</span>}
                  </p>
                  {mem.statement && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 border border-slate-100">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Statement of Interest</p>
                      <p>{mem.statement}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Applied on: {new Date(mem.appliedAt).toLocaleDateString()} {new Date(mem.appliedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
                    onClick={() => {
                      setModalError('');
                      setApproveDuesAmount('0');
                      setApproveNote('Welcome to Skyline Student Association!');
                      setMembershipApproveModal({
                        open: true,
                        membership: mem,
                      });
                    }}
                  >
                    <FiCheck className="w-4 h-4" /> Approve
                  </button>
                  <button
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors flex items-center gap-1.5"
                    onClick={() => {
                      setModalError('');
                      setMembershipRejectModal({
                        open: true,
                        membershipId: mem.id,
                        studentName: mem.user?.name || 'Student',
                      });
                    }}
                  >
                    <FiX className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Approve Event Modal */}
      <ConfirmModal
        isOpen={eventApproveModal.open}
        title="Approve Event Request"
        message={`Are you sure you want to approve "${eventApproveModal.eventName || 'this event'}" for publication on the Skyline Hub?`}
        confirmText="Approve Event"
        cancelText="Cancel"
        variant="primary"
        loading={actionLoading}
        onConfirm={handleApproveEventSubmit}
        onClose={() => setEventApproveModal({ open: false, eventId: null, eventName: '' })}
      />

      {/* Event Reason Modal (Reject / Request Modifications) */}
      <ReasonModal
        isOpen={eventReasonModal.open}
        title={
          eventReasonModal.decision === 'REQUEST_MODIFICATIONS'
            ? 'Request Changes from Organizer'
            : 'Reject Event Request'
        }
        subtitle={`Please state the reason for ${
          eventReasonModal.decision === 'REQUEST_MODIFICATIONS'
            ? 'requesting changes on'
            : 'rejecting'
        } "${eventReasonModal.eventName || 'this event'}".`}
        label={
          eventReasonModal.decision === 'REQUEST_MODIFICATIONS'
            ? 'Requested Changes / Instructions'
            : 'Rejection Reason'
        }
        placeholder="Provide clear feedback for the organizer..."
        confirmText={
          eventReasonModal.decision === 'REQUEST_MODIFICATIONS'
            ? 'Submit Modification Request'
            : 'Confirm Event Rejection'
        }
        confirmVariant={eventReasonModal.decision === 'REQUEST_MODIFICATIONS' ? 'warning' : 'danger'}
        required={true}
        loading={actionLoading}
        apiError={modalError}
        onSubmit={handleEventReasonSubmit}
        onClose={() => setEventReasonModal({ open: false, eventId: null, decision: 'REJECT', eventName: '' })}
      />

      {/* Membership Reject Modal */}
      <ReasonModal
        isOpen={membershipRejectModal.open}
        title="Reject Membership Application"
        subtitle={`State the rejection reason for applicant ${membershipRejectModal.studentName}.`}
        label="Reason for Rejection"
        placeholder="e.g. Incomplete application or criteria not met..."
        confirmText="Reject Application"
        confirmVariant="danger"
        required={true}
        loading={actionLoading}
        apiError={modalError}
        onSubmit={handleMembershipRejectSubmit}
        onClose={() => setMembershipRejectModal({ open: false, membershipId: null, studentName: '' })}
      />

      {/* Membership Approve Modal */}
      {membershipApproveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Approve Student Membership</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Applicant: <span className="font-semibold text-slate-800">{membershipApproveModal.membership?.user?.name}</span> ({membershipApproveModal.membership?.memberNumber})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMembershipApproveModal({ open: false, membership: null })}
                disabled={actionLoading}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMembershipApproveSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Assessed Membership Dues (INR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={approveDuesAmount}
                  onChange={(e) => setApproveDuesAmount(e.target.value)}
                  disabled={actionLoading}
                  placeholder="0 for free membership"
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Enter 0 for immediate activation without dues, or an amount (e.g. 200) to create a verified dues obligation.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Reviewer Note (Optional)
                </label>
                <textarea
                  rows={3}
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  disabled={actionLoading}
                  placeholder="Welcome message or instructions..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {modalError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200 flex items-center gap-1.5">
                  <FiAlertTriangle className="w-4 h-4 shrink-0" /> {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMembershipApproveModal({ open: false, membership: null })}
                  disabled={actionLoading}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Approve Membership
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
