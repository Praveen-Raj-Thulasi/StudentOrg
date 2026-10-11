import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { motion, AnimatePresence } from 'framer-motion';
import * as yup from 'yup';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiCheck, FiX } from 'react-icons/fi';
import { MdSchool } from 'react-icons/md';

/* ─── validation & password policy ────────────────────────── */
const PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
const PW_MSG = '8+ chars, uppercase, lowercase, number & special character';

const schema = yup.object({
  email:    yup.string().email('Invalid email address').required('Email is required'),
  password: yup.string().matches(PW, PW_MSG).required('Password is required'),
});

/* ─── theme tokens ────────────────────────────────────────── */
const T = {
  accent: '#1565C0',
  accentAlt: '#1976D2',
  bg: 'linear-gradient(135deg,#E3F2FD 0%,#F0F4FF 60%,#E8EEF9 100%)',
  curtain: 'linear-gradient(180deg,#1565C0,#0D47A1)',
  cardBorder: '#BBDEFB',
  inputBg: '#F0F7FF',
  inputBorder: '#BBDEFB',
  labelColor: '#1A237E',
  subtitleColor: '#546E7A',
  bubbles: ['rgba(21,101,192,0.35)', 'rgba(25,118,210,0.28)', 'rgba(100,181,246,0.4)', 'rgba(13,71,161,0.32)', 'rgba(21,101,192,0.25)', 'rgba(66,165,245,0.3)'],
  orbLeft: 'rgba(21,101,192,0.08)',
  orbRight: 'rgba(187,222,251,0.5)',
};

const BUBBLE_POS = [
  { size: 10, x: 5,  delay: 0   },
  { size: 14, x: 20, delay: 1.5 },
  { size: 8,  x: 40, delay: 2.8 },
  { size: 12, x: 58, delay: 0.9 },
  { size: 16, x: 74, delay: 3.4 },
  { size: 7,  x: 90, delay: 2.1 },
];

function Bubble({ size, x, delay, color }) {
  return (
    <motion.div className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, left: `${x}%`, bottom: 0, background: color, filter: 'blur(0.8px)' }}
      initial={{ opacity: 0, y: 0, scale: 0 }}
      animate={{ opacity: [0, 0.75, 0.45, 0.75, 0], scale: [0, 1, 1.08, 1, 0], y: [0, -80, -180, -280, -380] }}
      transition={{ duration: 10 + delay, repeat: Infinity, delay, ease: 'easeInOut' }} />
  );
}

