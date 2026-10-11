import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { adminAPI } from '../../services/api';
import {
  FiActivity,
  FiSearch,
  FiRefreshCw,
  FiLock,
  FiFilter,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
} from 'react-icons/fi';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [targetFilter, setTargetFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.auditLogs({
        page,
        size: 15,
        search: search.trim() || undefined,
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
        targetType: targetFilter !== 'ALL' ? targetFilter : undefined,
      });
      const data = res.data?.data || {};
      setLogs(data.content || []);
      setTotalPages(data.totalPages || 1);
      setTotalElements(data.totalElements || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch audit log trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, targetFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    fetchLogs();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">
            <FiActivity className="h-3.5 w-3.5" /> GOVERNANCE AUDIT TRAIL
          </span>
          <span className="text-xs text-slate-400">Tamper-Resistant Journal</span>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
          System & Executive Audit Logs
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Chronological record of administrative approvals, role assignments, membership decisions, and dues settlements.
        </p>
      </div>

      {/* Immutability Notice */}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 shadow-sm">
        <FiLock className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <p className="font-bold text-slate-900">Append-Only Audit Security:</p>
          <p className="text-slate-600 mt-0.5">
            Audit logs are recorded systematically during sensitive operations and are immutable. Records cannot be edited, modified, or cleared through portal endpoints.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search details or action..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Actions</option>
            <option value="ROLE_ASSIGNED">ROLE_ASSIGNED</option>
            <option value="ROLE_REVOKED">ROLE_REVOKED</option>
            <option value="MEMBERSHIP_APPROVED">MEMBERSHIP_APPROVED</option>
            <option value="MEMBERSHIP_REJECTED">MEMBERSHIP_REJECTED</option>
            <option value="MEMBERSHIP_ACTIVATED">MEMBERSHIP_ACTIVATED</option>
            <option value="DUES_ASSESSED">DUES_ASSESSED</option>
            <option value="DUES_PAID">DUES_PAID</option>
            <option value="DUES_WAIVED">DUES_WAIVED</option>
            <option value="VOLUNTEER_TASK_CREATED">VOLUNTEER_TASK_CREATED</option>
            <option value="VOLUNTEER_TASK_UPDATED">VOLUNTEER_TASK_UPDATED</option>
          </select>

          <select
            value={targetFilter}
            onChange={(e) => {
              setTargetFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Targets</option>
            <option value="USER">USER</option>
            <option value="MEMBERSHIP">MEMBERSHIP</option>
            <option value="MEMBERSHIP_DUES">MEMBERSHIP_DUES</option>
            <option value="VOLUNTEER_TASK">VOLUNTEER_TASK</option>
            <option value="EVENT">EVENT</option>
          </select>

          <button
            onClick={() => {
              setPage(0);
              fetchLogs();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-5 py-3.5">Action</th>
                <th className="px-5 py-3.5">Actor</th>
                <th className="px-5 py-3.5">Target</th>
                <th className="px-5 py-3.5">Details / Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mr-2 align-middle" />
                    Loading audit records...
                  </td>
                </tr>
              )}

              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">
                    No audit records match the current filter.
                  </td>
                </tr>
              )}

              {!loading &&
                logs.map((log) => {
                  let badgeColor = 'bg-slate-100 text-slate-700';
                  if (log.action?.includes('APPROVE') || log.action?.includes('PAID') || log.action?.includes('ASSIGNED')) {
                    badgeColor = 'bg-emerald-100 text-emerald-800 font-bold';
                  } else if (log.action?.includes('REJECT') || log.action?.includes('REVOKE')) {
                    badgeColor = 'bg-rose-100 text-rose-800 font-bold';
                  } else if (log.action?.includes('WAIVED') || log.action?.includes('ASSESSED')) {
                    badgeColor = 'bg-amber-100 text-amber-800 font-bold';
                  }

                  return (
                    <tr key={log._id || log.id} className="hover:bg-slate-50/75 transition">
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <FiClock className="h-3 w-3 text-slate-400" />
                          {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold ${badgeColor}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">{log.actorType}</span>
                        {log.actorId && <span className="text-slate-400 ml-1">#{log.actorId}</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-700">
                        <span className="font-mono text-slate-600">{log.targetType}</span>
                        {log.targetId && <span className="text-slate-400 ml-1">#{log.targetId}</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 max-w-md truncate">
                        {log.details || '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-xs text-slate-500">
            Showing page <span className="font-bold">{page + 1}</span> of <span className="font-bold">{totalPages}</span> ({totalElements} total audit records)
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <FiChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <FiChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
