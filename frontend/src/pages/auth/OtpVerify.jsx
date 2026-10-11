import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiArrowRight, FiCheckCircle, FiMail, FiRefreshCw } from 'react-icons/fi';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const RESEND_COOLDOWN = 60;
const EMPTY_OTP = ['', '', '', '', '', ''];

const ROLE_THEME = {
  user: {
    label: 'User account',
    accent: '#1565C0',
    accentAlt: '#1976D2',
    bg: 'linear-gradient(135deg,#E3F2FD 0%,#F8FBFF 58%,#EAF0FA 100%)',
    curtain: 'linear-gradient(180deg,#1565C0,#0D47A1)',
    border: '#BBDEFB',
    inputBg: '#F2F8FF',
    soft: '#E3F2FD',
    dashboard: '/dashboard',
  },
  organizer: {
    label: 'Organizer account',
    accent: '#C62828',
    accentAlt: '#D32F2F',
    bg: 'linear-gradient(135deg,#FFEBEE 0%,#FFF8F8 58%,#FFF1F1 100%)',
    curtain: 'linear-gradient(180deg,#C62828,#B71C1C)',
    border: '#FFCDD2',
    inputBg: '#FFF6F6',
    soft: '#FFEBEE',
    dashboard: '/organizer/dashboard',
  },
};

const BUBBLES = [
  { size: 10, x: 8, delay: 0 },
  { size: 14, x: 22, delay: 1.2 },
  { size: 8, x: 41, delay: 2.6 },
  { size: 12, x: 60, delay: 0.8 },
  { size: 16, x: 78, delay: 3.1 },
  { size: 7, x: 91, delay: 1.8 },
];

function Bubble({ size, x, delay, color }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, left: `${x}%`, bottom: 0, background: color }}
      initial={{ opacity: 0, y: 0, scale: 0 }}
      animate={{ opacity: [0, 0.7, 0.35, 0], scale: [0, 1, 1.05, 0], y: [0, -110, -230, -370] }}
      transition={{ duration: 9 + delay, repeat: Infinity, delay, ease: 'easeInOut' }}
    />
  );
}

