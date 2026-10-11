import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { adminAPI, roleAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  FiShield,
  FiSearch,
  FiUserCheck,
  FiUserMinus,
  FiRefreshCw,
  FiAlertCircle,
  FiLock,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';

export default function RoleManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [actionLoading, setActionLoading] = useState(null); // userId being updated

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.users({
        page,
        size: 10,
        search: search.trim() || undefined,
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
      });
      const data = res.data?.data || {};
      setUsers(data.content || []);
      setTotalPages(data.totalPages || 1);
      setTotalElements(data.totalElements || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch users for role management');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    fetchUsers();
  };

  const handleAssignRole = async (targetUserId, roleToAssign) => {
    if (targetUserId === currentUser?.id) {
      toast.error('Security policy: You cannot grant roles to yourself');
      return;
    }
    setActionLoading(targetUserId);
    try {
      const res = await roleAPI.assign({ userId: targetUserId, role: roleToAssign });
      toast.success(res.data?.message || `Successfully assigned ${roleToAssign} role`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to assign ${roleToAssign}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeRole = async (targetUserId, roleToRevoke) => {
    if (targetUserId === currentUser?.id) {
      toast.error('Security policy: You cannot revoke roles from yourself');
      return;
    }
    setActionLoading(targetUserId);
    try {
      const res = await roleAPI.revoke({ userId: targetUserId, role: roleToRevoke });
      toast.success(res.data?.message || `Successfully revoked ${roleToRevoke} role`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to revoke ${roleToRevoke}`);
    } finally {
      setActionLoading(null);
    }
  };

  const DELEGATABLE_ROLES = ['ORGANIZER', 'TREASURER', 'VOLUNTEER'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
            <FiShield className="h-3.5 w-3.5" /> ROLE GOVERNANCE
          </span>
          <span className="text-xs text-slate-400">President RBAC Delegation</span>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
          Role Delegation & Permissions
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage delegated association officer positions. Only the President can delegate or revoke Organizer, Treasurer, and Volunteer roles.
        </p>
      </div>

      {/* Security Notice */}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900 shadow-sm">
        <FiLock className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <p className="font-bold text-blue-950">Authoritative Backend RBAC Safeguards Active:</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-blue-800">
            <li>Only active, authorized Presidents may delegate or revoke roles.</li>
            <li>Delegated roles are limited to <strong>ORGANIZER</strong>, <strong>TREASURER</strong>, and <strong>VOLUNTEER</strong>.</li>
            <li>Self-delegation and self-revocation are strictly rejected by the server.</li>
            <li>Base STUDENT membership and separate Organizer collection identities remain preserved.</li>
          </ul>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or member number..."
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

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="STUDENT">Student Only</option>
            <option value="ORGANIZER">Organizer</option>
            <option value="TREASURER">Treasurer</option>
            <option value="VOLUNTEER">Volunteer</option>
            <option value="PRESIDENT">President</option>
          </select>

          <button
            onClick={() => {
              setPage(0);
              fetchUsers();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Member / User</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Current Roles</th>
                <th className="px-5 py-3.5">Account Status</th>
                <th className="px-5 py-3.5 text-right">Role Delegation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mr-2 align-middle" />
                    Loading user records...
                  </td>
                </tr>
              )}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">
                    No users found matching query.
                  </td>
                </tr>
              )}

              {!loading &&
                users.map((u) => {
                  const userRoles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role || 'STUDENT'];
                  const isCurrent = u.id === currentUser?.id;
                  const isPresident = userRoles.includes('PRESIDENT') || u.role === 'ADMIN';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/75 transition">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900">{u.name || 'User'}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-bold text-teal-800">
                            {u.memberNumber || `ID: ${u.id}`}
                          </span>
                          {isCurrent && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                              (You)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{u.email}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.map((r) => {
                            let badgeStyle = 'bg-slate-100 text-slate-700';
                            if (r === 'PRESIDENT' || r === 'ADMIN') badgeStyle = 'bg-indigo-100 text-indigo-800 font-bold';
                            else if (r === 'TREASURER') badgeStyle = 'bg-emerald-100 text-emerald-800 font-bold';
                            else if (r === 'ORGANIZER') badgeStyle = 'bg-rose-100 text-rose-800 font-bold';
                            else if (r === 'VOLUNTEER') badgeStyle = 'bg-amber-100 text-amber-800 font-bold';
                            return (
                              <span
                                key={r}
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}
                              >
                                {r}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {u.accountLocked ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                            <FiAlertCircle className="h-3.5 w-3.5" /> Locked
                          </span>
                        ) : u.isEmailVerified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <FiCheck className="h-3.5 w-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Unverified</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {isCurrent ? (
                          <span className="text-xs italic text-slate-400">Self-edit forbidden</span>
                        ) : isPresident ? (
                          <span className="text-xs font-semibold text-indigo-600">President Account</span>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {DELEGATABLE_ROLES.map((role) => {
                              const hasRole = userRoles.includes(role);
                              return hasRole ? (
                                <button
                                  key={role}
                                  onClick={() => handleRevokeRole(u.id, role)}
                                  disabled={actionLoading === u.id}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                                  title={`Revoke ${role} role`}
                                >
                                  <FiUserMinus className="h-3 w-3" /> Revoke {role}
                                </button>
                              ) : (
                                <button
                                  key={role}
                                  onClick={() => handleAssignRole(u.id, role)}
                                  disabled={actionLoading === u.id}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                                  title={`Grant ${role} role`}
                                >
                                  <FiUserCheck className="h-3 w-3" /> +{role}
                                </button>
                              );
                            })}
                          </div>
                        )}
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
            Showing page <span className="font-bold">{page + 1}</span> of <span className="font-bold">{totalPages}</span> ({totalElements} total users)
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
