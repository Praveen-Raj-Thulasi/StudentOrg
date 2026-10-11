import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { motion } from 'framer-motion';
import { certificatesAPI, eventsAPI, organizerAPI } from '../../services/api';
import { toast } from 'react-toastify';
import Spinner from '../../components/common/Spinner';
import ConfirmModal from '../../components/common/ConfirmModal';
import {
  FiAward, FiEdit2, FiEye, FiImage, FiMessageCircle, FiTrash2,
  FiXCircle, FiCheckCircle, FiPlus, FiCamera, FiX, FiUpload, FiAlertTriangle
} from 'react-icons/fi';

const STATUS_BADGE = {
  PUBLISHED: 'badge-green',
  LIVE: 'badge-orange',
  UPCOMING: 'badge-blue',
  APPROVED: 'badge-green',
  DRAFT: 'badge-yellow',
  CANCELLED: 'badge-red',
  COMPLETED: 'badge-gray',
};

function refreshEventState(qc) {
  qc.invalidateQueries('org-events');
  qc.invalidateQueries('org-events-dash');
  qc.invalidateQueries('org-dash');
  qc.invalidateQueries('events');
  qc.invalidateQueries('discover');
  qc.invalidateQueries('notifs');
}

export default function MyEvents() {
  const qc = useQueryClient();
  const [page, setPage]     = useState(0);
  const [filter, setFilter] = useState('');

  // Modals state
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    action: null, // 'cancel' | 'delete'
    eventId: null,
    title: '',
    message: '',
  });

  const [certModal, setCertModal] = useState({
    open: false,
    eventId: null,
  });
  const [certFile, setCertFile] = useState(null);
  const [certSigName, setCertSigName] = useState('Association President');
  const [certError, setCertError] = useState('');

  const { data, isLoading } = useQuery(['org-events', page, filter],
    () => eventsAPI.myEvents({ page, size: 10, status: filter || undefined }).then(r => r.data?.data),
    { keepPreviousData: true });

  const cancelMutation = useMutation((id) => eventsAPI.cancel(id), {
    onSuccess: () => {
      toast.success('Event cancelled');
      refreshEventState(qc);
      setConfirmModal({ open: false, action: null, eventId: null, title: '', message: '' });
    },
    onError: () => {
      setConfirmModal({ open: false, action: null, eventId: null, title: '', message: '' });
    }
  });

  const publishMutation = useMutation((id) => eventsAPI.publish(id), {
    onSuccess: () => { toast.success('Event published!'); refreshEventState(qc); }
  });

  const deleteMutation = useMutation((id) => eventsAPI.delete(id), {
    onSuccess: () => {
      toast.success('Event deleted');
      refreshEventState(qc);
      setConfirmModal({ open: false, action: null, eventId: null, title: '', message: '' });
    },
    onError: () => {
      setConfirmModal({ open: false, action: null, eventId: null, title: '', message: '' });
    }
  });

  const templateMutation = useMutation(({ id, formData, signatureName }) =>
    certificatesAPI.uploadTemplate(id, formData, signatureName), {
    onSuccess: () => {
      toast.success('Certificate template uploaded');
      refreshEventState(qc);
      setCertModal({ open: false, eventId: null });
      setCertFile(null);
    },
    onError: (err) => {
      setCertError(err.response?.data?.message || 'Failed to upload template');
    }
  });

  const posterMutation = useMutation((id) => organizerAPI.generatePoster(id).then(r => r.data?.data), {
    onSuccess: (url) => { toast.success('Poster generated'); if (url) window.open(url, '_blank'); }
  });

  const handleCertSubmit = (e) => {
    e.preventDefault();
    if (!certFile) {
      setCertError('Please select a certificate template file (.pdf, .png, .jpg)');
      return;
    }
    setCertError('');
    const formData = new FormData();
    formData.append('file', certFile);
    templateMutation.mutate({
      id: certModal.eventId,
      formData,
      signatureName: certSigName.trim() || 'Association President',
    });
  };

  const handleConfirmAction = () => {
    if (!confirmModal.eventId) return;
    if (confirmModal.action === 'cancel') {
      cancelMutation.mutate(confirmModal.eventId);
    } else if (confirmModal.action === 'delete') {
      deleteMutation.mutate(confirmModal.eventId);
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div style={{ background: '#F0F4FF', minHeight: '100vh' }} className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-extrabold text-blue-900" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>My Events</h1>
          <Link to="/organizer/events/create" className="btn-primary flex items-center gap-2">
            <FiPlus /> New Event
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['', 'DRAFT', 'PUBLISHED', 'UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED'].map(s => (
            <button key={s} onClick={() => { setFilter(s); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                filter === s ? 'bg-blue-600 text-white shadow-blue' : 'bg-white text-gray-600 border border-blue-100 hover:bg-blue-50'
              }`}>
              {s || 'All'}
            </button>
          ))}
        </div>

        {!data?.content?.length ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-blue-100 shadow-card">
            <div className="text-5xl mb-4">📅</div>
            <p className="text-gray-500 mb-4">No events yet.</p>
            <Link to="/organizer/events/create" className="btn-primary">Create your first event</Link>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl overflow-hidden border border-blue-100 shadow-card">
              <table className="data-table">
                <thead>
                  <tr>{['Event', 'Category', 'Date', 'Sold', 'Revenue', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.content.map(ev => {
                    const sold    = ev.totalSeats - ev.availableSeats;
                    const revenue = (sold * Number(ev.ticketPrice)).toLocaleString();
                    return (
                      <tr key={ev.id}>
                        <td className="font-semibold text-blue-900 max-w-xs truncate">{ev.eventName}</td>
                        <td><span className="badge badge-blue text-[10px]">{ev.category?.replace(/_/g, ' ')}</span></td>
                        <td className="text-gray-500 whitespace-nowrap">{ev.eventDate}</td>
                        <td className="text-gray-500">{sold}/{ev.totalSeats}</td>
                        <td className="font-semibold text-blue-900">₹{revenue}</td>
                        <td><span className={`badge ${STATUS_BADGE[ev.status] || 'badge-gray'}`}>{ev.status}</span></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Link to={`/events/${ev.id}?tab=community`} title="Open community chat"
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors">
                              <FiMessageCircle className="w-4 h-4" />
                            </Link>
                            <Link to={`/events/${ev.id}`} title="View event"
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                              <FiEye className="w-4 h-4" />
                            </Link>
                            <Link to={`/organizer/events/${ev.id}/edit`} title="Edit"
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors">
                              <FiEdit2 className="w-4 h-4" />
                            </Link>
                            <Link to={`/organizer/events/${ev.id}/attendance`} title="Attendance scanner"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                              <FiCamera className="w-4 h-4" />
                            </Link>
                            {ev.hasCertificate && (
                              <button
                                onClick={() => {
                                  setCertError('');
                                  setCertFile(null);
                                  setCertSigName('Association President');
                                  setCertModal({ open: true, eventId: ev.id });
                                }}
                                title="Upload certificate template"
                                className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors"
                              >
                                <FiAward className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => posterMutation.mutate(ev.id)} title="Generate poster"
                              className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50 transition-colors">
                              <FiImage className="w-4 h-4" />
                            </button>
                            {ev.status === 'DRAFT' && (
                              <button onClick={() => publishMutation.mutate(ev.id)} title="Publish"
                                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
                                <FiCheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            {['PUBLISHED', 'DRAFT', 'APPROVED', 'UPCOMING', 'LIVE'].includes(ev.status) && (
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    open: true,
                                    action: 'cancel',
                                    eventId: ev.id,
                                    title: 'Cancel Event',
                                    message: `Are you sure you want to cancel "${ev.eventName}"? Attendees will be notified.`,
                                  });
                                }}
                                title="Cancel"
                                className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 transition-colors"
                              >
                                <FiXCircle className="w-4 h-4" />
                              </button>
                            )}
                            {ev.status === 'DRAFT' && (
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    open: true,
                                    action: 'delete',
                                    eventId: ev.id,
                                    title: 'Delete Event Draft',
                                    message: `Are you sure you want to delete the draft "${ev.eventName}"? This action cannot be undone.`,
                                  });
                                }}
                                title="Delete"
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.totalPages > 1 && (
              <div className="flex justify-center gap-3 mt-6">
                <button onClick={() => setPage(p => p - 1)} disabled={data.first} className="btn-outline py-2 px-5 text-sm disabled:opacity-40">← Prev</button>
                <span className="px-4 py-2 text-sm text-gray-500 font-medium">{data.page + 1}/{data.totalPages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={data.last}  className="btn-outline py-2 px-5 text-sm disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )}

        {/* Confirmation Modal for Cancel / Delete */}
        <ConfirmModal
          isOpen={confirmModal.open}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.action === 'delete' ? 'Delete Draft' : 'Cancel Event'}
          cancelText="Keep Event"
          variant={confirmModal.action === 'delete' ? 'danger' : 'warning'}
          loading={cancelMutation.isLoading || deleteMutation.isLoading}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirmModal({ open: false, action: null, eventId: null, title: '', message: '' })}
        />

        {/* Certificate Template Upload Modal */}
        {certModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100" role="dialog" aria-modal="true">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600">
                    <FiAward className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Certificate Template</h3>
                    <p className="text-xs text-slate-500">Upload custom certificate background & signature</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCertModal({ open: false, eventId: null })}
                  disabled={templateMutation.isLoading}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCertSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Template File (.pdf, .png, .jpg) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      setCertFile(e.target.files?.[0] || null);
                      if (certError) setCertError('');
                    }}
                    disabled={templateMutation.isLoading}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 transition-colors border border-slate-200 rounded-xl p-2"
                  />
                  {certFile && (
                    <p className="mt-1 text-xs text-emerald-600 font-medium">Selected: {certFile.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Authorized Signatory Name
                  </label>
                  <input
                    type="text"
                    value={certSigName}
                    onChange={(e) => setCertSigName(e.target.value)}
                    disabled={templateMutation.isLoading}
                    placeholder="e.g. Association President or Principal"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>

                {certError && (
                  <div className="rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-700 border border-red-200 flex items-center gap-1.5">
                    <FiAlertTriangle className="w-4 h-4 shrink-0" /> {certError}
                  </div>
                )}

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setCertModal({ open: false, eventId: null })}
                    disabled={templateMutation.isLoading}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={templateMutation.isLoading}
                    className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 text-sm font-semibold transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                  >
                    {templateMutation.isLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    <FiUpload className="w-4 h-4" /> Upload Template
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
