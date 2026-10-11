import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layouts/Layout';
import Spinner from './components/common/Spinner';

const Landing          = lazy(() => import('./pages/Landing'));
const Events           = lazy(() => import('./pages/Events'));
const EventDetail      = lazy(() => import('./pages/EventDetail'));
const Discover         = lazy(() => import('./pages/Discover'));
const Login            = lazy(() => import('./pages/auth/Login'));
const Register         = lazy(() => import('./pages/auth/Register'));
const ForgotPassword   = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword    = lazy(() => import('./pages/auth/ResetPassword'));
const VerifyEmail      = lazy(() => import('./pages/auth/VerifyEmail'));
const OtpVerify        = lazy(() => import('./pages/auth/OtpVerify'));

const UserDashboard    = lazy(() => import('./pages/user/Dashboard'));
const MyBookings       = lazy(() => import('./pages/user/MyBookings'));
const BookingDetail    = lazy(() => import('./pages/user/BookingDetail'));
const PaymentCheckout  = lazy(() => import('./pages/user/PaymentCheckout'));
const UserProfile      = lazy(() => import('./pages/user/Profile'));
const Notifications    = lazy(() => import('./pages/user/Notifications'));
const Merchandise      = lazy(() => import('./pages/user/Merchandise'));
const PaymentHistory   = lazy(() => import('./pages/user/PaymentHistory'));
const RefundTracking   = lazy(() => import('./pages/user/RefundTracking'));
const QueueStatus      = lazy(() => import('./pages/user/QueueStatus'));
const Portfolio        = lazy(() => import('./pages/user/Portfolio'));
const Certificates     = lazy(() => import('./pages/user/Certificates'));
const Networking       = lazy(() => import('./pages/user/Networking'));
const HelpCenter       = lazy(() => import('./pages/HelpCenter'));
const Leaderboard      = lazy(() => import('./pages/Leaderboard'));
const VerifyCertificate = lazy(() => import('./pages/VerifyCertificate'));

const OrgDashboard     = lazy(() => import('./pages/organizer/Dashboard'));
const CreateEvent      = lazy(() => import('./pages/organizer/CreateEvent'));
const EditEvent        = lazy(() => import('./pages/organizer/EditEvent'));
const MyEvents         = lazy(() => import('./pages/organizer/MyEvents'));
const OrgProfile       = lazy(() => import('./pages/organizer/Profile'));
const Attendees        = lazy(() => import('./pages/organizer/Attendees'));
const OrgAnalytics     = lazy(() => import('./pages/organizer/Analytics'));
const OrgCopilot       = lazy(() => import('./pages/organizer/Copilot'));
const OrgCertificates  = lazy(() => import('./pages/organizer/Certificates'));
const AttendanceScanner = lazy(() => import('./pages/organizer/AttendanceScanner'));
const ScannerRelay     = lazy(() => import('./pages/organizer/ScannerRelay'));

const AdminDashboard   = lazy(() => import('./pages/admin/Dashboard'));
const AdminApprovals   = lazy(() => import('./pages/admin/Approvals'));
const RoleManagement   = lazy(() => import('./pages/admin/RoleManagement'));
const AuditLogs        = lazy(() => import('./pages/admin/AuditLogs'));
const AIInsights       = lazy(() => import('./pages/admin/AIInsights'));
const AdminCertificates = lazy(() => import('./pages/admin/Certificates'));
const AdminAnnouncements = lazy(() => import('./pages/admin/Announcements'));

const TreasurerDashboard = lazy(() => import('./pages/treasurer/Dashboard'));
const VolunteerDashboard = lazy(() => import('./pages/volunteer/Dashboard'));

const NotFound         = lazy(() => import('./pages/NotFound'));

