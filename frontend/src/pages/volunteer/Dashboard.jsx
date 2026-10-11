import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { volunteerAPI } from '../../services/api';
import {
  FiCheckCircle,
  FiClock,
  FiPlay,
  FiCalendar,
  FiRefreshCw,
  FiList,
  FiMapPin,
  FiAward,
  FiAlertCircle,
  FiInfo,
  FiCheckSquare,
  FiPlus,
  FiCreditCard,
  FiHeart,
  FiUser,
  FiStar,
  FiUploadCloud,
  FiExternalLink,
  FiTrendingUp,
  FiShield,
  FiXCircle,
  FiLayers,
} from 'react-icons/fi';
import { MdHandshake, MdEventAvailable, MdAssignment, MdQrCode2, MdRecommend } from 'react-icons/md';

export default function VolunteerDashboard() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'tasks' | 'opportunities' | 'contributions' | 'reimbursements' | 'digitalId' | 'profile'

  // Tasks state
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Submit Evidence & Review modal
  const [evidenceModalTask, setEvidenceModalTask] = useState(null);
  const [evidenceForm, setEvidenceForm] = useState({
    completionNotes: '',
    evidenceNotes: '',
    evidenceUrl: '',
  });
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false);

  // Opportunities & Applications state
  const [opportunities, setOpportunities] = useState([]);
  const [smartMatches, setSmartMatches] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [oppLoading, setOppLoading] = useState(false);
  const [applyingEvent, setApplyingEvent] = useState(null);
  const [applyForm, setApplyForm] = useState({ category: 'GENERAL', notes: '' });
  const [applySubmitting, setApplySubmitting] = useState(false);

  // Contributions & Attendance state
  const [contributions, setContributions] = useState(null);
  const [contribLoading, setContribLoading] = useState(false);

  // Digital ID state
  const [digitalId, setDigitalId] = useState(null);
  const [idLoading, setIdLoading] = useState(false);

  // Reimbursements state
  const [myClaims, setMyClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimForm, setClaimForm] = useState({
    amount: '',
    category: 'SUPPLIES',
    description: '',
    receiptUrl: '',
  });
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);

  // Profile & Availability state
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    organizationName: '',
    city: '',
    interests: '',
    skills: '',
    availability: 'FLEXIBLE',
    experience: '',
  });
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  // Active sub-tab for opportunities: 'browse' | 'smart' | 'applications'
  const [oppSubTab, setOppSubTab] = useState('browse');

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await volunteerAPI.getOverview();
      setOverview(res.data?.data || {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load volunteer dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await volunteerAPI.getMyTasks({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setTasks(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load assigned tasks');
    } finally {
      setTasksLoading(false);
    }
  };

  const fetchOpportunitiesData = async () => {
    setOppLoading(true);
    try {
      const [oppRes, matchRes, appRes] = await Promise.all([
        volunteerAPI.getOpportunities(),
        volunteerAPI.getSmartMatches(),
        volunteerAPI.getMyApplications(),
      ]);
      setOpportunities(oppRes.data?.data || []);
      setSmartMatches(matchRes.data?.data || []);
      setMyApplications(appRes.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load opportunities');
    } finally {
      setOppLoading(false);
    }
  };

  const fetchContributions = async () => {
    setContribLoading(true);
    try {
      const res = await volunteerAPI.getContributions();
      setContributions(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load contribution records');
    } finally {
      setContribLoading(false);
    }
  };

  const fetchDigitalId = async () => {
    setIdLoading(true);
    try {
      const res = await volunteerAPI.getDigitalId();
      setDigitalId(res.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load digital ID');
    } finally {
      setIdLoading(false);
    }
  };

  const fetchReimbursements = async () => {
    setClaimsLoading(true);
    try {
      const res = await volunteerAPI.getReimbursements();
      setMyClaims(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load reimbursements');
    } finally {
      setClaimsLoading(false);
    }
  };

  const fetchProfile = async () => {
    setProfileLoading(true);
    try {
      const res = await volunteerAPI.getProfile();
      const p = res.data?.data || {};
      setProfileData(p);
      setProfileForm({
        name: p.name || '',
        phone: p.phone || '',
        organizationName: p.organizationName || '',
        city: p.city || '',
        interests: p.interests || '',
        skills: p.skills || '',
        availability: p.availability || 'FLEXIBLE',
        experience: p.experience || '',
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load volunteer profile');
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    if (activeTab === 'tasks') fetchTasks();
    else if (activeTab === 'opportunities') fetchOpportunitiesData();
    else if (activeTab === 'contributions') fetchContributions();
    else if (activeTab === 'reimbursements') fetchReimbursements();
    else if (activeTab === 'digitalId') fetchDigitalId();
    else if (activeTab === 'profile') fetchProfile();
  }, [activeTab, statusFilter]);

  // Handle task status transitions
  const handleUpdateStatus = async (taskId, nextStatus) => {
    try {
      await volunteerAPI.updateTaskStatus(taskId, { status: nextStatus });
      toast.success(`Task status updated to ${nextStatus.replace(/_/g, ' ')}`);
      fetchTasks();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update task status');
    }
  };

  // Submit Evidence & Review
  const handleSubmitEvidence = async (e) => {
    e.preventDefault();
    if (!evidenceModalTask) return;
    setEvidenceSubmitting(true);
    try {
      await volunteerAPI.updateTaskStatus(evidenceModalTask.id, {
        status: 'SUBMITTED_FOR_REVIEW',
        completionNotes: evidenceForm.completionNotes,
        evidenceNotes: evidenceForm.evidenceNotes,
        evidenceUrl: evidenceForm.evidenceUrl,
      });
      toast.success('Task submitted for organizer verification!');
      setEvidenceModalTask(null);
      setEvidenceForm({ completionNotes: '', evidenceNotes: '', evidenceUrl: '' });
      fetchTasks();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit task evidence');
    } finally {
      setEvidenceSubmitting(false);
    }
  };

  // Apply for opportunity
  const handleApplyOpportunity = async (e) => {
    e.preventDefault();
    if (!applyingEvent) return;
    setApplySubmitting(true);
    try {
      await volunteerAPI.applyOpportunity(applyingEvent.id, {
        category: applyForm.category,
        notes: applyForm.notes,
      });
      toast.success('Volunteer application submitted for organizer review!');
      setApplyingEvent(null);
      setApplyForm({ category: 'GENERAL', notes: '' });
      fetchOpportunitiesData();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Application failed');
    } finally {
      setApplySubmitting(false);
    }
  };

  // Withdraw application
  const handleWithdrawApplication = async (appId) => {
    try {
      await volunteerAPI.withdrawApplication(appId);
      toast.info('Application withdrawn');
      fetchOpportunitiesData();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to withdraw application');
    }
  };

  // Submit reimbursement claim
  const handleSubmitClaim = async (e) => {
    e.preventDefault();
    setClaimSubmitting(true);
    try {
      let receiptUrl = null;
      if (receiptFile) {
        const uploadRes = await volunteerAPI.uploadReimbursementReceipt(receiptFile);
        receiptUrl = uploadRes.data?.data?.receiptUrl;
        if (!receiptUrl) throw new Error('Receipt upload did not return a file link.');
      }
      await volunteerAPI.submitReimbursement({
        amount: Number(claimForm.amount),
        category: claimForm.category,
        description: claimForm.description,
        receiptUrl,
      });
      toast.success('Reimbursement claim submitted to Treasury for review');
      setShowClaimModal(false);
      setClaimForm({ amount: '', category: 'SUPPLIES', description: '', receiptUrl: '' });
      setReceiptFile(null);
      fetchReimbursements();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit reimbursement claim');
    } finally {
      setClaimSubmitting(false);
    }
  };

  // Update volunteer profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSubmitting(true);
    try {
      await volunteerAPI.updateProfile(profileForm);
      toast.success('Volunteer profile and availability preferences updated');
      setProfileEditing(false);
      fetchProfile();
      fetchOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const sum = overview?.summary || {};
  const profile = overview?.profile || {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              <MdHandshake className="h-3.5 w-3.5" /> VOLUNTEER PORTAL
            </span>
            <span className="text-xs text-slate-400">Skyline Student Association Hub</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
            Welcome, {profile.name || 'Student Volunteer'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Member ID: <span className="font-mono font-bold text-slate-900">{profile.memberNumber || profile.userCode || 'Active'}</span> · Service Department: <span className="font-semibold text-slate-800">{profile.department || 'Campus Activities'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchOverview();
              if (activeTab === 'tasks') fetchTasks();
              else if (activeTab === 'opportunities') fetchOpportunitiesData();
              else if (activeTab === 'contributions') fetchContributions();
              else if (activeTab === 'reimbursements') fetchReimbursements();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <FiRefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Assigned Tasks
            </span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <MdAssignment className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{sum.totalTasks ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">
            {sum.inProgressTasks ?? 0} In Progress · {sum.pendingTasks ?? 0} Pending
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Completed Tasks
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <FiCheckCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-emerald-700">{sum.completedTasks ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Verified task fulfillment</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Contribution XP
            </span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <FiStar className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-amber-700">{sum.contributionScore ?? 0} pts</p>
          <p className="mt-1 text-xs text-slate-500">Official Level {sum.currentLevel ?? 1} Volunteer</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Verified Attendance
            </span>
            <div className="rounded-xl bg-teal-50 p-2 text-teal-600">
              <MdEventAvailable className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-teal-700">{sum.verifiedAttendanceCount ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Scanned event check-ins</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Reimbursements
            </span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <FiCreditCard className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-black text-indigo-700">₹{sum.reimbursements?.totalAmount ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">
            {sum.reimbursements?.approvedCount ?? 0} approved · {sum.reimbursements?.pendingCount ?? 0} under review
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'overview'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiLayers className="h-4 w-4" /> Overview
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'tasks'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiCheckSquare className="h-4 w-4" /> Assigned Tasks ({sum.totalTasks ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('opportunities')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'opportunities'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MdRecommend className="h-4 w-4" /> Opportunities & Matching
        </button>
        <button
          onClick={() => setActiveTab('contributions')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'contributions'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiAward className="h-4 w-4" /> Contributions & History
        </button>
        <button
          onClick={() => setActiveTab('reimbursements')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'reimbursements'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiCreditCard className="h-4 w-4" /> Reimbursements
        </button>
        <button
          onClick={() => setActiveTab('digitalId')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'digitalId'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MdQrCode2 className="h-4 w-4" /> Digital Volunteer Pass
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
            activeTab === 'profile'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiUser className="h-4 w-4" /> Profile & Availability
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-6">
          {/* Live Announcements Banner */}
          {overview?.recentAnnouncements?.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <FiInfo className="h-4 w-4 text-amber-600" />
                Live Event Broadcasts & Operational Announcements
              </div>
              <div className="mt-3 divide-y divide-amber-200/60">
                {overview.recentAnnouncements.map((ann, idx) => (
                  <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                    <span className="font-semibold text-xs text-amber-950">[{ann.eventTitle}]</span>{' '}
                    <span className="text-xs text-amber-900">{ann.message}</span>
                    <span className="ml-2 text-[10px] text-amber-600">
                      {new Date(ann.postedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Schedule Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming Event Duties */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FiCalendar className="text-indigo-600" /> Upcoming Campus Event Duties
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Rostered association events requiring verified volunteer coordination.
              </p>

              <div className="mt-4 divide-y divide-slate-100">
                {(!overview?.upcomingDuties || overview.upcomingDuties.length === 0) ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    No upcoming campus duties scheduled right now.
                  </p>
                ) : (
                  overview.upcomingDuties.map((duty) => (
                    <div key={duty.id} className="py-3 flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{duty.title}</h4>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          <span>{new Date(duty.startDate).toLocaleDateString()}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <FiMapPin className="h-3 w-3 text-slate-400" /> {duty.location}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        Scheduled
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Assigned Tasks */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MdAssignment className="text-amber-600" /> Recent Assigned Tasks
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Your most recent duties and status.</p>
                </div>
                <button
                  onClick={() => setActiveTab('tasks')}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700"
                >
                  View All &rarr;
                </button>
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {(!overview?.recentTasks || overview.recentTasks.length === 0) ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    No tasks assigned yet. Browse opportunities to volunteer!
                  </p>
                ) : (
                  overview.recentTasks.map((t) => (
                    <div key={t.id} className="py-3 flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{t.title}</h4>
                        <p className="text-xs text-slate-500">
                          {t.event?.title ? `Event: ${t.event.title}` : 'General Duty'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          t.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800'
                            : t.status === 'SUBMITTED_FOR_REVIEW'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ASSIGNED TASKS */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Filter Lifecycle Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending (Assigned)</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="SUBMITTED_FOR_REVIEW">Submitted For Review</option>
                <option value="COMPLETED">Completed & Verified</option>
              </select>
            </div>
          </div>

          {tasksLoading && (
            <div className="p-12 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2 align-middle" />
              Loading tasks...
            </div>
          )}

          {!tasksLoading && tasks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              <MdAssignment className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="font-bold text-slate-700">No Volunteer Tasks Found</p>
              <p className="text-xs text-slate-500 mt-1">
                You do not have any tasks matching the current filter.
              </p>
            </div>
          )}

          {!tasksLoading && tasks.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((task) => {
                let statusBadge = 'bg-slate-100 text-slate-700';
                if (task.status === 'PENDING') statusBadge = 'bg-amber-100 text-amber-800 font-bold';
                else if (task.status === 'ACCEPTED') statusBadge = 'bg-sky-100 text-sky-800 font-bold';
                else if (task.status === 'IN_PROGRESS') statusBadge = 'bg-blue-100 text-blue-800 font-bold';
                else if (task.status === 'SUBMITTED_FOR_REVIEW') statusBadge = 'bg-purple-100 text-purple-800 font-bold';
                else if (task.status === 'COMPLETED') statusBadge = 'bg-emerald-100 text-emerald-800 font-bold';

                let priorityBadge = 'bg-slate-100 text-slate-600';
                if (task.priority === 'HIGH' || task.priority === 'URGENT')
                  priorityBadge = 'bg-rose-100 text-rose-800 font-bold';

                return (
                  <div
                    key={task.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs ${statusBadge}`}>
                          {task.status.replace(/_/g, ' ')}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-[11px] ${priorityBadge}`}>
                          {task.priority} Priority
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-bold text-slate-900">{task.title}</h3>

                      {task.description && (
                        <p className="mt-1 text-xs text-slate-600 line-clamp-3">{task.description}</p>
                      )}

                      {task.event && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <FiCalendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">Event: {task.event.title}</span>
                        </div>
                      )}

                      {task.dueDate && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <FiClock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                        </div>
                      )}

                      {task.evidenceUrl && (
                        <div className="mt-2 text-xs text-blue-600 flex items-center gap-1 truncate">
                          <FiExternalLink className="h-3 w-3 shrink-0" />
                          <a href={task.evidenceUrl} target="_blank" rel="noreferrer" className="underline truncate">
                            Evidence Attachment
                          </a>
                        </div>
                      )}

                      {task.completionNotes && (
                        <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-800 border border-slate-200">
                          <p className="font-bold text-[10px] uppercase tracking-wider text-slate-600">
                            Notes & Evidence Log:
                          </p>
                          <p className="mt-0.5">{task.completionNotes}</p>
                        </div>
                      )}

                      {task.pointsAwarded > 0 && (
                        <div className="mt-2 text-xs font-bold text-emerald-700 flex items-center gap-1">
                          <FiStar className="h-3.5 w-3.5 text-amber-500" />
                          Earned {task.pointsAwarded} official contribution points
                        </div>
                      )}
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-end gap-2">
                      {task.status === 'PENDING' && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'ACCEPTED')}
                          className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                        >
                          <FiCheckCircle className="h-3 w-3" /> Accept Task
                        </button>
                      )}

                      {(task.status === 'PENDING' || task.status === 'ACCEPTED') && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'IN_PROGRESS')}
                          className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <FiPlay className="h-3 w-3" /> Start Duty
                        </button>
                      )}

                      {task.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => {
                            setEvidenceModalTask(task);
                            setEvidenceForm({
                              completionNotes: task.completionNotes || '',
                              evidenceNotes: task.evidenceNotes || '',
                              evidenceUrl: task.evidenceUrl || '',
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
                        >
                          <FiUploadCloud className="h-3 w-3" /> Submit For Review
                        </button>
                      )}

                      {task.status === 'SUBMITTED_FOR_REVIEW' && (
                        <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                          <FiClock className="h-3.5 w-3.5" /> Awaiting Organizer Verification
                        </span>
                      )}

                      {task.status === 'COMPLETED' && (
                        <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                          <FiCheckCircle className="h-3.5 w-3.5" /> Verified Complete
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: OPPORTUNITIES & SMART MATCHING */}
      {/* ========================================================================= */}
      {activeTab === 'opportunities' && (
        <div className="mt-6 space-y-6">
          {/* Sub Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setOppSubTab('browse')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                oppSubTab === 'browse'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Browse All Opportunities ({opportunities.length})
            </button>
            <button
              onClick={() => setOppSubTab('smart')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1 ${
                oppSubTab === 'smart'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MdRecommend className="h-4 w-4" /> Smart Recommendations ({smartMatches.length})
            </button>
            <button
              onClick={() => setOppSubTab('applications')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                oppSubTab === 'applications'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              My Applications ({myApplications.length})
            </button>
          </div>

          {oppLoading && (
            <div className="p-12 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2 align-middle" />
              Loading opportunities and smart recommendations...
            </div>
          )}

          {/* SUB-TAB 1: BROWSE ALL */}
          {!oppLoading && oppSubTab === 'browse' && (
            <div>
              {opportunities.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                  <FiCalendar className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                  <p className="font-bold text-slate-700">No Eligible Events Open for Volunteering</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Check back when organizers publish new events with volunteer quotas.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {opportunities.map((opp) => {
                    const isFull = opp.remainingCapacity <= 0;
                    return (
                      <div
                        key={opp.id}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                isFull
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isFull ? 'Capacity Full' : `${opp.remainingCapacity} Spots Remaining`}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              Cap: {opp.volunteerCapacity}
                            </span>
                          </div>

                          <h3 className="mt-3 text-base font-bold text-slate-900">{opp.title}</h3>
                          <p className="mt-1 text-xs text-slate-600 line-clamp-2">{opp.description}</p>

                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <FiCalendar className="h-3.5 w-3.5 text-indigo-500" />
                              <span>{new Date(opp.startDate).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FiMapPin className="h-3.5 w-3.5 text-slate-400" />
                              <span className="truncate">{opp.location}</span>
                            </div>
                          </div>

                          {opp.volunteerCategories?.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {opp.volunteerCategories.map((c, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-5 border-t border-slate-100 pt-3">
                          {opp.isOrganizer ? (
                            <span className="text-xs text-slate-400 italic">
                              You are the organizer of this event
                            </span>
                          ) : opp.myApplication ? (
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700">
                                Status: <strong className="text-amber-700">{opp.myApplication.status}</strong>
                              </span>
                              {opp.myApplication.status === 'PENDING' && (
                                <button
                                  onClick={() => handleWithdrawApplication(opp.myApplication.id)}
                                  className="text-rose-600 hover:underline font-bold text-[11px]"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              disabled={isFull}
                              onClick={() => {
                                setApplyingEvent(opp);
                                setApplyForm({
                                  category: opp.volunteerCategories?.[0] || 'GENERAL',
                                  notes: '',
                                });
                              }}
                              className="w-full rounded-xl bg-amber-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                            >
                              {isFull ? 'Spots Filled' : 'Apply For Role'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: SMART MATCHING RECOMMENDATIONS */}
          {!oppLoading && oppSubTab === 'smart' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                  <FiTrendingUp className="h-4 w-4 text-indigo-600" />
                  Transparent Rule-Based Smart Recommendation Engine
                </div>
                <p className="mt-1 text-xs text-indigo-700">
                  Matches are evaluated against your profile: Interests (40%), Skills (30%), Availability (20%), and Verified Experience (10%). Matching never automatically assigns or overrides organizer approval.
                </p>
              </div>

              {smartMatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                  <p className="font-bold text-slate-700">No Matching Opportunities Right Now</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Update your interests and skills in the Profile tab to improve recommendations.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {smartMatches.map((m, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm truncate">
                          {m.event.title}
                        </span>
                        <div className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-800 shrink-0">
                          <FiStar className="h-3 w-3" /> {m.matchScore}% Match
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-2.5 rounded-xl text-[11px]">
                        <div>
                          <p className="text-slate-400">Interest</p>
                          <p className="font-bold text-slate-900">{m.breakdown.interestMatch}/40</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Skills</p>
                          <p className="font-bold text-slate-900">{m.breakdown.skillsMatch}/30</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Schedule</p>
                          <p className="font-bold text-slate-900">{m.breakdown.availabilityMatch}/20</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Experience</p>
                          <p className="font-bold text-slate-900">{m.breakdown.experienceMatch}/10</p>
                        </div>
                      </div>

                      {m.matchedReasons?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-emerald-800">Why this fits you:</p>
                          {m.matchedReasons.map((r, i) => (
                            <p key={i} className="text-xs text-emerald-700 flex items-center gap-1.5">
                              <FiCheckCircle className="h-3 w-3 shrink-0" /> {r}
                            </p>
                          ))}
                        </div>
                      )}

                      {m.missingReasons?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-amber-800">Missing / Unmatched:</p>
                          {m.missingReasons.map((r, i) => (
                            <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5">
                              <FiInfo className="h-3 w-3 shrink-0" /> {r}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {m.event.remainingCapacity} spots left
                        </span>
                        <button
                          onClick={() => {
                            setApplyingEvent(m.event);
                            setApplyForm({
                              category: m.event.volunteerCategories?.[0] || 'GENERAL',
                              notes: `Matched via Smart Recommendation (${m.matchScore}%)`,
                            });
                          }}
                          className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                        >
                          Apply Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: MY APPLICATIONS */}
          {!oppLoading && oppSubTab === 'applications' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900 mb-3">Submitted Opportunity Applications</h4>
              {myApplications.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  You have not applied for any volunteer roles yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-700">
                      <tr>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Submitted</th>
                        <th className="px-3 py-2">Reviewer Feedback</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myApplications.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 font-bold text-slate-900">
                            {app.event?.title || 'Event'}
                          </td>
                          <td className="px-3 py-2">{app.category}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                app.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : app.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : app.status === 'WITHDRAWN'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {app.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">{new Date(app.createdAt).toLocaleDateString()}</td>
                          <td className="px-3 py-2 text-slate-500">{app.reviewNotes || '—'}</td>
                          <td className="px-3 py-2 text-right">
                            {app.status === 'PENDING' && (
                              <button
                                onClick={() => handleWithdrawApplication(app.id)}
                                className="text-rose-600 hover:underline font-bold text-[11px]"
                              >
                                Withdraw
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CONTRIBUTIONS & ATTENDANCE */}
      {/* ========================================================================= */}
      {activeTab === 'contributions' && (
        <div className="mt-6 space-y-6">
          {contribLoading && (
            <div className="p-12 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2 align-middle" />
              Loading verified records...
            </div>
          )}

          {!contribLoading && contributions && (
            <>
              {/* Points Banner */}
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Association Verified Contribution Record
                  </span>
                  <h3 className="text-2xl font-black text-amber-950 mt-1">
                    {contributions.totalPoints} Contribution Points Earned
                  </h3>
                  <p className="text-xs text-amber-900 mt-0.5">
                    Official Level {contributions.currentLevel} Volunteer · Points are awarded exclusively upon organizer verification.
                  </p>
                </div>
                <div className="flex items-center gap-3 bg-white/80 p-3 rounded-2xl border border-amber-200/60 shadow-xs">
                  <div className="text-center px-3 border-r border-amber-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Task Points</p>
                    <p className="font-bold text-slate-900 text-sm">{contributions.pointsBreakdown?.taskVerificationPoints ?? 0}</p>
                  </div>
                  <div className="text-center px-3 border-r border-amber-200">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Attendance</p>
                    <p className="font-bold text-slate-900 text-sm">{contributions.pointsBreakdown?.attendancePoints ?? 0}</p>
                  </div>
                  <div className="text-center px-3">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Badges Bonus</p>
                    <p className="font-bold text-slate-900 text-sm">{contributions.pointsBreakdown?.badgesBonus ?? 0}</p>
                  </div>
                </div>
              </div>

              {/* Verified Tasks & Attendance Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Verified Tasks */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                    <FiCheckCircle className="text-emerald-600" /> Verified Task Fulfillment History
                  </h4>
                  {contributions.completedTasks?.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">
                      No verified completed tasks recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {contributions.completedTasks.map((t) => (
                        <div key={t.id} className="py-3 flex items-center justify-between gap-2">
                          <div>
                            <h5 className="font-bold text-slate-900 text-xs">{t.title}</h5>
                            <p className="text-[11px] text-slate-500">
                              {t.event?.title || 'Campus Duty'} · Completed: {new Date(t.completedAt || t.updatedAt).toLocaleDateString()}
                            </p>
                            {t.completionNotes && (
                              <p className="text-[11px] text-slate-600 mt-0.5 italic">"{t.completionNotes}"</p>
                            )}
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            +{t.pointsAwarded || 50} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Verified Attendance */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                    <MdEventAvailable className="text-teal-600" /> Scanned Event Attendance History
                  </h4>
                  {contributions.verifiedAttendance?.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">
                      No verified attendance check-ins recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {contributions.verifiedAttendance.map((a, i) => (
                        <div key={i} className="py-3 flex items-center justify-between gap-2">
                          <div>
                            <h5 className="font-bold text-slate-900 text-xs">{a.eventName}</h5>
                            <p className="text-[11px] text-slate-500">
                              {new Date(a.checkInTime).toLocaleDateString()} at {new Date(a.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className="font-mono text-[10px] text-slate-400">Tkt: {a.ticketId}</span>
                          </div>
                          <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-800">
                            Present
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: REIMBURSEMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'reimbursements' && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <div>
              <h3 className="text-base font-bold text-slate-900">Volunteer Expense Reimbursements</h3>
              <p className="text-xs text-slate-500">
                Submit out-of-pocket receipts for materials, food, logistics or travel. All claims are securely routed to Treasury for review.
              </p>
            </div>
            <button
              onClick={() => setShowClaimModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
            >
              <FiPlus className="h-4 w-4" /> New Claim
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md">
            <h4 className="text-sm font-bold text-slate-900 mb-3">My Submitted Claims</h4>
            {claimsLoading ? (
              <p className="py-6 text-center text-xs text-slate-500">Loading claims...</p>
            ) : myClaims.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No reimbursement claims submitted yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Claim #</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Rejection Reason / Notes</th>
                      <th className="px-3 py-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myClaims.map((clm) => (
                      <tr key={clm.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-mono font-bold text-slate-900">
                          {clm.claimNumber}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{clm.category}</td>
                        <td className="px-3 py-2">{clm.description}</td>
                        <td className="px-3 py-2 font-bold text-slate-900">₹{clm.amount}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              clm.status === 'PAID'
                                ? 'bg-blue-100 text-blue-800'
                                : clm.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : clm.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {clm.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-rose-600 font-medium">
                          {clm.rejectionReason || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {clm.receiptUrl ? (
                            <a
                              href={clm.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline flex items-center gap-1"
                            >
                              <FiExternalLink className="h-3 w-3" /> View
                            </a>
                          ) : (
                            'None'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: DIGITAL ID / VOLUNTEER PASS */}
      {/* ========================================================================= */}
      {activeTab === 'digitalId' && (
        <div className="mt-6 flex justify-center">
          {idLoading && (
            <div className="p-12 text-center text-slate-500">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2 align-middle" />
              Loading Digital Volunteer Pass...
            </div>
          )}

          {!idLoading && digitalId && (
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Skyline Student Association
                  </p>
                  <h3 className="text-lg font-black text-white">Official Volunteer Credential</h3>
                </div>
                <div className="rounded-xl bg-amber-500/20 p-2 text-amber-400">
                  <FiShield className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center text-center">
                <div className="rounded-2xl bg-white p-4 shadow-inner">
                  {/* Safe QR representation */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                      digitalId.qrPayload
                    )}`}
                    alt="Digital Pass QR"
                    className="h-36 w-36"
                  />
                </div>
                <p className="mt-2 font-mono text-[11px] text-slate-400">{digitalId.qrPayload}</p>
                <p className="text-[10px] text-emerald-400 mt-1">
                  ✓ Verified Public Credential (Token-Free & Safe)
                </p>
              </div>

              <div className="mt-6 space-y-2 border-t border-slate-800 pt-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Full Name</span>
                  <span className="font-bold text-white">{digitalId.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Member ID</span>
                  <span className="font-mono font-bold text-amber-400">{digitalId.memberNumber || digitalId.userCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Service Roles</span>
                  <span className="font-semibold text-white">VOLUNTEER · STUDENT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Department</span>
                  <span className="text-white">{digitalId.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Valid Term</span>
                  <span className="font-semibold text-slate-300">{digitalId.validAcademicTerm}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: PROFILE & AVAILABILITY */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="mt-6 max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Volunteer Profile & Scheduling Availability</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Keep your skills, interests and availability current to improve smart matching recommendations.
              </p>
            </div>
            {!profileEditing && (
              <button
                onClick={() => setProfileEditing(true)}
                className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Edit Preferences
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700">Full Name</label>
                <input
                  type="text"
                  disabled={!profileEditing}
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Contact Phone</label>
                <input
                  type="text"
                  disabled={!profileEditing}
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700">Scheduling Availability</label>
                <select
                  disabled={!profileEditing}
                  value={profileForm.availability}
                  onChange={(e) => setProfileForm({ ...profileForm, availability: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
                >
                  <option value="FLEXIBLE">FLEXIBLE (Weekdays & Weekends)</option>
                  <option value="WEEKENDS">WEEKENDS ONLY</option>
                  <option value="WEEKDAYS">WEEKDAYS ONLY</option>
                  <option value="EVENINGS">EVENINGS ONLY</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Campus / College</label>
                <input
                  type="text"
                  disabled={!profileEditing}
                  value={profileForm.organizationName}
                  onChange={(e) => setProfileForm({ ...profileForm, organizationName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Interests (comma-separated e.g. Coding, Robotics, Cultural Festivals, Sports)
              </label>
              <input
                type="text"
                disabled={!profileEditing}
                value={profileForm.interests}
                onChange={(e) => setProfileForm({ ...profileForm, interests: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Skills & Specialties (e.g. Stage Management, Registration, First Aid, Sound, Photography)
              </label>
              <input
                type="text"
                disabled={!profileEditing}
                value={profileForm.skills}
                onChange={(e) => setProfileForm({ ...profileForm, skills: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Prior Volunteering Experience & Notes
              </label>
              <textarea
                rows="2"
                disabled={!profileEditing}
                value={profileForm.experience}
                onChange={(e) => setProfileForm({ ...profileForm, experience: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs disabled:bg-slate-50"
              />
            </div>

            {/* Read-only privileged fields indicator */}
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border border-slate-200">
              <span className="font-bold text-slate-700">Immutable Official Records:</span> Roles (VOLUNTEER), Member Number, and Official Contribution Scores cannot be altered directly.
            </div>

            {profileEditing && (
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProfileEditing(false)}
                  className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSubmitting}
                  className="rounded-xl bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {profileSubmitting ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* APPLY FOR OPPORTUNITY MODAL */}
      {applyingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Apply For Volunteer Role: {applyingEvent.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select category and submit your motivation for organizer review.
            </p>

            <form onSubmit={handleApplyOpportunity} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Volunteer Category</label>
                <select
                  value={applyForm.category}
                  onChange={(e) => setApplyForm({ ...applyForm, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                >
                  {applyingEvent.volunteerCategories?.length > 0 ? (
                    applyingEvent.volunteerCategories.map((c, i) => (
                      <option key={i} value={c}>
                        {c}
                      </option>
                    ))
                  ) : (
                    <option value="GENERAL">GENERAL LOGISTICS</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Application Notes / Experience</label>
                <textarea
                  rows="3"
                  value={applyForm.notes}
                  onChange={(e) => setApplyForm({ ...applyForm, notes: e.target.value })}
                  placeholder="Explain your relevant skills or prior volunteering for this role..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApplyingEvent(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applySubmitting}
                  className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {applySubmitting ? 'Submitting...' : 'Confirm Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBMIT EVIDENCE / REVIEW MODAL */}
      {evidenceModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Submit Evidence For Review: {evidenceModalTask.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Provide your completion notes and proof link. The Organizer will verify and award contribution points.
            </p>

            <form onSubmit={handleSubmitEvidence} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Completion Summary</label>
                <textarea
                  rows="2"
                  required
                  value={evidenceForm.completionNotes}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, completionNotes: e.target.value })}
                  placeholder="e.g. Set up 3 check-in stations, distributed badges..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Detailed Evidence Notes (optional)</label>
                <textarea
                  rows="2"
                  value={evidenceForm.evidenceNotes}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, evidenceNotes: e.target.value })}
                  placeholder="Specific details for the organizer..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Evidence Link / Drive URL (optional)</label>
                <input
                  type="url"
                  value={evidenceForm.evidenceUrl}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, evidenceUrl: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEvidenceModalTask(null)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={evidenceSubmitting}
                  className="rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {evidenceSubmitting ? 'Submitting...' : 'Submit Evidence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUBMIT REIMBURSEMENT CLAIM MODAL */}
      {showClaimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Submit Volunteer Expense Claim</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Claims are audited and disbursed directly by the Association Treasury.
            </p>
            <form onSubmit={handleSubmitClaim} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Amount (INR)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={claimForm.amount}
                  onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })}
                  placeholder="e.g. 750"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Category</label>
                <select
                  value={claimForm.category}
                  onChange={(e) => setClaimForm({ ...claimForm, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                >
                  <option value="SUPPLIES">SUPPLIES (Stationery, Badges)</option>
                  <option value="FOOD_EVENT">FOOD & EVENT REFRESHMENTS</option>
                  <option value="TRAVEL">TRAVEL & LOGISTICS</option>
                  <option value="EQUIPMENT">EQUIPMENT & HARDWARE</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Description / Justification</label>
                <textarea
                  rows="2"
                  required
                  value={claimForm.description}
                  onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })}
                  placeholder="Explain what was purchased and which event/duty it supported..."
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 transition-colors hover:bg-amber-50">
                <label className="block text-xs font-bold text-slate-700">Receipt / bill image <span className="font-medium text-slate-500">(optional, JPG/PNG/WebP, up to 8 MB)</span></label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-amber-700"
                />
                {receiptFile && <p className="mt-2 truncate text-xs font-medium text-emerald-700">Attached: {receiptFile.name}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={claimSubmitting}
                  className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {claimSubmitting ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
