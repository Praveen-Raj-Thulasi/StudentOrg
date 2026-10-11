import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { motion, AnimatePresence } from 'framer-motion';
import * as yup from 'yup';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import { MdSchool } from 'react-icons/md';

/* ─── validation ──────────────────────────────────────────── */
const schema = yup.object({
  email:    yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().required('Password is required'),
});

/* ─── portal configurations ───────────────────────────────── */
export const PORTALS = [
  { id: 'student',   role: 'STUDENT',   label: 'Student',   icon: '🎓', path: '/dashboard',           title: 'Student Portal' },
  { id: 'organizer', role: 'ORGANIZER', label: 'Organizer', icon: '🏢', path: '/organizer/dashboard', title: 'Organizer Portal' },
  { id: 'president', role: 'PRESIDENT', label: 'President', icon: '🏛️', path: '/admin/dashboard',     title: 'President Portal' },
  { id: 'treasurer', role: 'TREASURER', label: 'Treasurer', icon: '💰', path: '/treasurer/dashboard', title: 'Treasurer Portal' },
  { id: 'volunteer', role: 'VOLUNTEER', label: 'Volunteer', icon: '🤝', path: '/volunteer/dashboard', title: 'Volunteer Portal' },
];

export const MOCK_ACCOUNTS = {
  student: {
    email: 'student@skyline.edu',
    password: 'Student123!',
    roleLabel: 'Student',
    icon: '🎓',
  },
  organizer: {
    email: 'organizer@skyline.edu',
    password: 'Organizer123!',
    roleLabel: 'Organizer',
    icon: '🏢',
  },
  president: {
    email: 'president@skyline.edu',
    password: 'President123!',
    roleLabel: 'President',
    icon: '🏛️',
  },
  treasurer: {
    email: 'treasurer@skyline.edu',
    password: 'Treasurer123!',
    roleLabel: 'Treasurer',
    icon: '💰',
  },
  volunteer: {
    email: 'volunteer@skyline.edu',
    password: 'Volunteer123!',
    roleLabel: 'Volunteer',
    icon: '🤝',
  },
};