function Wrap({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full />;
  if (!user) {
    const isPresidentRoute = roles && (roles.includes('ADMIN') || roles.includes('PRESIDENT'));
    if (isPresidentRoute) {
      return <Navigate to="/admin/login" replace />;
    }
    const isOrgRoute = roles && roles.includes('ORGANIZER');
    if (isOrgRoute) {
      return <Navigate to="/login?role=organizer" replace />;
    }
    const isTreasurerRoute = roles && roles.includes('TREASURER');
    if (isTreasurerRoute) {
      return <Navigate to="/login?role=treasurer" replace />;
    }
    const isVolunteerRoute = roles && roles.includes('VOLUNTEER');
    if (isVolunteerRoute) {
      return <Navigate to="/login?role=volunteer" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0) {
    const userRoleList = [
      (user.role || '').toUpperCase(),
      ...(Array.isArray(user.roles) ? user.roles : []).map((r) => String(r).toUpperCase()),
    ];

    // Expand role aliases for seamless compatibility
    const effectiveRoles = new Set(userRoleList);
    if (effectiveRoles.has('STUDENT')) effectiveRoles.add('USER');
    if (effectiveRoles.has('USER'))    effectiveRoles.add('STUDENT');
    if (effectiveRoles.has('PRESIDENT')) effectiveRoles.add('ADMIN');
    if (effectiveRoles.has('ADMIN'))     effectiveRoles.add('PRESIDENT');

    const allowed = roles.map((r) => String(r).toUpperCase());
    const hasPermission = allowed.some((r) => effectiveRoles.has(r));

    if (!hasPermission) {
      if (effectiveRoles.has('PRESIDENT')) return <Navigate to="/admin/dashboard" replace />;
      if (effectiveRoles.has('ORGANIZER')) return <Navigate to="/organizer/dashboard" replace />;
      if (effectiveRoles.has('TREASURER')) return <Navigate to="/treasurer/dashboard" replace />;
      if (effectiveRoles.has('VOLUNTEER')) return <Navigate to="/volunteer/dashboard" replace />;
      return <Navigate to="/dashboard" replace />;
    }
  }
  return children;
}

function MinimalPortalPlaceholder({ title, roleName, description, icon }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mb-4 text-3xl shadow-sm">
        {icon}
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-600 mb-6 text-sm">
        {description}
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
        Active Role: {roleName}
      </div>
    </div>
  );
}

function GuestRoute({ children, allowSwitch = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full />;
  if (user) {
    const userRoleList = [
      (user.role || '').toUpperCase(),
      ...(Array.isArray(user.roles) ? user.roles : []).map((r) => String(r).toUpperCase()),
    ];
    if (userRoleList.includes('PRESIDENT') || userRoleList.includes('ADMIN')) return <Navigate to="/admin/dashboard" replace />;
    if (!allowSwitch) {
      if (userRoleList.includes('ORGANIZER')) return <Navigate to="/organizer/dashboard" replace />;
      if (userRoleList.includes('TREASURER')) return <Navigate to="/treasurer/dashboard" replace />;
      if (userRoleList.includes('VOLUNTEER')) return <Navigate to="/volunteer/dashboard" replace />;
      return <Navigate to="/dashboard" replace />;
    }
  }
  return children;
}

function AppRoutes() {
  const loc = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={loc} key={loc.pathname}>
        <Route element={<Layout />}>
          {/* Public */}
          <Route path="/"             element={<Wrap><Landing /></Wrap>} />
          <Route path="/events"       element={<Wrap><Events /></Wrap>} />
          <Route path="/events/:id"   element={<Wrap><EventDetail /></Wrap>} />
          <Route path="/discover"     element={<Wrap><Discover /></Wrap>} />
          <Route path="/leaderboard"  element={<Wrap><Leaderboard /></Wrap>} />
          <Route path="/help"         element={<Wrap><HelpCenter /></Wrap>} />
          <Route path="/verify-email" element={<Wrap><VerifyEmail /></Wrap>} />
          <Route path="/verify/certificate/:certificateId" element={<Wrap><VerifyCertificate /></Wrap>} />

          {/* Auth */}
          <Route path="/login"           element={<GuestRoute><Wrap><Login /></Wrap></GuestRoute>} />
          <Route path="/admin/login"     element={<GuestRoute allowSwitch={true}><Wrap><Login defaultPortal="president" isDedicatedPresident={true} /></Wrap></GuestRoute>} />
          <Route path="/president/login" element={<GuestRoute allowSwitch={true}><Wrap><Login defaultPortal="president" isDedicatedPresident={true} /></Wrap></GuestRoute>} />
          <Route path="/register"        element={<GuestRoute><Wrap><Register /></Wrap></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><Wrap><ForgotPassword /></Wrap></GuestRoute>} />
          <Route path="/reset-password"  element={<GuestRoute><Wrap><ResetPassword /></Wrap></GuestRoute>} />
          <Route path="/verify-otp/user"       element={<Wrap><OtpVerify defaultRole="user" /></Wrap>} />
          <Route path="/verify-otp/organizer" element={<Wrap><OtpVerify defaultRole="organizer" /></Wrap>} />
          <Route path="/verify-otp"           element={<Wrap><OtpVerify /></Wrap>} />

          {/* User */}
          <Route path="/dashboard"     element={<PrivateRoute roles={['USER']}><Wrap><UserDashboard /></Wrap></PrivateRoute>} />
          <Route path="/bookings"      element={<PrivateRoute roles={['USER']}><Wrap><MyBookings /></Wrap></PrivateRoute>} />
          <Route path="/merchandise"   element={<PrivateRoute roles={['USER']}><Wrap><Merchandise /></Wrap></PrivateRoute>} />
          <Route path="/bookings/:id"  element={<PrivateRoute roles={['USER']}><Wrap><BookingDetail /></Wrap></PrivateRoute>} />
          <Route path="/checkout/:bookingId" element={<PrivateRoute roles={['USER']}><Wrap><PaymentCheckout /></Wrap></PrivateRoute>} />
          <Route path="/profile"       element={<PrivateRoute roles={['USER']}><Wrap><UserProfile /></Wrap></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute roles={['USER', 'ORGANIZER']}><Wrap><Notifications /></Wrap></PrivateRoute>} />
          <Route path="/payments"      element={<PrivateRoute roles={['USER']}><Wrap><PaymentHistory /></Wrap></PrivateRoute>} />
          <Route path="/refunds"       element={<PrivateRoute roles={['USER']}><Wrap><RefundTracking /></Wrap></PrivateRoute>} />
          <Route path="/queue-status"  element={<PrivateRoute roles={['USER']}><Wrap><QueueStatus /></Wrap></PrivateRoute>} />
          <Route path="/portfolio"     element={<PrivateRoute roles={['USER']}><Wrap><Portfolio /></Wrap></PrivateRoute>} />
          <Route path="/certificates"  element={<PrivateRoute roles={['USER']}><Wrap><Certificates /></Wrap></PrivateRoute>} />
          <Route path="/networking"    element={<PrivateRoute roles={['USER']}><Wrap><Networking /></Wrap></PrivateRoute>} />

          {/* Organizer */}
          <Route path="/organizer/dashboard"       element={<PrivateRoute roles={['ORGANIZER']}><Wrap><OrgDashboard /></Wrap></PrivateRoute>} />
          <Route path="/organizer/events"          element={<PrivateRoute roles={['ORGANIZER']}><Wrap><MyEvents /></Wrap></PrivateRoute>} />
          <Route path="/organizer/events/create"   element={<PrivateRoute roles={['ORGANIZER']}><Wrap><CreateEvent /></Wrap></PrivateRoute>} />
          <Route path="/organizer/events/:id/edit" element={<PrivateRoute roles={['ORGANIZER']}><Wrap><EditEvent /></Wrap></PrivateRoute>} />
          <Route path="/organizer/events/:id/attendance" element={<PrivateRoute roles={['ORGANIZER']}><Wrap><AttendanceScanner /></Wrap></PrivateRoute>} />
          <Route path="/organizer/attendees"       element={<PrivateRoute roles={['ORGANIZER']}><Wrap><Attendees /></Wrap></PrivateRoute>} />
          <Route path="/organizer/profile"         element={<PrivateRoute roles={['ORGANIZER']}><Wrap><OrgProfile /></Wrap></PrivateRoute>} />
          <Route path="/organizer/analytics"       element={<PrivateRoute roles={['ORGANIZER']}><Wrap><OrgAnalytics /></Wrap></PrivateRoute>} />
          <Route path="/organizer/copilot"         element={<PrivateRoute roles={['ORGANIZER']}><Wrap><OrgCopilot /></Wrap></PrivateRoute>} />
          <Route path="/organizer/certificates"    element={<PrivateRoute roles={['ORGANIZER']}><Wrap><OrgCertificates /></Wrap></PrivateRoute>} />

          {/* Admin / President */}
          <Route path="/admin/dashboard"           element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><AdminDashboard /></Wrap></PrivateRoute>} />
          <Route path="/admin/announcements"       element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><AdminAnnouncements /></Wrap></PrivateRoute>} />
          <Route path="/admin/approvals"           element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><AdminApprovals /></Wrap></PrivateRoute>} />
          <Route path="/admin/roles"               element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><RoleManagement /></Wrap></PrivateRoute>} />
          <Route path="/admin/audit-logs"          element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><AuditLogs /></Wrap></PrivateRoute>} />
          <Route path="/admin/ai-insights"         element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><AIInsights /></Wrap></PrivateRoute>} />
          <Route path="/admin/certificates"        element={<PrivateRoute roles={['ADMIN', 'PRESIDENT']}><Wrap><AdminCertificates /></Wrap></PrivateRoute>} />

          {/* Treasurer Portal */}
          <Route path="/treasurer/dashboard"       element={<PrivateRoute roles={['TREASURER']}><Wrap><TreasurerDashboard /></Wrap></PrivateRoute>} />
          <Route path="/treasurer/dues"            element={<PrivateRoute roles={['TREASURER']}><Wrap><TreasurerDashboard /></Wrap></PrivateRoute>} />
          <Route path="/treasurer/reports"         element={<PrivateRoute roles={['TREASURER']}><Wrap><TreasurerDashboard /></Wrap></PrivateRoute>} />

          {/* Volunteer Portal */}
          <Route path="/volunteer/dashboard"       element={<PrivateRoute roles={['VOLUNTEER']}><Wrap><VolunteerDashboard /></Wrap></PrivateRoute>} />
          <Route path="/volunteer/tasks"           element={<PrivateRoute roles={['VOLUNTEER']}><Wrap><VolunteerDashboard /></Wrap></PrivateRoute>} />
          <Route path="/volunteer/duties"          element={<PrivateRoute roles={['VOLUNTEER']}><Wrap><VolunteerDashboard /></Wrap></PrivateRoute>} />
        </Route>
        {/* External scanner relay — no layout, no auth guard, token is in URL query */}
        <Route path="/scanner-relay" element={<Wrap><ScannerRelay /></Wrap>} />
        <Route path="*" element={<Wrap><NotFound /></Wrap>} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Spinner full />}>
        <AppRoutes />
      </Suspense>
    </AuthProvider>
  );
}