export default function OtpVerify({ defaultRole } = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const inputRefs = useRef([]);

  const role = params.get('role') === 'organizer' || defaultRole === 'organizer' ? 'organizer' : 'user';
  const theme = ROLE_THEME[role];
  const [email, setEmail] = useState(params.get('email') || '');
  const [editingEmail, setEditingEmail] = useState(!params.get('email'));
  const mode = params.get('mode') || '';
  const redirect = params.get('redirect') || theme.dashboard;
  const alreadySent = params.get('sent') === '1';

  const [digits, setDigits] = useState(EMPTY_OTP);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');

  const otp = useMemo(() => digits.join(''), [digits]);
  const roleForApi = role === 'organizer' ? 'ORGANIZER' : 'USER';
  const loginPath = `/login?role=${role}`;

  const sendOtp = useCallback(async () => {
    const targetEmail = (email || '').trim().toLowerCase();
    if (!targetEmail || sending) return;

    if (targetEmail === 'president@skyline.edu') {
      navigate('/admin/login', { replace: true });
      return;
    }

    setSending(true);
    setError('');
    try {
      await authAPI.sendOtp({ email: targetEmail, role: roleForApi });
      setCooldown(RESEND_COOLDOWN);
      setEditingEmail(false);
      toast.success(`OTP sent to ${targetEmail}`);
    } catch (err) {
      const message = err?.response?.data?.message || 'Could not send OTP email. Please try again.';
      setError(message);
      setCooldown(30);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [email, roleForApi, sending, navigate]);

  useEffect(() => {
    if (!email) return;
    if (email === 'president@skyline.edu') {
      navigate('/admin/login', { replace: true });
      return;
    }
    if (alreadySent) setCooldown(RESEND_COOLDOWN);
    else sendOtp();
    // send once when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const updateDigit = (index, value) => {
    if (!/^\d?$/.test(value)) return;

    setDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setError('');

    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
    if (event.key === 'Enter' && otp.length === 6) verifyOtp();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const next = [...EMPTY_OTP];
    pasted.split('').forEach((digit, index) => {
      next[index] = digit;
    });
    setDigits(next);
    setError('');
    inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  const verifyOtp = async () => {
    if (!email) {
      setError('Open this page from login or registration so we know which email to verify.');
      return;
    }
    if (otp.length !== 6) {
      setError('Enter the complete 6-digit OTP.');
      inputRefs.current[digits.findIndex((digit) => !digit)]?.focus();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await authAPI.verifyOtp({ email, otp, role: roleForApi });
      setVerified(true);

      if (mode === 'login' || mode === 'register') {
        const raw = sessionStorage.getItem('eb_pending_auth');
        if (raw) {
          const payload = JSON.parse(raw);
          if (payload.user) payload.user.emailVerified = true;
          sessionStorage.removeItem('eb_pending_auth');
          login(payload);
        }
      }

      toast.success('Email verified successfully');
      window.setTimeout(() => navigate(redirect, { replace: true }), 900);
    } catch (err) {
      const message = err?.response?.data?.message || 'Invalid or expired OTP. Please request a new one.';
      setError(message);
      setDigits(EMPTY_OTP);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const bypassOtp = () => {
    const raw = sessionStorage.getItem('eb_pending_auth');
    if (raw) {
      const payload = JSON.parse(raw);
      if (payload.user) payload.user.emailVerified = true;
      sessionStorage.removeItem('eb_pending_auth');
      login(payload);
      toast.success('Direct access granted without OTP.');
      navigate(redirect, { replace: true });
      return;
    }
    toast.info('Returning to login.');
    navigate(loginPath, { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: theme.bg }}
    >
      <motion.div
        className="fixed inset-x-0 top-0 h-1/2 z-50 pointer-events-none"
        style={{ background: theme.curtain, transformOrigin: 'top' }}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: 0 }}
        transition={{ duration: 0.72, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
      />
      <motion.div
        className="fixed inset-x-0 bottom-0 h-1/2 z-50 pointer-events-none"
        style={{ background: theme.curtain, transformOrigin: 'bottom' }}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: 0 }}
        transition={{ duration: 0.72, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
      />

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {BUBBLES.map((bubble, index) => (
          <Bubble key={index} {...bubble} color={`${theme.accent}${index % 2 ? '55' : '3F'}`} />
        ))}
        <motion.div
          className="absolute w-[460px] h-[460px] rounded-full"
          style={{
            background: `radial-gradient(circle,${theme.accent}16,transparent 70%)`,
            top: '-110px',
            left: '-90px',
          }}
          animate={{ scale: [1, 1.16, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: `radial-gradient(circle,${theme.accent} 1px,transparent 1px)`, backgroundSize: '40px 40px' }}
        />
      </div>

      <motion.main
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.48, delay: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div
          className="relative bg-white rounded-3xl overflow-hidden"
          style={{ border: `1.5px solid ${theme.border}`, boxShadow: `0 24px 64px ${theme.accent}22` }}
        >
          <motion.div
            className="h-1.5"
            style={{ background: `linear-gradient(90deg,${theme.accent},${theme.accentAlt},${theme.accent})`, backgroundSize: '200%' }}
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
          />

          <div className="p-8">
            <AnimatePresence mode="wait">
              {verified ? (
                <motion.div
                  key="verified"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-green-100">
                    <FiCheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-green-700" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
                    Email verified
                  </h1>
                  <p className="text-sm text-gray-500 mt-2">Taking you to your dashboard...</p>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="text-center mb-7">
                    <div
                      className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg"
                      style={{ background: `linear-gradient(135deg,${theme.accent},${theme.accentAlt})` }}
                    >
                      <FiMail className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-extrabold" style={{ color: theme.accent, fontFamily: 'Space Grotesk,sans-serif' }}>
                      Verify OTP
                    </h1>
                    <p className="text-xs font-semibold mt-1" style={{ color: theme.accentAlt }}>
                      {theme.label}
                    </p>

                    {editingEmail ? (
                      <div className="mt-4 mb-2 space-y-2 text-left">
                        <label className="block text-xs font-bold text-slate-700">Email Address</label>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@college.edu"
                            className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={sendOtp}
                            disabled={!email || sending}
                            className="rounded-xl px-4 py-2 text-xs font-bold text-white transition-opacity disabled:opacity-50"
                            style={{ background: theme.accent }}
                          >
                            {sending ? 'Sending…' : 'Send Code'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 mt-3 leading-relaxed">
                        Enter the 6-digit code sent to
                        <br />
                        <span className="font-semibold break-all" style={{ color: theme.accent }}>
                          {email}
                        </span>
                        {' '}
                        <button
                          type="button"
                          onClick={() => setEditingEmail(true)}
                          className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
                        >
                          (change)
                        </button>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2.5 justify-center mb-5" onPaste={handlePaste}>
                    {digits.map((digit, index) => (
                      <motion.input
                        key={index}
                        ref={(element) => {
                          inputRefs.current[index] = element;
                        }}
                        aria-label={`OTP digit ${index + 1}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        value={digit}
                        onChange={(event) => updateDigit(index, event.target.value)}
                        onKeyDown={(event) => handleKeyDown(index, event)}
                        whileFocus={{ scale: 1.06 }}
                        className="w-11 h-14 text-center text-xl font-bold rounded-xl outline-none transition-all"
                        style={{
                          background: theme.inputBg,
                          border: error ? '2px solid #EF5350' : digit ? `2px solid ${theme.accent}` : `1.5px solid ${theme.border}`,
                          color: theme.accent,
                          boxShadow: digit ? `0 0 0 3px ${theme.accent}1f` : 'none',
                        }}
                      />
                    ))}
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-center text-xs text-red-500 mb-4"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="button"
                    onClick={verifyOtp}
                    disabled={loading || otp.length !== 6}
                    whileHover={loading || otp.length !== 6 ? {} : { scale: 1.02 }}
                    whileTap={loading || otp.length !== 6 ? {} : { scale: 0.97 }}
                    className="w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 rounded-xl text-white transition-all mb-5 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: `linear-gradient(135deg,${theme.accent},${theme.accentAlt})`, boxShadow: `0 4px 18px ${theme.accent}55` }}
                  >
                    {loading ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }}
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                        />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify OTP <FiArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>

                  <button
                    type="button"
                    onClick={bypassOtp}
                    className="w-full -mt-2 mb-4 py-2.5 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    ⚡ Skip OTP & Enter Directly (Demo Mode)
                  </button>

                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-2">Did not receive the code?</p>
                    <motion.button
                      type="button"
                      onClick={sendOtp}
                      disabled={sending || cooldown > 0 || !email}
                      whileHover={sending || cooldown > 0 || !email ? {} : { scale: 1.04 }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: cooldown > 0 ? `${theme.accent}80` : theme.accent }}
                    >
                      <FiRefreshCw className={`w-3.5 h-3.5 ${sending ? 'animate-spin' : ''}`} />
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                    </motion.button>
                  </div>

                  <Link
                    to={loginPath}
                    className="mt-7 mx-auto flex w-fit items-center gap-1.5 text-xs font-semibold hover:underline"
                    style={{ color: theme.accent }}
                  >
                    <FiArrowLeft className="w-3.5 h-3.5" />
                    Back to login
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.main>
    </div>
  );
}