/* ─── theme tokens ────────────────────────────────────────── */
const T = {
  student: {
    accent:'#1565C0', accentAlt:'#1976D2',
    bg:'linear-gradient(135deg,#E3F2FD 0%,#F0F4FF 60%,#E8EEF9 100%)',
    curtain:'linear-gradient(180deg,#1565C0,#0D47A1)',
    cardBorder:'#BBDEFB', inputBg:'#F0F7FF', inputBorder:'#BBDEFB',
    labelColor:'#1A237E', toggleBg:'#E3F2FD', toggleBorder:'#BBDEFB',
    subtitleColor:'#546E7A',
    bubbles:['rgba(21,101,192,0.35)','rgba(25,118,210,0.28)','rgba(13,71,161,0.32)','rgba(100,181,246,0.4)','rgba(21,101,192,0.25)','rgba(66,165,245,0.3)','rgba(21,101,192,0.4)','rgba(13,71,161,0.25)'],
    orbL:'rgba(21,101,192,0.08)', orbR:'rgba(187,222,251,0.5)',
  },
  organizer: {
    accent:'#C62828', accentAlt:'#D32F2F',
    bg:'linear-gradient(135deg,#FFEBEE 0%,#FFF0F0 60%,#FFF5F5 100%)',
    curtain:'linear-gradient(180deg,#C62828,#B71C1C)',
    cardBorder:'#FFCDD2', inputBg:'#FFF5F5', inputBorder:'#FFCDD2',
    labelColor:'#4A0000', toggleBg:'#FFEBEE', toggleBorder:'#FFCDD2',
    subtitleColor:'#78909C',
    bubbles:['rgba(198,40,40,0.3)','rgba(211,47,47,0.25)','rgba(183,28,28,0.28)','rgba(239,154,154,0.4)','rgba(198,40,40,0.22)','rgba(229,115,115,0.35)','rgba(198,40,40,0.35)','rgba(183,28,28,0.22)'],
    orbL:'rgba(198,40,40,0.07)', orbR:'rgba(255,205,210,0.5)',
  },
  president: {
    accent:'#4F46E5', accentAlt:'#6366F1',
    bg:'linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 60%,#E0E7FF 100%)',
    curtain:'linear-gradient(180deg,#4338CA,#312E81)',
    cardBorder:'#C7D2FE', inputBg:'#F5F3FF', inputBorder:'#C7D2FE',
    labelColor:'#312E81', toggleBg:'#EEF2FF', toggleBorder:'#C7D2FE',
    subtitleColor:'#6366F1',
    bubbles:['rgba(79,70,229,0.35)','rgba(99,102,241,0.28)','rgba(67,56,202,0.32)','rgba(129,140,248,0.4)','rgba(79,70,229,0.25)','rgba(99,102,241,0.3)'],
    orbL:'rgba(79,70,229,0.08)', orbR:'rgba(199,210,254,0.5)',
  },
  treasurer: {
    accent:'#059669', accentAlt:'#10B981',
    bg:'linear-gradient(135deg,#ECFDF5 0%,#F0F4FF 60%,#D1FAE5 100%)',
    curtain:'linear-gradient(180deg,#047857,#065F46)',
    cardBorder:'#A7F3D0', inputBg:'#F0FDF4', inputBorder:'#A7F3D0',
    labelColor:'#065F46', toggleBg:'#ECFDF5', toggleBorder:'#A7F3D0',
    subtitleColor:'#059669',
    bubbles:['rgba(5,150,105,0.35)','rgba(16,185,129,0.28)','rgba(4,120,87,0.32)','rgba(52,211,153,0.4)','rgba(5,150,105,0.25)','rgba(16,185,129,0.3)'],
    orbL:'rgba(5,150,105,0.08)', orbR:'rgba(167,243,208,0.5)',
  },
  volunteer: {
    accent:'#D97706', accentAlt:'#F59E0B',
    bg:'linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 60%,#FDE68A 100%)',
    curtain:'linear-gradient(180deg,#B45309,#92400E)',
    cardBorder:'#FDE68A', inputBg:'#FFFDF5', inputBorder:'#FDE68A',
    labelColor:'#78350F', toggleBg:'#FFFBEB', toggleBorder:'#FDE68A',
    subtitleColor:'#B45309',
    bubbles:['rgba(217,119,6,0.35)','rgba(245,158,11,0.28)','rgba(180,83,9,0.32)','rgba(251,191,36,0.4)','rgba(217,119,6,0.25)','rgba(245,158,11,0.3)'],
    orbL:'rgba(217,119,6,0.08)', orbR:'rgba(253,230,138,0.5)',
  },
};
T.user = T.student;
T.admin = T.president;

const BUBBLE_POS = [
  {size:12,x:6,delay:0},{size:8,x:18,delay:1.3},{size:16,x:34,delay:2.6},
  {size:10,x:50,delay:0.8},{size:14,x:65,delay:3.2},{size:7,x:78,delay:1.7},
  {size:18,x:88,delay:4.0},{size:9,x:96,delay:2.2},
];

function Bubble({size,x,delay,color}){
  return(
    <motion.div className="absolute rounded-full pointer-events-none"
      style={{width:size,height:size,left:`${x}%`,bottom:0,background:color,filter:'blur(0.8px)'}}
      initial={{opacity:0,y:0,scale:0}}
      animate={{opacity:[0,0.8,0.5,0.8,0],scale:[0,1,1.08,1,0],y:[0,-80,-160,-260,-360]}}
      transition={{duration:9+delay,repeat:Infinity,delay,ease:'easeInOut'}}/>
  );
}

const curtainT={initial:{scaleY:1},animate:{scaleY:0,transition:{duration:0.72,ease:[0.4,0,0.2,1],delay:0.05}}};
const curtainB={initial:{scaleY:1},animate:{scaleY:0,transition:{duration:0.72,ease:[0.4,0,0.2,1],delay:0.05}}};
const cardAnim={initial:{opacity:0,y:36,scale:0.96},animate:{opacity:1,y:0,scale:1,transition:{duration:0.5,delay:0.55,ease:[0.34,1.56,0.64,1]}}};
const stagger={animate:{transition:{staggerChildren:0.08,delayChildren:0.65}}};
const field={initial:{opacity:0,y:12},animate:{opacity:1,y:0,transition:{duration:0.32}}};