const curtainT = { initial: { scaleY: 1 }, animate: { scaleY: 0, transition: { duration: 0.72, ease: [0.4, 0, 0.2, 1], delay: 0.05 } } };
const curtainB = { initial: { scaleY: 1 }, animate: { scaleY: 0, transition: { duration: 0.72, ease: [0.4, 0, 0.2, 1], delay: 0.05 } } };
const cardAnim = { initial: { opacity: 0, y: 36, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, delay: 0.55, ease: [0.34, 1.56, 0.64, 1] } } };
const stagger  = { animate: { transition: { staggerChildren: 0.08, delayChildren: 0.65 } } };
const field    = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, transition: { duration: 0.32 } } };

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    mode: 'onChange',
  });

  const passwordVal = watch('password') || '';

  // Password requirement checklists
  const rules = useMemo(() => [
    { label: '8+ characters', met: passwordVal.length >= 8 },
    { label: 'Uppercase letter (A-Z)', met: /[A-Z]/.test(passwordVal) },
    { label: 'Lowercase letter (a-z)', met: /[a-z]/.test(passwordVal) },
    { label: 'Number (0-9)', met: /\d/.test(passwordVal) },
    { label: 'Special symbol (@$!%*?&)', met: /[@$!%*?&]/.test(passwordVal) },
  ], [passwordVal]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await authAPI.userRegister({
        email: data.email,
        password: data.password,
      });

      const payload = res.data?.data;
      if (!payload?.accessToken) throw new Error('Invalid response');

      /* Direct login — OTP verification removed */
      login(payload);
      toast.success('Registration successful! Welcome to Skyline Student Association Hub.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || 'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onFocus = (e) => {
    e.target.style.borderColor = T.accent;
    e.target.style.boxShadow = `0 0 0 3px ${T.accent}22`;
    e.target.style.background = '#fff';
  };
  const onBlur = (e, hasErr) => {
    e.target.style.borderColor = hasErr ? '#EF5350' : T.inputBorder;
    e.target.style.boxShadow = 'none';
    e.target.style.background = T.inputBg;
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: T.bg }}>

      {/* curtain open */}
      <motion.div variants={curtainT} initial="initial" animate="animate"
        className="fixed inset-x-0 top-0 h-1/2 z-50 pointer-events-none"
        style={{ background: T.curtain, transformOrigin: 'top' }} />
      <motion.div variants={curtainB} initial="initial" animate="animate"
        className="fixed inset-x-0 bottom-0 h-1/2 z-50 pointer-events-none"
        style={{ background: T.curtain, transformOrigin: 'bottom' }} />

      {/* floating bubbles & ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {BUBBLE_POS.map((b, i) => <Bubble key={i} {...b} color={T.bubbles[i % T.bubbles.length]} />)}
        <motion.div className="absolute w-[480px] h-[480px] rounded-full"
          style={{ background: `radial-gradient(circle,${T.orbLeft},transparent 70%)`, top: '-100px', right: '-80px' }}
          animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute w-[360px] h-[360px] rounded-full"
          style={{ background: `radial-gradient(circle,${T.orbRight},transparent 70%)`, bottom: '-80px', left: '-60px' }}
          animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }} />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: `radial-gradient(circle,${T.accent} 1px,transparent 1px)`, backgroundSize: '40px 40px' }} />
      </div>

      {/* card */}
      <motion.div variants={cardAnim} initial="initial" animate="animate" className="w-full max-w-md relative z-10">
        <motion.div className="absolute inset-0 rounded-3xl pointer-events-none"
          animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: `radial-gradient(ellipse at 50% 0%,${T.accent}1a,transparent 65%)`, transform: 'scale(1.05)', filter: 'blur(20px)' }} />

        <div className="relative rounded-3xl overflow-hidden bg-white"
          style={{ border: `1.5px solid ${T.cardBorder}`, boxShadow: `0 24px 64px ${T.accent}18, 0 4px 20px ${T.accent}10` }}>

          {/* animated top bar */}
          <motion.div className="h-1.5"
            style={{ background: `linear-gradient(90deg,${T.accent},${T.accentAlt},${T.accent})`, backgroundSize: '200%' }}
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }} />

          <div className="p-8">
            {/* header */}
            <div className="text-center mb-7">
              <motion.div whileHover={{ rotate: 12, scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl shadow-lg"
                style={{ background: `linear-gradient(135deg,${T.accent},${T.accentAlt})` }}>
                <MdSchool className="text-white w-7 h-7" />
              </motion.div>
              <h1 className="text-2xl font-extrabold" style={{ color: T.accent, fontFamily: 'Space Grotesk,sans-serif' }}>
                Join Skyline Association
              </h1>
              <p className="text-sm mt-1" style={{ color: T.subtitleColor }}>
                Student membership with automatic unique Member ID
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">

                {/* Email Address */}
                <motion.div variants={field}>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: T.labelColor }}>
                    Email Address
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: `${T.accent}80` }} />
                    <input
                      {...register('email')}
                      type="email"
                      placeholder="student@college.edu"
                      className="w-full pl-11 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{ background: T.inputBg, border: `1.5px solid ${errors.email ? '#EF5350' : T.inputBorder}`, color: '#1A237E' }}
                      onFocus={onFocus}
                      onBlur={(e) => onBlur(e, !!errors.email)}
                    />
                  </div>
                  <AnimatePresence>
                    {errors.email && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs mt-1 text-red-500">
                        {errors.email.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Password */}
                <motion.div variants={field}>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: T.labelColor }}>
                    Password
                  </label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: `${T.accent}80` }} />
                    <input
                      {...register('password')}
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-11 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{ background: T.inputBg, border: `1.5px solid ${errors.password ? '#EF5350' : T.inputBorder}`, color: '#1A237E' }}
                      onFocus={onFocus}
                      onBlur={(e) => onBlur(e, !!errors.password)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: `${T.accent}70` }}
                    >
                      {showPw ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {errors.password && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs mt-1 text-red-500">
                        {errors.password.message}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Password Strength Checklist */}
                  {passwordVal && (
                    <div className="mt-2.5 p-3 rounded-xl bg-blue-50/60 border border-blue-100/80 text-xs space-y-1">
                      <p className="font-semibold text-gray-700 mb-1">Password Requirements:</p>
                      <div className="grid grid-cols-1 gap-1">
                        {rules.map((rule, idx) => (
                          <div key={idx} className={`flex items-center gap-1.5 ${rule.met ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {rule.met ? <FiCheck className="w-3.5 h-3.5 shrink-0" /> : <FiX className="w-3.5 h-3.5 shrink-0" />}
                            <span>{rule.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* Submit button */}
                <motion.div variants={field} className="pt-2">
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={loading ? {} : { scale: 1.02, boxShadow: `0 10px 32px ${T.accent}45` }}
                    whileTap={loading ? {} : { scale: 0.97 }}
                    className="w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 rounded-xl text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: `linear-gradient(135deg,${T.accent},${T.accentAlt})`, boxShadow: `0 4px 18px ${T.accent}40` }}
                  >
                    {loading ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }} className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full" />
                        Creating Account…
                      </>
                    ) : (
                      <>
                        Create Student Account
                        <FiArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </motion.div>

              </motion.div>
            </form>

            <p className="text-center text-sm mt-6 text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="font-bold hover:underline" style={{ color: T.accent }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
