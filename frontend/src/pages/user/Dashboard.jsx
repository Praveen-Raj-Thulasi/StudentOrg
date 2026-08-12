import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from 'react-query';
import { motion } from 'framer-motion';
import {
  bookingsAPI, eventsAPI, certificatesAPI,
  gamificationAPI, paymentsAPI,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  FiArrowRight, FiAward, FiBell, FiCalendar, FiCheckCircle, FiXCircle,
  FiMapPin, FiSearch, FiStar, FiUser, FiUsers, FiZap, FiCreditCard,
} from 'react-icons/fi';
import { format } from 'date-fns';

/* ─── category → SVG poster map ───────────────────────────────────── */
const POSTER_MAP = {
  HACKATHON:           '/event-posters/hackathon.svg',
  TECHNICAL_SYMPOSIUM: '/event-posters/technical-symposium.svg',
  CODING_COMPETITION:  '/event-posters/coding-contest.svg',
  WORKSHOP:            '/event-posters/workshop.svg',
  SEMINAR:             '/event-posters/college-event.svg',
  PROJECT_EXHIBITION:  '/event-posters/iot-expo.svg',
  PLACEMENT_PREP:      '/event-posters/career-fair.svg',
  TECHNICAL_TRAINING:  '/event-posters/devops.svg',
  CULTURAL:            '/event-posters/cultural-fest.svg',
  SPORTS:              '/event-posters/sports-meet.svg',
  INTER_COLLEGE:       '/event-posters/technical-symposium.svg',
  INTRA_COLLEGE:       '/event-posters/college-event.svg',
  CLUB_ACTIVITY:       '/event-posters/entrepreneurship.svg',
};

/* ─── Thumbnail — uses SVG poster when real banner missing / broken ── */
function EventThumb({ banner, category, fallbackIcon }) {
  const [err, setErr] = useState(false);
  const poster = POSTER_MAP[category] ?? '/event-posters/college-event.svg';
  const src = (banner && !err) ? banner : poster;
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setErr(true)}
    />
  );
}