function resolveInitialPortal(queryRole) {
  if (!queryRole) return 'student';
  const q = String(queryRole).toLowerCase().trim();
  if (q === 'organizer') return 'organizer';
  if (q === 'president' || q === 'admin') return 'president';
  if (q === 'treasurer') return 'treasurer';
  if (q === 'volunteer') return 'volunteer';
  return 'student';
}

export default function Login({ defaultPortal, isDedicatedPresident }){
  const navigate   = useNavigate();
  const location   = useLocation();
  const [params]   = useSearchParams();
  const { login }  = useAuth();

  const isDedicated = Boolean(isDedicatedPresident || location.pathname.startsWith('/admin/login') || location.pathname.startsWith('/president/login'));

  const initialPortal = useMemo(() => {
    if (isDedicated || defaultPortal === 'president') return 'president';
    return resolveInitialPortal(params.get('role') || params.get('portal'));
  }, [params, isDedicated, defaultPortal]);

  const [portal, setPortal] = useState(initialPortal);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isPresident = portal === 'president';
  const defaultAccount = MOCK_ACCOUNTS[initialPortal] || MOCK_ACCOUNTS.student;

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      email: isPresident ? 'president@skyline.edu' : defaultAccount.email,
      password: defaultAccount.password,
    },
  });

  // Pre-fill mock email & password whenever active portal changes
  useEffect(() => {
    const cred = MOCK_ACCOUNTS[portal];
    if (cred) {
      setValue('email', isPresident ? 'president@skyline.edu' : cred.email, { shouldValidate: true });
      setValue('password', cred.password, { shouldValidate: true });
    }
  }, [portal, isPresident, setValue]);
  
  const portalConfig = useMemo(() => PORTALS.find(p => p.id === portal) || PORTALS[0], [portal]);
  const t = T[portal] || T.student;
  const isOrg = portal === 'organizer';

  const switchPortal = (pId) => {
    if (isDedicated) return; // Keep locked on dedicated president login page
    if (pId !== portal) {
      setPortal(pId);
      setError('');
      const cred = MOCK_ACCOUNTS[pId];
      if (cred) {
        setValue('email', pId === 'president' ? 'president@skyline.edu' : cred.email, { shouldValidate: true });
        setValue('password', cred.password, { shouldValidate: true });
      }
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    setError('');
    try {
      const emailToSubmit = isPresident ? 'president@skyline.edu' : data.email;
      const fn = isOrg ? authAPI.organizerLogin : authAPI.userLogin;
      const res = await fn({ ...data, email: emailToSubmit, portal: portalConfig.role });
      const payload = res.data?.data;
      if (!payload?.accessToken) {
        setError('Invalid response. Please try again.');
        return;
      }

      const rawRedirect = params.get('redirect');
      const dest = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
        ? rawRedirect
        : (isPresident ? '/admin/dashboard' : portalConfig.path);

      /* Direct login for all roles — OTP verification removed */
      login(payload);
      toast.success(isPresident ? 'Welcome back, President!' : `Welcome back! Logged into ${portalConfig.title}.`);
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const onFocus = (e) => {
    e.target.style.borderColor = t.accent;
    e.target.style.boxShadow = `0 0 0 3px ${t.accent}22`;
    e.target.style.background = '#fff';
  };
  const onBlur = (e, hasErr) => {
    e.target.style.borderColor = hasErr ? '#EF5350' : t.inputBorder;
    e.target.style.boxShadow = 'none';
    e.target.style.background = t.inputBg;
  };

  return (
    <AnimatePresence>
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
        style={{ background: t.bg, transition: 'background 0.5s ease' }}>

        <motion.div variants={curtainT} initial="initial" animate="animate"
          className="fixed inset-x-0 top-0 h-1/2 z-50 pointer-events-none"
          style={{ background: t.curtain, transformOrigin: 'top' }} />
        <motion.div variants={curtainB} initial="initial" animate="animate"
          className="fixed inset-x-0 bottom-0 h-1/2 z-50 pointer-events-none"
          style={{ background: t.curtain, transformOrigin: 'bottom' }} />

        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {BUBBLE_POS.map((b, i) => <Bubble key={i} {...b} color={t.bubbles[i % t.bubbles.length]} />)}
          <motion.div className="absolute w-[480px] h-[480px] rounded-full"
            style={{ background: `radial-gradient(circle,${t.orbL},transparent 70%)`, top: '-100px', left: '-80px' }}
            animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.div className="absolute w-[380px] h-[380px] rounded-full"
            style={{ background: `radial-gradient(circle,${t.orbR},transparent 70%)`, bottom: '-80px', right: '-60px' }}
            animate={{ scale: [1, 1.22, 1] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
          <div className="absolute inset-0 opacity-[0.025]"
            style={{ backgroundImage: `radial-gradient(circle,${t.accent} 1px,transparent 1px)`, backgroundSize: '40px 40px' }} />
        </div>

        <motion.div variants={cardAnim} initial="initial" animate="animate" className="w-full max-w-md relative z-10">
          <motion.div className="absolute inset-0 rounded-3xl pointer-events-none"
            animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: `radial-gradient(ellipse at 50% 0%,${t.accent}20,transparent 65%)`, transform: 'scale(1.06)', filter: 'blur(20px)' }} />

          <div className="relative rounded-3xl overflow-hidden bg-white"
            style={{ border: `1.5px solid ${t.cardBorder}`, boxShadow: `0 24px 64px ${t.accent}18,0 4px 20px ${t.accent}10` }}>

            <motion.div className="h-1.5"
              style={{ background: `linear-gradient(90deg,${t.accent},${t.accentAlt},${t.accent})`, backgroundSize: '200%' }}
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }} />

            <div className="p-8">
              <div className="text-center mb-6">
                <motion.div whileHover={{ rotate: 12, scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
                  className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg text-2xl"
                  style={{ background: `linear-gradient(135deg,${t.accent},${t.accentAlt})` }}>
                  <span>{portalConfig.icon}</span>
                </motion.div>
                <h1 className="text-2xl font-extrabold" style={{ color: t.accent, fontFamily: 'Space Grotesk,sans-serif' }}>
                  Welcome Back
                </h1>
                <AnimatePresence mode="wait">
                  <motion.p key={portal} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
                    className="text-sm mt-1" style={{ color: t.subtitleColor }}>
                    Sign in to the {portalConfig.title}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Five Portal Selector / Dedicated Header */}
              {isDedicated ? (
                <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl mb-6 bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs font-bold shadow-sm">
                  <span className="text-base">🏛️</span>
                  <span>Skyline Student Association — Executive President Login</span>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-1 p-1 rounded-2xl mb-6 text-center"
                  style={{ background: t.toggleBg, border: `1.5px solid ${t.toggleBorder}` }}>
                  {PORTALS.map((p) => {
                    const isActive = portal === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => switchPortal(p.id)}
                        className="py-2 px-1 rounded-xl font-semibold transition-all duration-200 flex flex-col items-center justify-center gap-0.5"
                        style={{
                          background: isActive ? `linear-gradient(135deg,${t.accent},${t.accentAlt})` : 'transparent',
                          color: isActive ? '#fff' : t.subtitleColor,
                          boxShadow: isActive ? `0 4px 12px ${t.accent}35` : 'none',
                        }}
                      >
                        <span className="text-base sm:text-lg leading-none">{p.icon}</span>
                        <span className="truncate max-w-full text-[10px] sm:text-xs font-medium">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden mb-4">
                    <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700">
                      ⚠️ <span>{error}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.form key={portal}
                  initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.25 }}
                  onSubmit={handleSubmit(onSubmit)}>
                  <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">

                    <motion.div variants={field}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-semibold" style={{ color: t.labelColor }}>Email Address</label>
                        {isPresident && (
                          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            🔒 Fixed Official Email
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: `${t.accent}80` }} />
                        <input
                          {...register('email')}
                          type="email"
                          value={isPresident ? 'president@skyline.edu' : undefined}
                          readOnly={isPresident}
                          placeholder={isPresident ? 'president@skyline.edu' : 'you@college.edu'}
                          className={`w-full pl-11 pr-4 py-3 rounded-xl text-sm outline-none transition-all ${
                            isPresident ? 'cursor-not-allowed bg-slate-50 font-medium select-none' : ''
                          }`}
                          style={{
                            background: isPresident ? '#F8FAFC' : t.inputBg,
                            border: `1.5px solid ${errors.email ? '#EF5350' : t.inputBorder}`,
                            color: '#1A237E',
                          }}
                          onFocus={isPresident ? undefined : onFocus}
                          onBlur={isPresident ? undefined : (e) => onBlur(e, !!errors.email)}
                        />
                      </div>
                      <AnimatePresence>
                        {errors.email && !isPresident && (
                          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs mt-1 text-red-500">
                            {errors.email.message}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    <motion.div variants={field}>
                      <label className="block text-sm font-semibold mb-1.5" style={{ color: t.labelColor }}>Password</label>
                      <div className="relative">
                        <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: `${t.accent}80` }} />
                        <input {...register('password')} type={showPw ? 'text' : 'password'} placeholder="••••••••"
                          className="w-full pl-11 pr-11 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{ background: t.inputBg, border: `1.5px solid ${errors.password ? '#EF5350' : t.inputBorder}`, color: '#1A237E' }}
                          onFocus={onFocus} onBlur={(e) => onBlur(e, !!errors.password)} />
                        <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => setShowPw((v) => !v)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: `${t.accent}70` }}>
                          <AnimatePresence mode="wait">
                            {showPw
                              ? <motion.span key="off" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><FiEyeOff className="w-4 h-4" /></motion.span>
                              : <motion.span key="on"  initial={{ rotate: 90, opacity: 0 }}  animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><FiEye className="w-4 h-4" /></motion.span>
                            }
                          </AnimatePresence>
                        </motion.button>
                      </div>
                      <AnimatePresence>
                        {errors.password && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs mt-1 text-red-500">{errors.password.message}</motion.p>}
                      </AnimatePresence>
                    </motion.div>

                    <motion.div variants={field} className="flex justify-end">
                      <Link to="/forgot-password" className="text-xs font-semibold hover:underline" style={{ color: t.accent }}>
                        Forgot password?
                      </Link>
                    </motion.div>

                    <motion.div variants={field}>
                      <motion.button type="submit" disabled={loading}
                        whileHover={loading ? {} : { scale: 1.02, boxShadow: `0 10px 32px ${t.accent}45` }}
                        whileTap={loading ? {} : { scale: 0.97 }}
                        className="w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 rounded-xl text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`, boxShadow: `0 4px 18px ${t.accent}40` }}>
                        {loading
                          ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }} className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full" />Signing in…</>
                          : <>Sign In to {portalConfig.label} Portal<FiArrowRight className="w-4 h-4" /></>
                        }
                      </motion.button>
                    </motion.div>

                  </motion.div>
                </motion.form>
              </AnimatePresence>

              {/* Quick Mock Credentials Panel */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
                    ⚡ Mock Access Credentials (No OTP)
                  </span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                    Direct Access
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(MOCK_ACCOUNTS).map(([key, acc]) => {
                    if (isDedicated && key !== 'president') return null;
                    const isCurrent = portal === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (!isDedicated) setPortal(key);
                          setValue('email', key === 'president' ? 'president@skyline.edu' : acc.email, { shouldValidate: true });
                          setValue('password', acc.password, { shouldValidate: true });
                          setError('');
                          toast.info(`Filled mock credentials for ${acc.roleLabel}`);
                        }}
                        className={`p-2 rounded-xl text-left border transition-all ${
                          isCurrent
                            ? 'bg-blue-50/90 border-blue-300 ring-1 ring-blue-400/40 shadow-sm'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-xs text-slate-800">
                          <span className="flex items-center gap-1">
                            <span>{acc.icon}</span>
                            <span>{acc.roleLabel}</span>
                          </span>
                          {isCurrent && <span className="text-[9px] text-blue-600 font-bold uppercase">Active</span>}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{acc.email}</div>
                        <div className="text-[10px] text-slate-400 font-mono">pw: {acc.password}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!isPresident ? (
                <p className="text-center text-sm mt-5 text-gray-500">
                  Don't have an account?{' '}
                  <Link to="/register" className="font-bold hover:underline" style={{ color: t.accent }}>
                    Sign up free
                  </Link>
                </p>
              ) : isDedicated ? (
                <p className="text-center text-xs mt-5 text-slate-500">
                  Student or other portal?{' '}
                  <Link to="/login" className="font-semibold hover:underline text-indigo-600">
                    Switch to General Portal Login →
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
