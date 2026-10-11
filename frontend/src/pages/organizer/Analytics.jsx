import { useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import { aiAPI, analyticsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import Spinner from '../../components/common/Spinner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, RadarChart,
  Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import { FiTrendingUp, FiStar, FiUsers, FiAward, FiZap, FiDollarSign, FiPercent } from 'react-icons/fi';

const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777'];
const BADGE_CLS = {
  GOLD: 'bg-amber-50 text-amber-700 border-amber-200',
  SILVER: 'bg-slate-50 text-slate-600 border-slate-200',
  BRONZE: 'bg-orange-50 text-orange-600 border-orange-200',
  FEATURED: 'bg-purple-50 text-purple-700 border-purple-200',
  NONE: 'bg-slate-50 text-slate-500 border-slate-200',
};

function StatCard({ label, value, sub, icon: Icon, color }) {
  const cls = { blue: 'bg-blue-50 text-blue-700', green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700', amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700', teal: 'bg-teal-50 text-teal-700' };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls[color]}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>{value ?? '—'}</p>
        <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function OrganizerAnalytics() {
  const [predictionResult, setPredictionResult] = useState(null);
  const [feedbackResult, setFeedbackResult] = useState(null);
  const { data, isLoading } = useQuery(
    'organizer-analytics',
    () => analyticsAPI.organizer().then(r => r.data?.data),
    { staleTime: 5 * 60 * 1000 }
  );
  const predictionMutation = useMutation((eventId) => aiAPI.prediction(eventId).then(r => r.data?.data), {
    onSuccess: (result) => {
      setPredictionResult(result);
      toast.success(`Predicted attendance: ${result?.predictedAttendance ?? 'ready'}`);
    },
  });
  const feedbackMutation = useMutation((eventId) => aiAPI.feedbackAnalysis(eventId).then(r => r.data?.data), {
    onSuccess: (result) => {
      setFeedbackResult(result);
      toast.success(`Feedback score: ${result?.eventScore ?? 'ready'}`);
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!data) return (
    <div className="text-center py-20 text-slate-400">
      <FiTrendingUp className="mx-auto h-10 w-10 mb-3 opacity-40" />
      <p>No analytics data available yet.</p>
    </div>
  );

  const {
    totalEvents = 0, completedEvents = 0, publishedEvents = 0,
    totalRegistrations = 0, categoryDistribution = {}, eventStats = [],
    performanceScore: score = {}, aiInsights, financialSummary = {}
  } = data;

  const catData  = Object.entries(categoryDistribution).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  const regData  = eventStats.slice(-8).map(e => ({
    name: (e.eventName || '').substring(0, 14),
    Registrations: e.registrations || 0,
    Attendance: e.attendance || 0,
    Rating: parseFloat(e.averageRating || 0),
  }));
  const radarData = [
    { subject: 'Rating',      A: (score.averageRating || 0) * 20 },
    { subject: 'Attendance',  A: score.attendanceRate || 0 },
    { subject: 'Punctuality', A: 80 },
    { subject: 'Completion',  A: totalEvents > 0 ? (completedEvents / totalEvents) * 100 : 0 },
    { subject: 'Score',       A: score.overallScore || 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-teal-700">Analytics</p>
          <h1 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
            Organizer Dashboard
          </h1>
        </div>

        {/* ── Stat cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Events"    value={totalEvents}        icon={FiTrendingUp}  color="blue" />
          <StatCard label="Published"       value={publishedEvents}    icon={FiZap}         color="teal" />
          <StatCard label="Completed"       value={completedEvents}    icon={FiAward}       color="green" />
          <StatCard label="Registrations"   value={totalRegistrations} icon={FiUsers}       color="purple" />
          <StatCard label="Avg Rating"      value={score.averageRating ? `${Number(score.averageRating).toFixed(1)}★` : '—'} icon={FiStar} color="amber" />
          <StatCard label="Perf. Score"     value={score.overallScore != null ? `${Number(score.overallScore).toFixed(0)}/100` : '—'} icon={FiPercent} color="rose" />
        </div>

        {/* ── Authoritative Financial Records ─────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <FiDollarSign className="text-emerald-600" /> Authoritative Financial & Revenue Summary
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">Supported strictly by verified transactions</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold text-emerald-800">Net Recorded Revenue</p>
              <p className="mt-1 text-xl font-extrabold text-emerald-950">Rs. {Number(financialSummary.netRecordedRevenue || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-xs font-semibold text-blue-800">Successful Collections</p>
              <p className="mt-1 text-xl font-extrabold text-blue-950">Rs. {Number(financialSummary.successfulPaymentsAmount || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-600">Gross Bookings</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">Rs. {Number(financialSummary.grossBookingsAmount || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
              <p className="text-xs font-semibold text-rose-800">Refunds Processed</p>
              <p className="mt-1 text-xl font-extrabold text-rose-950">Rs. {Number(financialSummary.refundedAmount || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <p className="text-xs font-semibold text-violet-800">Tickets Sold</p>
              <p className="mt-1 text-xl font-extrabold text-violet-950">{financialSummary.ticketSalesCount || 0}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="text-xs font-semibold text-amber-800">Verified Check-ins</p>
              <p className="mt-1 text-xl font-extrabold text-amber-950">{financialSummary.verifiedAttendanceCount || 0}</p>
            </div>
          </div>
        </div>

        {/* ── Performance score + AI insights ─────────────────── */}
        {(score.overallScore != null || aiInsights) && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold text-slate-900 mb-4 text-sm flex items-center gap-2">
                <FiPercent className="text-blue-600" /> Performance Overview
              </h3>
              <div className="flex items-center gap-6">
                {/* Circular gauge */}
                <div className="relative h-24 w-24 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2563eb" strokeWidth="3"
                      strokeDasharray={`${Math.min(score.overallScore || 0, 100)} 100`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-extrabold text-blue-700">{Number(score.overallScore || 0).toFixed(0)}</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${BADGE_CLS[score.badge] || BADGE_CLS.NONE}`}>
                    <FiAward className="h-3 w-3" /> {score.badge || 'NONE'} Organizer
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['Attendance Rate', `${Number(score.attendanceRate || 0).toFixed(1)}%`],
                      ['Refund Ratio',    `${Number(score.refundRatio || 0).toFixed(1)}%`],
                      ['Cancel Rate',     `${Number(score.cancellationRate || 0).toFixed(1)}%`],
                      ['Avg Rating',      score.averageRating ? `${Number(score.averageRating).toFixed(1)}/5` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <p className="text-slate-400">{k}</p>
                        <p className="font-semibold text-slate-800">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {aiInsights && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <h3 className="font-bold text-blue-900 text-sm flex items-center gap-2 mb-3">
                  <FiZap className="text-blue-600" /> Performance Insights
                </h3>
                <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line">{aiInsights}</p>
              </div>
            )}
          </div>
        )}

        {(predictionResult || feedbackResult) && (
          <div className="grid gap-5 md:grid-cols-2">
            {predictionResult && (
              <div className="rounded-xl border border-teal-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FiTrendingUp className="text-teal-600" /> Prediction AI
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Attendance', predictionResult.predictedAttendance],
                    ['Food', predictionResult.foodRequirement],
                    ['Certificates', predictionResult.certificateCount],
                    ['Success', predictionResult.successScore != null ? `${predictionResult.successScore}/100` : null],
                    ['Engagement', predictionResult.engagementScore != null ? `${predictionResult.engagementScore}%` : null],
                    ['Revenue', predictionResult.predictedRevenue],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-teal-50 px-3 py-2">
                      <p className="text-xs font-semibold text-teal-700">{label}</p>
                      <p className="font-bold text-slate-900">{value ?? 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {feedbackResult && (
              <div className="rounded-xl border border-blue-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FiStar className="text-blue-600" /> Feedback AI
                </h3>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {Object.entries(feedbackResult.sentiment || {}).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-blue-50 px-2 py-2">
                      <p className="font-bold capitalize text-blue-700">{label}</p>
                      <p className="text-lg font-extrabold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-slate-600">{feedbackResult.reviewSummary}</p>
                {feedbackResult.improvementSuggestions?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {feedbackResult.improvementSuggestions.slice(0, 3).map((item) => (
                      <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{item}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Charts row ─────────────────────────────────────── */}
        <div className="grid gap-5 md:grid-cols-2">
          {regData.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-900 text-sm mb-4">Registrations vs Attendance</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={regData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="Registrations" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Attendance"    fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {catData.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-900 text-sm mb-4">Category Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name }) => name.substring(0, 10)}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Radar chart ────────────────────────────────────── */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-slate-900 text-sm mb-4">Performance Radar</h3>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <Radar name="Score" dataKey="A" fill="#2563eb" fillOpacity={0.2} stroke="#2563eb" strokeWidth={2} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {regData.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-900 text-sm mb-4">Rating Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={regData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Rating" stroke="#d97706" strokeWidth={2} dot={{ r: 4 }} name="Avg Rating" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Event table ────────────────────────────────────── */}
        {eventStats.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <FiTrendingUp className="text-blue-600 h-4 w-4" />
              <h3 className="font-bold text-slate-900 text-sm">Event Performance Table</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0">
                  <tr>
                    {['Event', 'Date', 'Status', 'Registrations', 'Attendance', 'Rating', 'AI'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventStats.map(e => (
                    <tr key={e.eventId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 max-w-[160px] truncate">{e.eventName}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{e.eventDate}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5 font-semibold">{e.status}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{e.registrations ?? 0}</td>
                      <td className="px-4 py-3 text-slate-700">{e.attendance ?? 0}</td>
                      <td className="px-4 py-3 font-semibold text-amber-500">
                        {e.averageRating > 0 ? `${Number(e.averageRating).toFixed(1)}★` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => predictionMutation.mutate(e.eventId)}
                            className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100">
                            Predict
                          </button>
                          <button
                            onClick={() => feedbackMutation.mutate(e.eventId)}
                            className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100">
                            Feedback
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