/* ─── helpers ─────────────────────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, delay } },
});

const LEVEL_LABELS = { 1: 'Beginner', 2: 'Explorer', 3: 'Achiever', 4: 'Champion', 5: 'Legend' };

const PAYMENT_STATUS_CLS = {
  SUCCESSFUL:         'text-emerald-600 bg-emerald-50  border-emerald-200',
  PENDING:            'text-amber-600   bg-amber-50    border-amber-200',
  PROCESSING:         'text-blue-600    bg-blue-50     border-blue-200',
  FAILED:             'text-rose-600    bg-rose-50     border-rose-200',
  REFUNDED:           'text-violet-600  bg-violet-50   border-violet-200',
  PARTIALLY_REFUNDED: 'text-violet-600  bg-violet-50   border-violet-200',
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try { return format(new Date(dateStr), 'dd MMM yyyy'); }
  catch { return dateStr; }
}

/* ─── Status badge ────────────────────────────────────────────────── */
function StatusPill({ status, styleMap }) {
  const cls = styleMap?.[status] ?? 'text-gray-500 bg-gray-100 border-gray-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

const BOOKING_STATUS_CLS = {
  CONFIRMED: 'text-emerald-600 bg-emerald-50  border-emerald-200',
  PENDING:   'text-amber-600   bg-amber-50    border-amber-200',
  CANCELLED: 'text-rose-600    bg-rose-50     border-rose-200',
  EXPIRED:   'text-gray-500    bg-gray-100    border-gray-200',
};

/* ─── Stat card ───────────────────────────────────────────────────── */
function StatCard({ icon, label, value, iconBg, delay }) {
  return (
    <motion.div {...fadeUp(delay)}
      className="flex items-center gap-4 rounded-2xl bg-white border border-slate-100 px-5 py-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900 leading-none mt-0.5"
          style={{ fontFamily: 'Space Grotesk,sans-serif' }}>{value}</p>
      </div>
    </motion.div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────── */
export default function UserDashboard() {
  const { user } = useAuth();

  /* bookings */
  const { data: bookingsPage, isLoading: bLoading } = useQuery(
    'dash-bookings',
    () => bookingsAPI.myBookings({ page: 0, size: 10 }).then(r => r.data?.data),
  );

  /* upcoming events */
  const { data: eventsPage, isLoading: eLoading } = useQuery(
    'dash-events',
    () => eventsAPI.search({ sortBy: 'date_asc', size: 5, status: 'UPCOMING' }).then(r => r.data?.data),
  );

  /* certificates count */
  const { data: certsPage } = useQuery(
    'dash-certs',
    () => certificatesAPI.my({ page: 0, size: 1 }).then(r => r.data?.data),
    { staleTime: 5 * 60_000, retry: false },
  );

  /* gamification */
  const { data: gami } = useQuery(
    'dash-gami',
    () => gamificationAPI.my().then(r => r.data?.data),
    { staleTime: 5 * 60_000, retry: false },
  );

  /* recent payments */
  const { data: paymentsPage } = useQuery(
    'dash-payments',
    () => paymentsAPI.history({ page: 0, size: 4 }).then(r => r.data?.data),
    { staleTime: 2 * 60_000, retry: false },
  );

  /* derived */
  const bookingList   = bookingsPage?.content ?? [];
  const totalBookings = bookingsPage?.totalElements ?? bookingList.length;
  const confirmed     = bookingList.filter(b => b.bookingStatus === 'CONFIRMED').length;
  const cancelled     = bookingList.filter(b => b.bookingStatus === 'CANCELLED').length;
  const certs         = certsPage?.totalElements ?? 0;

  const upcomingList  = (eventsPage?.content ?? []).slice(0, 5);
  const paymentList   = (paymentsPage?.content ?? []).slice(0, 4);

  const level    = LEVEL_LABELS[gami?.currentLevel] ?? 'Beginner';
  const xp       = gami?.totalXp ?? 0;
  const progress = Math.min(gami?.progressToNextLevel ?? 0, 100);
  const badges   = gami?.badges?.slice(0, 4) ?? [];

  const firstName = user?.name?.split(' ')[0] || 'there';

  const quickLinks = [
    { to: '/events',        label: 'Browse Events', icon: <FiSearch className="w-3.5 h-3.5" /> },
    { to: '/bookings',      label: 'My Bookings',   icon: <FiCalendar className="w-3.5 h-3.5" /> },
    { to: '/networking',    label: 'Network',        icon: <FiUsers className="w-3.5 h-3.5" /> },
    { to: '/discover',      label: 'Discover',      icon: <FiZap className="w-3.5 h-3.5" /> },
    { to: '/notifications', label: 'Notifications', icon: <FiBell className="w-3.5 h-3.5" /> },
    { to: '/profile',       label: 'Profile',       icon: <FiUser className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8" style={{ background: '#F0F4FF' }}>
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Teal hero banner (greeting inside) ───────────────────── */}
        <motion.div {...fadeUp(0)}
          className="rounded-2xl p-8 text-white shadow-lg overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 60%, #0d9488 100%)' }}>
          {/* decorative circles */}
          <div className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #2dd4bf, transparent)' }} />
          <div className="pointer-events-none absolute -bottom-8 left-1/3 w-44 h-44 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #5eead4, transparent)' }} />

          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-teal-300">
            Student Dashboard
          </p>
          <h1 className="mb-1 text-3xl font-extrabold" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
            Welcome back, {firstName}
          </h1>
          <p className="text-slate-300 text-sm">
            Level&nbsp;<strong className="text-white">{level}</strong>&nbsp;·&nbsp;{xp.toLocaleString()} XP
          </p>

          {/* XP progress bar */}
          <div className="mt-3 mb-5 h-2 rounded-full bg-white/10 overflow-hidden w-full max-w-xs">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
              className="h-2 rounded-full bg-teal-400"
            />
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap gap-2">
            {quickLinks.map(a => (
              <Link key={a.to} to={a.to}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/15 hover:bg-white/20 transition-colors">
                {a.icon}{a.label}
              </Link>
            ))}
          </div>
        </motion.div>

        {/* ── Stat cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard delay={0.05} label="Total Bookings" value={totalBookings}
            icon={<FiCalendar className="w-5 h-5 text-teal-600" />}
            iconBg="bg-teal-50 border border-teal-100" />
          <StatCard delay={0.1} label="Confirmed" value={confirmed}
            icon={<FiCheckCircle className="w-5 h-5 text-emerald-600" />}
            iconBg="bg-emerald-50 border border-emerald-100" />
          <StatCard delay={0.15} label="Cancelled" value={cancelled}
            icon={<FiXCircle className="w-5 h-5 text-rose-500" />}
            iconBg="bg-rose-50 border border-rose-100" />
          <StatCard delay={0.2} label="Certificates" value={certs}
            icon={<FiAward className="w-5 h-5 text-violet-600" />}
            iconBg="bg-violet-50 border border-violet-100" />
        </div>

        {/* ── Main two-column grid ──────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* ── Recent Bookings ─────────────────────────────────────── */}
          <motion.div {...fadeUp(0.12)}
            className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="font-extrabold text-slate-900 text-base"
                style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
                Recent Bookings
              </h2>
              <Link to="/bookings"
                className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                View all <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="px-4 pb-2 space-y-1">
              {bLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl"/>)}
                </div>
              ) : bookingList.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No bookings yet.{' '}
                  <Link to="/events" className="text-teal-600 hover:underline">Browse events →</Link>
                </div>
              ) : bookingList.slice(0, 5).map((b, i) => (
                <motion.div key={b.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}>
                  <Link to={`/bookings/${b.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50 transition-colors">
                    <div className="h-12 w-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                      <EventThumb banner={b.event?.eventBanner} category={b.event?.category} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                        {b.event?.eventName ?? '—'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {fmtDate(b.event?.eventDate)}
                        {(b.event?.venueName || b.event?.location)
                          ? ` · ${b.event?.venueName || b.event?.location}` : ''}
                      </p>
                    </div>
                    <StatusPill status={b.bookingStatus} styleMap={BOOKING_STATUS_CLS} />
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="px-4 pb-4 pt-1">
              <Link to="/bookings"
                className="block w-full rounded-xl border border-slate-200 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all">
                View All Bookings
              </Link>
            </div>
          </motion.div>

          {/* ── Upcoming Events ──────────────────────────────────────── */}
          <motion.div {...fadeUp(0.16)}
            className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="font-extrabold text-slate-900 text-base"
                style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
                Upcoming Events
              </h2>
              <Link to="/events"
                className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                View all <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="px-4 pb-2 space-y-1">
              {eLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl"/>)}
                </div>
              ) : upcomingList.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No upcoming events right now.
                </div>
              ) : upcomingList.map((ev, i) => (
                <motion.div key={ev.id}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}>
                  <div className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50 transition-colors">
                    <div className="h-12 w-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                      <EventThumb banner={ev.eventBanner} category={ev.category} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                        {ev.eventName}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                        {fmtDate(ev.eventDate)}
                        {(ev.venueName || ev.location)
                          ? <> · <FiMapPin className="w-2.5 h-2.5 inline shrink-0"/>{ev.venueName || ev.location}</>
                          : null}
                      </p>
                    </div>
                    <Link to={`/events/${ev.id}`}
                      className="shrink-0 rounded-lg border border-emerald-200 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all">
                      View Details
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="px-4 pb-4 pt-1">
              <Link to="/events"
                className="block w-full rounded-xl border border-slate-200 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all">
                Browse All Events
              </Link>
            </div>
          </motion.div>
        </div>

        {/* ── Bottom two-column grid ────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* ── XP & Achievements ────────────────────────────────────── */}
          <motion.div {...fadeUp(0.22)}
            className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 border border-amber-100">
                  <FiZap className="w-4 h-4 text-amber-500" />
                </div>
                <h2 className="font-extrabold text-slate-900 text-base"
                  style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
                  XP &amp; Achievements
                </h2>
              </div>
              <Link to="/portfolio"
                className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                Portfolio <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="px-5 pb-5 space-y-4">
              {/* Level + XP */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Current Level</p>
                  <p className="text-lg font-extrabold text-slate-900 leading-tight"
                    style={{ fontFamily: 'Space Grotesk,sans-serif' }}>{level}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-medium">Total XP</p>
                  <p className="text-lg font-extrabold text-amber-600 leading-tight">{xp.toLocaleString()}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] text-slate-400 font-medium">Progress to next level</p>
                  <p className="text-[11px] font-bold text-amber-600">{progress}%</p>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                  />
                </div>
              </div>

              {/* Badges */}
              {badges.length > 0 ? (
                <div>
                  <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mb-2">Recent Badges</p>
                  <div className="flex flex-wrap gap-2">
                    {badges.map((b, i) => (
                      <span key={b.id ?? i} title={b.badgeDescription}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                        {b.iconUrl && <span>{b.iconUrl}</span>}
                        <FiAward className="w-3 h-3" />
                        {b.badgeName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
                  🏅 Complete events to earn your first badge and level up!
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Recent Payments ──────────────────────────────────────── */}
          <motion.div {...fadeUp(0.26)}
            className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
                  <FiCreditCard className="w-4 h-4 text-blue-500" />
                </div>
                <h2 className="font-extrabold text-slate-900 text-base"
                  style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
                  Recent Payments
                </h2>
              </div>
              <Link to="/payments"
                className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                View all <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="px-4 pb-4 space-y-1">
              {paymentList.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  No payment records yet.
                </div>
              ) : paymentList.map((p, i) => (
                <motion.div key={p.paymentId ?? i}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.07 * i }}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50 transition-colors">
                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
                    <FiCreditCard className="w-4 h-4 text-blue-500" />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                      {p.eventName ?? 'Event Booking'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {p.paidAt ? fmtDate(p.paidAt) : '—'}
                      {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                    </p>
                  </div>
                  {/* Amount + status */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-slate-900">
                      {p.amount != null
                        ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.amount)
                        : '—'}
                    </p>
                    <StatusPill
                      status={p.paymentStatus ?? p.status ?? '—'}
                      styleMap={PAYMENT_STATUS_CLS}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
