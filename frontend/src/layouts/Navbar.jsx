import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { notificationsAPI } from '../services/api';
import {
  FiAward,
  FiBell,
  FiCalendar,
  FiChevronDown,
  FiHome,
  FiList,
  FiLogOut,
  FiMenu,
  FiPlusCircle,
  FiSearch,
  FiShoppingBag,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { MdDashboard, MdEventAvailable, MdSchool } from 'react-icons/md';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!user) return;
    // Don't poll if session is already expired
    const expiresAt = localStorage.getItem('eb_expires_at');
    if (expiresAt && Date.now() >= parseInt(expiresAt, 10)) return;
    notificationsAPI.getUnread().then((r) => setUnread(r.data?.data ?? 0)).catch(() => {});
  }, [user, location.pathname]);

  useEffect(() => {
    const close = (event) => {
      if (dropRef.current && !dropRef.current.contains(event.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const userRoles = [
    (user?.role || '').toUpperCase(),
    ...(Array.isArray(user?.roles) ? user.roles : []).map((r) => String(r).toUpperCase()),
  ];
  const isPresident = userRoles.includes('PRESIDENT') || userRoles.includes('ADMIN');
  const isOrg = userRoles.includes('ORGANIZER');
  const isTreasurer = userRoles.includes('TREASURER');
  const isVolunteer = userRoles.includes('VOLUNTEER');

  const dashboardPath = isPresident
    ? '/admin/dashboard'
    : isTreasurer
    ? '/treasurer/dashboard'
    : isVolunteer
    ? '/volunteer/dashboard'
    : isOrg
    ? '/organizer/dashboard'
    : '/dashboard';

  const profilePath = isOrg ? '/organizer/profile' : '/profile';

  const navLinks = user
    ? isPresident
      ? [
          { to: '/admin/dashboard', label: 'President', icon: <MdDashboard className="h-3.5 w-3.5" /> },
          { to: '/admin/approvals', label: 'Approvals', icon: <FiList className="h-3.5 w-3.5" /> },
          { to: '/admin/announcements', label: 'Member announcements', icon: <FiBell className="h-3.5 w-3.5" /> },
          { to: '/admin/roles', label: 'Roles', icon: <FiUser className="h-3.5 w-3.5" /> },
          { to: '/admin/audit-logs', label: 'Audit Logs', icon: <FiAward className="h-3.5 w-3.5" /> },
          { to: '/events', label: 'Browse', icon: <FiSearch className="h-3.5 w-3.5" /> },
        ]
      : isTreasurer
      ? [
          { to: '/treasurer/dashboard', label: 'Treasurer', icon: <MdDashboard className="h-3.5 w-3.5" /> },
          { to: '/events', label: 'Browse Events', icon: <FiSearch className="h-3.5 w-3.5" /> },
          { to: '/help', label: 'Help', icon: <FiSearch className="h-3.5 w-3.5" /> },
        ]
      : isVolunteer
      ? [
          { to: '/volunteer/dashboard', label: 'Volunteer', icon: <MdDashboard className="h-3.5 w-3.5" /> },
          { to: '/events', label: 'Browse Events', icon: <FiSearch className="h-3.5 w-3.5" /> },
          { to: '/help', label: 'Help', icon: <FiSearch className="h-3.5 w-3.5" /> },
        ]
      : isOrg
      ? [
          { to: '/organizer/dashboard', label: 'My Dashboard', icon: <MdDashboard className="h-3.5 w-3.5" /> },
          { to: '/organizer/events', label: 'My Events', icon: <FiList className="h-3.5 w-3.5" /> },
          { to: '/organizer/events/create', label: 'Create Event', icon: <FiPlusCircle className="h-3.5 w-3.5" /> },
          { to: '/organizer/attendees', label: 'Attendees', icon: <FiUser className="h-3.5 w-3.5" /> },
          { to: '/organizer/certificates', label: 'Certificates', icon: <FiAward className="h-3.5 w-3.5" /> },
          { to: '/organizer/copilot', label: 'Smart Assistant', icon: <FiSearch className="h-3.5 w-3.5" /> },
          { to: '/events', label: 'Browse', icon: <FiSearch className="h-3.5 w-3.5" /> },
        ]
      : [
          { to: '/dashboard', label: 'My Dashboard', icon: <MdDashboard className="h-3.5 w-3.5" /> },
          { to: '/events', label: 'Browse Events', icon: <FiSearch className="h-3.5 w-3.5" /> },
          { to: '/discover', label: 'Discover', icon: <FiSearch className="h-3.5 w-3.5" /> },
          { to: '/networking', label: 'Network', icon: <FiUser className="h-3.5 w-3.5" /> },
          { to: '/bookings', label: 'My Bookings', icon: <MdEventAvailable className="h-3.5 w-3.5" /> },
          { to: '/merchandise', label: 'Merchandise', icon: <FiShoppingBag className="h-3.5 w-3.5" /> },
          { to: '/payments', label: 'Payments', icon: <FiList className="h-3.5 w-3.5" /> },
          { to: '/portfolio', label: 'My Portfolio', icon: <FiList className="h-3.5 w-3.5" /> },
          { to: '/certificates', label: 'Certificates', icon: <FiList className="h-3.5 w-3.5" /> },
        ]
    : [
        { to: '/', label: 'Home', icon: <FiHome className="h-3.5 w-3.5" /> },
        { to: '/events', label: 'Events', icon: <FiSearch className="h-3.5 w-3.5" /> },
        { to: '/discover', label: 'Discover', icon: <FiList className="h-3.5 w-3.5" /> },
        { to: '/leaderboard', label: 'Leaderboard', icon: <FiList className="h-3.5 w-3.5" /> },
        { to: '/help', label: 'Help', icon: <FiList className="h-3.5 w-3.5" /> },
      ];

  const menuItems = isPresident
    ? [
        { label: 'President Dashboard', icon: <MdDashboard />, to: '/admin/dashboard' },
        { label: 'Membership Reviews',  icon: <FiList />,      to: '/admin/approvals' },
        { label: 'Role Management',     icon: <FiUser />,      to: '/admin/roles' },
        { label: 'Audit Logs',          icon: <FiAward />,     to: '/admin/audit-logs' },
        { label: 'Certificates',        icon: <FiAward />,     to: '/admin/certificates' },
        { label: 'Platform Insights',   icon: <FiSearch />,    to: '/admin/ai-insights' },
        { label: 'Notifications',       icon: <FiBell />,      to: '/notifications' },
        { label: 'Profile',             icon: <FiUser />,      to: '/profile' },
      ]
    : isTreasurer
    ? [
        { label: 'Treasurer Dashboard', icon: <MdDashboard />, to: '/treasurer/dashboard' },
        { label: 'Notifications',       icon: <FiBell />,      to: '/notifications' },
        { label: 'Profile',             icon: <FiUser />,      to: '/profile' },
      ]
    : isVolunteer
    ? [
        { label: 'Volunteer Dashboard', icon: <MdDashboard />, to: '/volunteer/dashboard' },
        { label: 'Notifications',       icon: <FiBell />,      to: '/notifications' },
        { label: 'Profile',             icon: <FiUser />,      to: '/profile' },
      ]
    : isOrg
    ? [
        { label: 'Dashboard',   icon: <MdDashboard />,  to: '/organizer/dashboard' },
        { label: 'My Events',   icon: <FiCalendar />,   to: '/organizer/events' },
        { label: 'Create Event',icon: <FiPlusCircle />, to: '/organizer/events/create' },
        { label: 'Analytics',   icon: <FiList />,       to: '/organizer/analytics' },
        { label: 'Certificates',icon: <FiAward />,      to: '/organizer/certificates' },
        { label: 'Smart Assistant', icon: <FiSearch />,     to: '/organizer/copilot' },
        { label: 'Attendees',   icon: <FiUser />,       to: '/organizer/attendees' },
        { label: 'Notifications',icon: <FiBell />,      to: '/notifications' },
        { label: 'Profile',     icon: <FiUser />,       to: '/organizer/profile' },
      ]
    : [
        { label: 'Dashboard', icon: <MdDashboard />, to: '/dashboard' },
        { label: 'My Bookings', icon: <MdEventAvailable />, to: '/bookings' },
        { label: 'Payments', icon: <FiList />, to: '/payments' },
        { label: 'Refunds', icon: <FiCalendar />, to: '/refunds' },
        { label: 'Notifications', icon: <FiBell />, to: '/notifications' },
        { label: 'Profile', icon: <FiUser />, to: '/profile' },
      ];


  return (
    <motion.nav
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 right-0 top-0 z-50"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px)',
        borderBottom: scrolled ? '1px solid #E2E8F0' : '1px solid rgba(226,232,240,0.7)',
        boxShadow: scrolled ? '0 12px 34px rgba(15,23,42,0.08)' : 'none',
        transition: 'all 0.35s ease',
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to={user ? dashboardPath : '/'} className="flex flex-shrink-0 items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 280 }}
              className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md"
              style={{ background: 'linear-gradient(135deg,#0F172A,#0F766E)' }}
            >
              <MdSchool className="h-5 w-5 text-white" />
            </motion.div>
            <div className="hidden sm:block">
              <div className="text-sm font-extrabold leading-none text-slate-950" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
                CollegeEvents
              </div>
              <div className="text-[9px] font-semibold tracking-widest text-slate-400">BOOK / ATTEND / ACHIEVE</div>
            </div>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold transition-all"
                style={({ isActive }) => ({
                  background: isActive ? '#CCFBF1' : 'transparent',
                  color: isActive ? '#0F766E' : '#475569',
                  borderColor: isActive ? '#99F6E4' : 'transparent',
                })}
              >
                {link.icon}
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {user ? (
              <>
                {/* Bell icon — only for USER/ORGANIZER */}
                {(user.role === 'USER' || user.role === 'ORGANIZER') && (
                  <Link
                    to="/notifications"
                    className="relative rounded-xl p-2.5 text-slate-500 transition-all duration-200 hover:bg-teal-50 hover:text-teal-700"
                    aria-label="Notifications"
                  >
                    <FiBell className="h-5 w-5" />
                    <AnimatePresence>
                      {unread > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute -right-0.5 -top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ background: 'linear-gradient(135deg,#E11D48,#F97316)' }}
                        >
                          {unread > 9 ? '9+' : unread}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                )}

                <div className="relative" ref={dropRef}>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setDropOpen(!dropOpen)}
                    aria-label="Account menu"
                    aria-expanded={dropOpen}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 py-1.5 pl-2 pr-3 transition-all duration-200 hover:bg-slate-50"
                  >
                    <div
                      className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#0F172A,#0F766E)' }}
                    >
                      {user.profilePicture ? <img src={user.profilePicture} alt="" className="h-full w-full object-cover" /> : user.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden text-sm font-semibold text-slate-900 sm:block">{user.name?.split(' ')[0]}</span>
                    <motion.span animate={{ rotate: dropOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <FiChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </motion.span>
                  </motion.button>

                  <AnimatePresence>
                    {dropOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                        className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl"
                      >
                        <div className="border-b border-slate-100 px-4 py-3">
                          <p className="truncate text-sm font-bold text-slate-950">{user.name}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{user.email}</p>
                          <span className="badge badge-teal mt-1.5 text-[9px]">{user.role}</span>
                        </div>
                        {menuItems.map((item, index) => (
                          <motion.div key={item.to} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}>
                            <Link
                              to={item.to}
                              onClick={() => setDropOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-all duration-150 hover:bg-teal-50 hover:text-teal-700"
                            >
                              <span className="text-teal-600">{item.icon}</span>
                              {item.label}
                            </Link>
                          </motion.div>
                        ))}
                        <div className="mt-1 border-t border-slate-100 pt-1">
                          <button
                            onClick={() => {
                              setDropOpen(false);
                              logout();
                              navigate('/login');
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
                          >
                            <FiLogOut /> Sign Out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link to="/login" className="btn-ghost text-sm">Sign In</Link>
                <Link to="/register" className="btn-primary flex items-center gap-1.5 px-5 py-2 text-sm">
                  <FiAward className="h-3.5 w-3.5" /> Get Started
                </Link>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="rounded-xl p-2.5 text-gray-500 transition-all duration-200 hover:bg-teal-50 hover:text-teal-700 md:hidden"
            >
              <AnimatePresence mode="wait">
                {menuOpen ? (
                  <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <FiX className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <FiMenu className="h-5 w-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden border-t border-slate-200 pb-4 md:hidden"
            >
              <div className="space-y-1 pt-3">
                {navLinks.map((link, index) => (
                  <motion.div key={link.to} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}>
                    <Link to={link.to} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-teal-50 hover:text-teal-700">
                      {link.icon}
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
                {!user && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="flex gap-2 pt-3">
                    <Link to="/login" className="btn-outline flex-1 px-4 py-2 text-center text-sm">Sign In</Link>
                    <Link to="/register" className="btn-primary flex-1 px-4 py-2 text-center text-sm">Sign Up</Link>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
