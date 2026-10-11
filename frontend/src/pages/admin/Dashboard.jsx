import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminAPI } from '../../services/api';
import {
  FiUsers,
  FiAward,
  FiCalendar,
  FiDollarSign,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiRefreshCw,
  FiShield,
  FiList,
  FiArrowRight,
  FiActivity,
} from 'react-icons/fi';
import { MdDashboard, MdPeople, MdEventSeat } from 'react-icons/md';

export default function PresidentDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAPI.dashboard();
      setStats(res.data?.data ?? {});
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load association dashboard metrics';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const mem = stats?.membershipMetrics || {};
  const ev = stats?.eventMetrics || {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">
              <FiShield className="h-3.5 w-3.5" /> PRESIDENT PORTAL
            </span>
            <span className="text-xs text-slate-400">Skyline Student Association Hub</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            Executive Association Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time governance, student membership rosters, event oversight, and role delegation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/admin/approvals"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Review Applications
            <FiArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/admin/announcements"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
          >
            Announce to members
            <FiArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Operational Alert Banner */}
      {stats?.operationalAlerts > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-200 p-2 text-amber-800">
              <FiAlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">
                {stats.operationalAlerts} Pending Item{stats.operationalAlerts > 1 ? 's' : ''} Require Executive Action
              </p>
              <p className="text-xs text-amber-700">
                Includes pending membership applications ({mem.pending || 0}), event publication approvals ({stats.pendingApprovals || 0}), and refund requests ({stats.refundRequests || 0}).
              </p>
            </div>
          </div>
          <Link
            to="/admin/approvals"
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700"
          >
            Resolve Items
          </Link>
        </div>
      )}

      {/* Loading State */}
      {loading && !stats && (
        <div className="mt-12 flex flex-col items-center justify-center p-12 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-slate-500">Loading verified association metrics...</p>
        </div>
      )}

      {/* Error State */}
      {error && !stats && (
        <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-900">
          <FiAlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
          <p className="mt-2 text-base font-bold">Failed to load dashboard data</p>
          <p className="text-sm text-rose-700">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Dashboard Content */}
      {stats && (
        <>
          {/* Key Metric Cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Registered Accounts
                </span>
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                  <FiUsers className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-slate-900">
                {stats.totalRegisteredAccounts ?? (stats.totalUsers + stats.totalOrganizers)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {stats.totalUsers || 0} Students · {stats.totalOrganizers || 0} Club Organizers
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Active Club Members
                </span>
                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                  <FiCheckCircle className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-slate-900">
                {mem.active || 0}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {mem.approved || 0} Approved (Awaiting dues) · {mem.totalEnrolled || 0} Total Enrolled
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pending Applications
                </span>
                <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                  <FiClock className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-amber-600">
                {mem.pending || 0}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Awaiting presidential review & admission
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Published Events
                </span>
                <div className="rounded-xl bg-purple-50 p-2 text-purple-600">
                  <FiCalendar className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-3xl font-black text-slate-900">
                {ev.published || stats.activeEvents || 0}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {ev.upcoming || 0} Upcoming · {ev.confirmedBookings || 0} Confirmed Bookings
              </p>
            </div>
          </div>

          {/* Quick Management Hub */}
          <div className="mt-8">
            <h2 className="text-base font-bold text-slate-900">Executive Portals & Modules</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/admin/approvals"
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                      <FiList className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                      {(mem.pending || 0) + (stats.pendingApprovals || 0)} Pending
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">Membership Reviews</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Inspect student application statements, approve admission, or reject with notes.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:underline">
                  Open Reviews <FiArrowRight className="h-3 w-3" />
                </span>
              </Link>

              <Link
                to="/admin/roles"
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition">
                      <FiShield className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                      RBAC
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">Role Management</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Delegate or revoke ORGANIZER, TREASURER, and VOLUNTEER roles securely.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-violet-600 group-hover:underline">
                  Manage Roles <FiArrowRight className="h-3 w-3" />
                </span>
              </Link>

              <Link
                to="/admin/audit-logs"
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700 group-hover:bg-slate-800 group-hover:text-white transition">
                      <FiActivity className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                      Tamper-Resistant
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">Audit Logs</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Inspect immutable governance trails, administrative approvals, and role updates.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-slate-700 group-hover:underline">
                  View Audit Trail <FiArrowRight className="h-3 w-3" />
                </span>
              </Link>

              <Link
                to="/admin/certificates"
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                      <FiAward className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                      Credentials
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">Certificates</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Monitor issued achievement awards and cryptographically verifiable certificates.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-600 group-hover:underline">
                  Open Credentials <FiArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </div>
          </div>

          {/* Club Overview Breakdown */}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Membership Roster Breakdown */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <MdPeople className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-900">Association Membership Roster</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {mem.totalEnrolled || 0} Members
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-emerald-900">Active & Paid Members</span>
                  <span className="font-bold text-emerald-800">{mem.active || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-blue-900">Approved (Pending Dues Payment)</span>
                  <span className="font-bold text-blue-800">{mem.approved || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-amber-900">Under Executive Review</span>
                  <span className="font-bold text-amber-800">{mem.pending || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-rose-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-rose-900">Rejected Applications</span>
                  <span className="font-bold text-rose-800">{mem.rejected || 0}</span>
                </div>
                {mem.suspended > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2.5 text-sm">
                    <span className="font-semibold text-slate-800">Suspended Memberships</span>
                    <span className="font-bold text-slate-900">{mem.suspended}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Event Activity & Participation */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <MdEventSeat className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-900">Event Engagement & Bookings</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {stats.totalEvents || 0} Total Events
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-indigo-900">Confirmed Ticket Reservations</span>
                  <span className="font-bold text-indigo-800">{ev.confirmedBookings || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-teal-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-teal-900">Verified QR Check-Ins</span>
                  <span className="font-bold text-teal-800">{ev.presentAttendance || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-purple-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-purple-900">Published Active Events</span>
                  <span className="font-bold text-purple-800">{ev.published || stats.activeEvents || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-slate-700">Total Booking Volume</span>
                  <span className="font-bold text-slate-800">{ev.totalBookings || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
