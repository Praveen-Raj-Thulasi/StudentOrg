import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { motion } from 'framer-motion';
import { organizerAPI, eventsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../../components/common/Spinner';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FiArrowRight, FiBell, FiCalendar, FiDollarSign, FiEdit2, FiList, FiPlus, FiTrendingUp, FiUsers } from 'react-icons/fi';

const stagger = { animate: { transition: { staggerChildren: 0.07 } } };
const fadeUp = { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const STATUS_BADGE = {
  PUBLISHED: 'badge-green',
  DRAFT: 'badge-yellow',
  CANCELLED: 'badge-red',
  COMPLETED: 'badge-gray',
  UPCOMING: 'badge-blue',
};

export default function OrganizerDashboard() {
  const { user } = useAuth();

  const { data: dashboard, isLoading: dLoading } = useQuery('org-dash',
    () => organizerAPI.getDashboard({ silent: true }).then((r) => r.data?.data), { retry: 0 });

  const { data: events, isLoading: eLoading } = useQuery('org-events-dash',
    () => eventsAPI.myEvents({ page: 0, size: 6 }, { silent: true }).then((r) => r.data?.data),
    { retry: 0 });

  const eventList = events?.content ?? [];
  const chartData = (dashboard?.analyticsLast30Days ?? []).map((item) => ({
    date: (item.date ?? '').slice(5),
    revenue: Number(item.totalRevenue ?? 0),
    bookings: Number(item.totalBookings ?? 0),
  }));

  const totalEvents = dashboard?.totalEvents ?? events?.totalElements ?? eventList.length;
  const publishedEvents = dashboard?.publishedEvents ?? eventList.filter((e) => e.status === 'PUBLISHED').length;
  const upcomingEvents = dashboard?.upcomingEvents ?? 0;
  const draftEvents = dashboard?.draftEvents ?? eventList.filter((e) => e.status === 'DRAFT').length;
  const completedEvents = dashboard?.completedEvents ?? eventList.filter((e) => e.status === 'COMPLETED').length;
  const netRevenue = dashboard?.revenueSummary?.netRecordedRevenue ?? dashboard?.totalRevenue ?? 0;
  const grossBookings = dashboard?.revenueSummary?.grossBookingsAmount ?? 0;
  const totalRefunds = dashboard?.revenueSummary?.totalRefunds ?? 0;
  const verifiedAttendance = dashboard?.verifiedAttendance ?? 0;
  const bookedCapacity = dashboard?.capacity?.bookedCapacity ?? 0;
  const totalCapacity = dashboard?.capacity?.totalCapacity ?? 0;
  const availableCapacity = dashboard?.capacity?.availableCapacity ?? 0;
  const totalDuties = dashboard?.volunteerCoordination?.totalVolunteerDuties ?? 0;
  const pendingDuties = dashboard?.volunteerCoordination?.pendingVolunteerDuties ?? 0;
  const completedDuties = dashboard?.volunteerCoordination?.completedVolunteerDuties ?? 0;

  const stats = [
    {
      label: 'Events Portfolio',
      value: totalEvents,
      sub: `${publishedEvents} Published • ${upcomingEvents} Upcoming`,
      icon: <FiCalendar />,
      cls: 'text-blue-600 bg-blue-50 border-blue-100',
    },
    {
      label: 'Net Recorded Revenue',
      value: `Rs. ${Number(netRevenue).toLocaleString()}`,
      sub: `Gross: Rs. ${Number(grossBookings).toLocaleString()} | Refunds: Rs. ${Number(totalRefunds).toLocaleString()}`,
      icon: <FiDollarSign />,
      cls: 'text-green-600 bg-green-50 border-green-100',
    },
    {
      label: 'Verified Attendance',
      value: `${verifiedAttendance} Checked In`,
      sub: `${bookedCapacity}/${totalCapacity} Booked (${availableCapacity} Avail)`,
      icon: <FiUsers />,
      cls: 'text-amber-600 bg-amber-50 border-amber-100',
    },
    {
      label: 'Volunteer Coordination',
      value: `${totalDuties} Duties`,
      sub: `${pendingDuties} Pending • ${completedDuties} Verified`,
      icon: <FiTrendingUp />,
      cls: 'text-violet-600 bg-violet-50 border-violet-100',
    },
  ];

  if (eLoading || (dLoading && !events)) return <Spinner full />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10 rounded-2xl bg-gradient-to-br from-slate-950 to-teal-800 p-8 text-white shadow-card">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-teal-200">Organizer Dashboard</p>
              <h1 className="text-3xl font-extrabold" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>Welcome back, {user?.name || 'Organizer'}</h1>
              <p className="mt-1 text-slate-200">Create events, track authoritative bookings, monitor verified attendance, and coordinate volunteers.</p>
            </div>
            <Link to="/organizer/events/create" className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-300 px-5 py-3 text-sm font-black text-teal-950 transition hover:bg-teal-200">
              <FiPlus /> Create Event
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { to: '/organizer/events', label: 'My Events', icon: <FiList /> },
              { to: '/organizer/attendees', label: 'Attendees & Tickets', icon: <FiUsers /> },
              { to: '/organizer/analytics', label: 'Analytics & Revenue', icon: <FiTrendingUp /> },
              { to: '/notifications', label: 'Notifications', icon: <FiBell /> },
              { to: '/events', label: 'Browse Public Events', icon: <FiCalendar /> },
            ].map((action) => (
              <Link key={action.to} to={action.to} className="inline-flex items-center gap-2 rounded-xl bg-white/12 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-white/20">
                {action.icon}{action.label}
              </Link>
            ))}
          </div>
        </motion.div>

        <motion.div variants={stagger} initial="initial" animate="animate" className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={fadeUp} className="rounded-xl border bg-white p-5 shadow-card">
              <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl border ${stat.cls}`}>{stat.icon}</div>
              <div className="text-2xl font-extrabold text-slate-950" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>{stat.value}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-600">{stat.label}</div>
              {stat.sub && <div className="mt-1.5 text-[11px] font-medium text-slate-400">{stat.sub}</div>}
            </motion.div>
          ))}
        </motion.div>

        {chartData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="mb-5 text-lg font-bold text-slate-950">Revenue - Last 30 Days</h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0F766E" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip formatter={(value) => `Rs. ${value.toLocaleString()}`} contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff' }} />
                <Area type="monotone" dataKey="revenue" stroke="#0F766E" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-950">My Events</h2>
            <Link to="/organizer/events" className="flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900">
              View all <FiArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="data-table">
              <thead>
                <tr>{['Event', 'Category', 'Date', 'Seats', 'Status', ''].map((heading) => <th key={heading}>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {eventList.map((event) => (
                  <tr key={event.id}>
                    <td className="max-w-xs truncate font-semibold text-slate-950">{event.eventName}</td>
                    <td><span className="badge badge-teal text-[10px]">{event.category?.replace(/_/g, ' ')}</span></td>
                    <td className="whitespace-nowrap text-slate-500">{event.eventDate}</td>
                    <td className="text-slate-500">{event.availableSeats}/{event.totalSeats}</td>
                    <td><span className={`badge ${STATUS_BADGE[event.status] || 'badge-gray'}`}>{event.status}</span></td>
                    <td>
                      <Link to={`/organizer/events/${event.id}/edit`} className="text-teal-600 transition-colors hover:text-teal-900">
                        <FiEdit2 className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!eventList.length && (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">No events yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
