import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { motion } from 'framer-motion';
import { bookingsAPI, certificatesAPI } from '../../services/api';
import Spinner from '../../components/common/Spinner';
import QueryError from '../../components/common/QueryError';
import { toast } from 'react-toastify';
import { FiCalendar, FiMapPin, FiX, FiEye, FiDownload, FiCheckCircle, FiClock, FiAward, FiAlertCircle } from 'react-icons/fi';
import { MdSchool } from 'react-icons/md';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';

const STATUS_CLS = { CONFIRMED:'badge-green', CANCELLED:'badge-red', PENDING:'badge-yellow', EXPIRED:'badge-red' };

export default function MyBookings() {
  const qc = useQueryClient();
  const [page, setPage]    = useState(0);
  const [tab, setTab]      = useState('active'); // 'active' | 'history'
  const [qrModal, setQrModal] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery(['my-bookings', page],
    () => bookingsAPI.myBookings({ page, size:50 }).then(r => r.data?.data),
    { keepPreviousData:true });

  const cancelMutation = useMutation(
    ({ id }) => bookingsAPI.cancel(id, 'User requested cancellation'),
    { onSuccess:() => { toast.success('Booking cancelled. Refund initiated.'); qc.invalidateQueries('my-bookings'); } }
  );

  if (isLoading) return <Spinner />;
  if (isError) return (
    <div style={{ background:'#F0F4FF', minHeight:'100vh' }} className="px-4 py-10 max-w-4xl mx-auto">
      <QueryError message={error?.response?.data?.message} onRetry={refetch} />
    </div>
  );

  const allBookings = data?.content ?? [];
  const ENDED_EVENT = new Set(['COMPLETED','EXPIRED','CANCELLED']);

  // Active: confirmed/pending booking, event still ongoing, not yet attended
  const activeBookings = allBookings.filter(b =>
    !['CANCELLED','EXPIRED'].includes(b.bookingStatus) &&
    !ENDED_EVENT.has(b.event?.status) &&
    b.attendanceStatus !== 'PRESENT'
  );
  // History: cancelled/expired/attended bookings OR ended events
  const historyBookings = allBookings.filter(b =>
    ['CANCELLED','EXPIRED'].includes(b.bookingStatus) ||
    ENDED_EVENT.has(b.event?.status) ||
    b.attendanceStatus === 'PRESENT'
  );

  const displayList = tab === 'active' ? activeBookings : historyBookings;

  return (
    <div style={{ background:'#F0F4FF', minHeight:'100vh' }} className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-blue-900 mb-8" style={{ fontFamily:'Space Grotesk,sans-serif' }}>
          My Bookings
        </h1>

        {/* Tab strip */}
        <div className="flex gap-1 p-1 bg-white rounded-2xl border border-blue-100 mb-6 w-fit shadow-sm">
          {[['active','Active',activeBookings.length],['history','History',historyBookings.length]].map(([t,lbl,cnt])=>(
            <button key={t} type="button" onClick={()=>setTab(t)}
              className={`relative px-5 py-2 rounded-xl text-sm font-semibold transition-all ${tab===t?'bg-blue-600 text-white shadow':'text-slate-600 hover:bg-slate-50'}`}>
              {lbl}
              {cnt > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab===t?'bg-white/25 text-white':'bg-blue-100 text-blue-700'}`}>{cnt}</span>
              )}
            </button>
          ))}
        </div>

        {!displayList.length ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-blue-100 shadow-card">
            <div className="text-5xl mb-4">{tab === 'history' ? '📋' : '🎟️'}</div>
            <h3 className="text-xl font-bold text-blue-900 mb-2">
              {tab === 'history' ? 'No history yet' : 'No active bookings'}
            </h3>
            <p className="text-gray-500 mb-6 text-sm">
              {tab === 'history'
                ? 'Past and cancelled bookings will appear here.'
                : 'Browse college events and register for your first one!'}
            </p>
            {tab === 'active' && <Link to="/events" className="btn-primary">Browse Events</Link>}
          </div>
        ) : (
          <div className="space-y-4">
            {displayList.map(b => {
              const ENDED_EVENT = new Set(['COMPLETED','EXPIRED','CANCELLED']);
              const eventEnded = ENDED_EVENT.has(b.event?.status);
              const attended = b.attendanceStatus === 'PRESENT';
              // Treat attended bookings as completed — hide active ticket actions
              const inactive = attended ||
                               b.ticketStatus === 'CANCELLED' || b.ticketStatus === 'EXPIRED' ||
                               b.bookingStatus === 'CANCELLED' || b.bookingStatus === 'EXPIRED' || eventEnded;
              const statusText = attended
                ? 'Attended'
                : b.bookingStatus === 'EXPIRED' || b.ticketStatus === 'EXPIRED'
                  ? 'Ticket Expired'
                  : b.bookingStatus === 'CANCELLED' || b.ticketStatus === 'CANCELLED'
                    ? 'Ticket Cancelled'
                    : b.bookingStatus;

              const statusCls = attended ? 'badge-green' : STATUS_CLS[b.bookingStatus] || 'badge-gray';

              return (
                <motion.div key={b.id} initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }}
                  className={`bg-white rounded-2xl p-5 flex flex-col sm:flex-row gap-4 border shadow-card ${inactive ? 'border-slate-200 opacity-80' : 'border-blue-100'}`}>

                  {/* Banner thumb */}
                  <div className="w-full sm:w-28 h-24 rounded-xl overflow-hidden bg-blue-50 flex-shrink-0 flex items-center justify-center relative">
                    {b.event?.eventBanner
                      ? <img src={b.event.eventBanner} alt="" className="w-full h-full object-cover"
                             onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement.querySelector('.banner-fallback').style.display='flex'; }} />
                      : null}
                    <span className="banner-fallback text-2xl" style={{display: b.event?.eventBanner ? 'none' : 'flex'}}>🎓</span>
                    {/* Event-ended overlay badge */}
                    {(eventEnded || attended) && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                        <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full">
                          {attended && !eventEnded ? '✅ Attended'
                            : b.event?.status === 'EXPIRED' ? 'Expired'
                            : b.event?.status === 'COMPLETED' ? 'Ended'
                            : 'Cancelled'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                      <Link to={`/events/${b.event?.id}`}
                        className="font-bold text-blue-900 hover:text-blue-600 transition-colors text-sm leading-snug line-clamp-2">
                        {b.event?.eventName}
                      </Link>
                      <span className={`badge ${statusCls}`}>{statusText}</span>
                    </div>

                    {/* Event-ended notice */}
                    {eventEnded && b.bookingStatus === 'CONFIRMED' && (
                      <div className="mb-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                        {b.event?.status === 'EXPIRED'   && '🏁 Event has ended · Certificates may be available'}
                        {b.event?.status === 'COMPLETED' && '✅ Event has ended'}
                        {b.event?.status === 'CANCELLED' && '❌ Event was cancelled'}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <FiCalendar className="text-blue-400"/>
                        {b.event?.eventDate ? format(new Date(b.event.eventDate), 'MMM d, yyyy') : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <FiMapPin className="text-red-400"/>
                        {b.event?.location || b.event?.venueName || '—'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <code className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-mono border border-blue-100">
                        {b.ticketId}
                      </code>
                      <span className="text-gray-500">
                        {b.quantity} ticket{b.quantity > 1 ? 's' : ''} · ₹{Number(b.totalAmount).toLocaleString()}
                      </span>
                    </div>

                    {/* Attendance & Certificate status — shown for confirmed bookings */}
                    {b.bookingStatus === 'CONFIRMED' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {/* Attendance status */}
                        {b.attendanceStatus === 'PRESENT' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-[11px] font-bold text-green-700">
                            <FiCheckCircle className="w-3 h-3" /> Present
                            {b.checkInTime && (
                              <span className="font-normal text-green-600 ml-0.5">
                                · {format(new Date(b.checkInTime), 'MMM d, h:mm a')}
                              </span>
                            )}
                          </span>
                        ) : eventEnded ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                            <FiAlertCircle className="w-3 h-3" /> Not Attended
                          </span>
                        ) : null}

                        {/* Certificate status — show when attended, regardless of event status */}
                        {b.attendanceStatus === 'PRESENT' && (
                          b.certificateEligible ? (
                            b.certificateId ? (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await certificatesAPI.download(b.certificateId);
                                    const url = URL.createObjectURL(res.data);
                                    const a = document.createElement('a');
                                    a.href = url; a.download = `${b.certificateId}.pdf`; a.click();
                                    URL.revokeObjectURL(url);
                                  } catch { toast.error('Could not download certificate.'); }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                              >
                                <FiDownload className="w-3 h-3" /> Download Certificate
                              </button>
                            ) : (
                              <Link to="/certificates"
                                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors">
                                <FiAward className="w-3 h-3" /> Certificate Eligible
                              </Link>
                            )
                          ) : null
                        )}
                        {b.attendanceStatus !== 'PRESENT' && eventEnded && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                            <FiAward className="w-3 h-3" /> You were not marked present for this event.
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3 mt-4 flex-wrap">
                      {/* Show View Ticket only for CONFIRMED, non-attended, non-ended active bookings */}
                      {!eventEnded && !attended && b.bookingStatus === 'CONFIRMED' && (
                        <button onClick={() => setQrModal(b)}
                          className="flex items-center gap-1.5 text-xs btn-outline py-1.5 px-3">
                          <FiEye className="w-3.5 h-3.5"/> View Ticket
                        </button>
                      )}
                      {/* Show "Complete Payment" prompt for PENDING bookings */}
                      {b.bookingStatus === 'PENDING' && !eventEnded && (
                        <Link
                          to={`/checkout/${b.id}`}
                          className="flex items-center gap-1.5 text-xs btn-primary py-1.5 px-3"
                        >
                          <FiClock className="w-3.5 h-3.5"/> Complete Payment
                        </Link>
                      )}
                      {/* Show "Attendance Complete" badge when marked present on an ongoing event */}
                      {attended && !eventEnded && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-[11px] font-bold text-green-700">
                          <FiCheckCircle className="w-3 h-3" /> Check-in Complete · Ticket used
                        </span>
                      )}
                      {b.cancelledAt && (
                        <span className="text-xs text-red-500">
                          Cancelled {format(new Date(b.cancelledAt), 'MMM d, yyyy h:mm a')}
                        </span>
                      )}
                      {/* Cancel only for active confirmed bookings on non-ended events, not yet attended */}
                      {b.bookingStatus === 'CONFIRMED' && !inactive && !eventEnded && !attended && (
                        <button onClick={() => { if (window.confirm('Cancel this booking?')) cancelMutation.mutate({ id:b.id }); }}
                          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
                          <FiX className="w-3.5 h-3.5"/> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {(data?.totalPages ?? 0) > 1 && tab === 'active' && (
              <div className="flex justify-center gap-3 pt-4">
                <button onClick={() => setPage(p => p-1)} disabled={data.first}
                  className="btn-outline py-2 px-5 disabled:opacity-40 text-sm">← Prev</button>
                <span className="px-4 py-2 text-sm text-gray-500 font-medium">
                  Page {data.page+1} of {data.totalPages}
                </span>
                <button onClick={() => setPage(p => p+1)} disabled={data.last}
                  className="btn-outline py-2 px-5 disabled:opacity-40 text-sm">Next →</button>
              </div>
            )}
          </div>
        )}

        {/* QR Modal */}
        {qrModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
               onClick={() => setQrModal(null)}>
            <motion.div initial={{ scale:0.9,opacity:0 }} animate={{ scale:1,opacity:1 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-blue-100"
              onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-blue-900 mb-1">Your Ticket</h3>
              <p className="text-gray-500 text-sm mb-5">{qrModal.event?.eventName}</p>
              <div className="flex justify-center mb-4">
                {qrModal.ticketStatus === 'CANCELLED' || qrModal.ticketStatus === 'EXPIRED' || qrModal.bookingStatus === 'CANCELLED' || qrModal.bookingStatus === 'EXPIRED'
                  ? <div className="w-48 h-48 rounded-3xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700 font-extrabold">
                      {qrModal.ticketStatus === 'EXPIRED' || qrModal.bookingStatus === 'EXPIRED' ? 'Ticket Expired' : 'Ticket Cancelled'}
                    </div>
                  : <QRCodeSVG value={qrModal.ticketId} size={190} />}
              </div>
              <code className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-xl block mb-5 font-mono border border-blue-100">
                {qrModal.ticketId}
              </code>
              <button onClick={() => setQrModal(null)} className="btn-primary w-full">Close</button>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
