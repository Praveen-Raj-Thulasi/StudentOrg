import { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import { motion } from 'framer-motion';
import { organizerAPI } from '../../services/api';
import Spinner from '../../components/common/Spinner';
import QueryError from '../../components/common/QueryError';
import {
  FiUsers, FiSearch, FiDownload, FiCalendar,
  FiMail, FiHash, FiFilter,
} from 'react-icons/fi';
import { MdSchool } from 'react-icons/md';

export default function OrganizerAttendees() {
  const [search, setSearch]             = useState('');
  const [selectedEvent, setEvent]       = useState('ALL');
  const [bookingFilter, setBooking]     = useState('ALL');
  const [attendanceFilter, setAttendance] = useState('ALL');

  const { data: participants, isLoading, isError, error, refetch } = useQuery(
    'org-participants',
    () => organizerAPI.participants().then(r => r.data?.data ?? []),
    { staleTime: 2 * 60_000 }
  );

  const list = Array.isArray(participants) ? participants : [];

  // Unique events for filter dropdown
  const eventOptions = useMemo(() => {
    const seen = new Map();
    list.forEach(p => { if (p.eventName && !seen.has(p.eventName)) seen.set(p.eventName, p.eventId); });
    return Array.from(seen, ([name, id]) => ({ name, id }));
  }, [list]);

  const filtered = useMemo(() => {
    let result = list;
    if (selectedEvent !== 'ALL') result = result.filter(p => p.eventName === selectedEvent);
    if (bookingFilter !== 'ALL') result = result.filter(p => p.bookingStatus === bookingFilter);
    if (attendanceFilter !== 'ALL') result = result.filter(p => p.attendanceStatus === attendanceFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        [p.name, p.email, p.eventName, p.department, p.college, p.memberNumber, p.ticketId]
          .some(v => v?.toLowerCase().includes(s))
      );
    }
    return result;
  }, [list, selectedEvent, bookingFilter, attendanceFilter, search]);

  const totalEvents    = new Set(list.map(p => p.eventName)).size;
  const totalAttendees = list.length;
  const verifiedCheckins = list.filter(p => p.attendanceStatus === 'PRESENT').length;

  const downloadCsv = () => {
    const header = 'Name,Email,Member Number,Event,Date,Department,College,Ticket ID,Attendance,Check-in Time,Booking Status,Payment Status\n';
    const rows = filtered.map(p =>
      [p.name, p.email, p.memberNumber || '', p.eventName, p.eventDate, p.department, p.college, p.ticketId, p.attendanceStatus || 'ABSENT', p.checkInTime || '', p.bookingStatus || '', p.paymentStatus || '']
        .map(v => `"${v ?? ''}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'attendees.csv'; a.click();
  };

  const downloadEventExport = async (eventId, eventName) => {
    const res = await organizerAPI.exportParticipants(eventId);
    const blob = new Blob([res.data], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${eventName || 'event'}-participants.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (isLoading) return (
    <div style={{background:'#F0F4FF', minHeight:'100vh'}} className="px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="skeleton h-8 w-52 rounded-xl"/>
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i=><div key={i} className="skeleton h-24 rounded-2xl"/>)}</div>
        <div className="skeleton h-96 rounded-2xl"/>
      </div>
    </div>
  );

  if (isError) return (
    <div style={{background:'#F0F4FF', minHeight:'100vh'}} className="px-4 py-10 max-w-4xl mx-auto">
      <QueryError message={error?.response?.data?.message || 'Could not load attendees'} onRetry={refetch}/>
    </div>
  );

  return (
    <div style={{background:'#F0F4FF', minHeight:'100vh'}} className="px-4 sm:px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{opacity:0,y:-12}} animate={{opacity:1,y:0}}>
          <h1 className="text-2xl font-extrabold text-slate-900" style={{fontFamily:'Space Grotesk,sans-serif'}}>
            Attendees Overview
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">All registered participants across your events</p>
        </motion.div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label:'Total Events',         value:totalEvents,      icon:<FiCalendar className="w-5 h-5 text-teal-600"/>,  bg:'bg-teal-50 border-teal-100' },
            { label:'Total Registrations',  value:totalAttendees,   icon:<FiUsers className="w-5 h-5 text-blue-600"/>,     bg:'bg-blue-50 border-blue-100' },
            { label:'Verified Check-ins',   value:verifiedCheckins, icon:<FiHash className="w-5 h-5 text-emerald-600"/>,  bg:'bg-emerald-50 border-emerald-100' },
          ].map((s,i) => (
            <motion.div key={s.label} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
              className={`bg-white rounded-2xl border p-5 flex items-center gap-4 ${s.bg}`}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${s.bg}`}>{s.icon}</div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-extrabold text-slate-900" style={{fontFamily:'Space Grotesk,sans-serif'}}>{s.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Search + filter + download */}
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:0.1}}
          className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by name, email, member #, ticket…"
              className="input-field pl-10 text-sm"/>
          </div>
          {/* Event filter */}
          <div className="relative flex items-center gap-1.5 min-w-[170px]">
            <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"/>
            <select value={selectedEvent} onChange={e => setEvent(e.target.value)}
              className="input-field pl-9 pr-4 text-sm w-full">
              <option value="ALL">All Events ({list.length})</option>
              {eventOptions.map(ev => (
                <option key={ev.name} value={ev.name}>{ev.name}</option>
              ))}
            </select>
          </div>
          {/* Booking status filter */}
          <div className="relative flex items-center gap-1.5 min-w-[150px]">
            <select value={bookingFilter} onChange={e => setBooking(e.target.value)}
              className="input-field px-3 text-sm w-full">
              <option value="ALL">All Bookings</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {/* Attendance status filter */}
          <div className="relative flex items-center gap-1.5 min-w-[150px]">
            <select value={attendanceFilter} onChange={e => setAttendance(e.target.value)}
              className="input-field px-3 text-sm w-full">
              <option value="ALL">All Attendance</option>
              <option value="PRESENT">Checked In (Present)</option>
              <option value="ABSENT">Not Checked In (Absent)</option>
            </select>
          </div>
          <button onClick={downloadCsv} disabled={filtered.length===0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-200 bg-white text-teal-700 text-sm font-semibold hover:bg-teal-50 transition-colors disabled:opacity-40">
            <FiDownload className="w-4 h-4"/> Export CSV
          </button>
        </motion.div>

        {/* Table */}
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.14}}
          className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <FiUsers className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-semibold">
                {list.length === 0 ? 'No registrations yet' : 'No results match your search'}
              </p>
              <p className="text-sm mt-1">
                {list.length === 0
                  ? 'Participants will appear here once someone registers for your events.'
                  : 'Try a different filter or keyword.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table header */}
              <div className="hidden lg:grid grid-cols-[2fr_2fr_1.8fr_1.4fr_1.4fr_1.4fr_1.4fr] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <div>Participant</div><div>Email</div><div>Event</div>
                <div>Department</div><div>Ticket</div><div>Attendance</div><div>Booking & Payment</div>
              </div>

              {filtered.map((p, i) => (
                <motion.div key={p.id ?? i}
                  initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*0.03}}
                  className="grid gap-3 px-5 py-4 border-b border-slate-50 last:border-0
                             lg:grid-cols-[2fr_2fr_1.8fr_1.4fr_1.4fr_1.4fr_1.4fr] lg:items-center
                             hover:bg-slate-50/60 transition-colors">

                  {/* Name + Member ID */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{background:'linear-gradient(135deg,#0f766e,#1565C0)'}}>
                      {p.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-slate-900 truncate block">{p.name}</span>
                      {p.memberNumber && (
                        <span className="text-[10px] text-teal-700 font-mono font-medium block">#{p.memberNumber}</span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0">
                    <FiMail className="w-3.5 h-3.5 shrink-0 text-slate-400"/>
                    <span className="truncate">{p.email}</span>
                  </div>

                  {/* Event */}
                  <div>
                    <p className="text-sm font-medium text-slate-800 truncate">{p.eventName}</p>
                    {p.eventDate && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <FiCalendar className="w-2.5 h-2.5"/>{p.eventDate}
                      </p>
                    )}
                  </div>

                  {/* Department */}
                  <div className="text-sm text-slate-500 truncate">
                    {p.department || <span className="text-slate-300">—</span>}
                  </div>

                  {/* Ticket ID */}
                  <div>
                    <code className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                      {p.ticketId || '—'}
                    </code>
                    {p.ticketStatus && p.ticketStatus !== 'VALID' && (
                      <span className="ml-1 text-[10px] font-bold text-amber-600">({p.ticketStatus})</span>
                    )}
                  </div>

                  {/* Attendance */}
                  <div>
                    {p.attendanceStatus === 'PRESENT' ? (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          Checked In
                        </span>
                        {p.checkInTime && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(p.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        Absent
                      </span>
                    )}
                  </div>

                  {/* Booking & Payment */}
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.bookingStatus === 'CONFIRMED' ? 'bg-teal-100 text-teal-800' :
                      p.bookingStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.bookingStatus || 'PENDING'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      p.paymentStatus === 'SUCCESSFUL' || p.paymentStatus === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      p.paymentStatus === 'FREE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}>
                      {p.paymentStatus || 'UNPAID'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </>
          )}
        </motion.div>

        <p className="text-xs text-slate-400 text-center">
          Showing {filtered.length} of {list.length} participants
        </p>
      </div>
    </div>
  );
}
