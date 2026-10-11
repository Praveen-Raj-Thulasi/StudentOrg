import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { motion, AnimatePresence } from 'framer-motion';
import * as yup from 'yup';
import { userAPI, membershipAPI, duesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import {
  FiSave, FiLock, FiUser, FiPhone, FiMapPin, FiEye, FiEyeOff,
  FiAlertTriangle, FiEdit3, FiCalendar, FiCreditCard, FiAward,
  FiShield, FiBell, FiSettings, FiCheckCircle, FiCamera,
} from 'react-icons/fi';
import { MdVerified } from 'react-icons/md';
import { format } from 'date-fns';

/* ── validation ─────────────────────────────────────────── */
const profileSchema = yup.object({
  name:    yup.string().min(2).max(120).required('Name is required'),
  phone:   yup.string().transform(v=>v||null).nullable()
               .test('ph','Invalid phone',v=>!v||/^[+]?[0-9]{7,15}$/.test(v)),
  address: yup.string().max(300).nullable().transform(v=>v||null),
  organizationName: yup.string().max(160).nullable().transform(v=>v||null),
  city:    yup.string().max(100).nullable().transform(v=>v||null),
  state:   yup.string().max(100).nullable().transform(v=>v||null),
  country: yup.string().max(100).nullable().transform(v=>v||null),
  pinCode: yup.string().max(20).nullable().transform(v=>v||null),
  gender:  yup.string().nullable().transform(v=>v||null),
});
const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
const pwSchema = yup.object({
  currentPassword: yup.string().required('Required'),
  newPassword:     yup.string().matches(PW_REGEX,'8+ chars, uppercase, number & symbol').required(),
  confirmPassword: yup.string().oneOf([yup.ref('newPassword')],'Passwords do not match').required(),
});

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMMM yyyy'); } catch { return d; }
}
function pwStrength(pw='') {
  let s=0;
  if(pw.length>=8)s++; if(/[A-Z]/.test(pw))s++;
  if(/[0-9]/.test(pw))s++; if(/[@$!%*?&]/.test(pw))s++;
  if(pw.length>=12)s++; return s;
}
const SL=['','Weak','Fair','Good','Strong','Excellent'];
const SC=['','#EF5350','#FF9800','#FFCA28','#66BB6A','#00897B'];

/* ── nav config ─────────────────────────────────────────── */
const NAV = [
  { id:'overview',      label:'Profile Overview', icon:<FiUser/> },
  { id:'membership',    label:'Club Membership',  icon:<MdVerified/> },
  { id:'edit',          label:'Edit Profile',     icon:<FiEdit3/> },
  { id:'bookings',      label:'Bookings',         icon:<FiCalendar/>,   href:'/bookings' },
  { id:'payments',      label:'Payments',         icon:<FiCreditCard/>, href:'/payments' },
  { id:'certificates',  label:'Certificates',     icon:<FiAward/>,      href:'/certificates' },
  { id:'security',      label:'Security',         icon:<FiShield/> },
  { id:'notifications', label:'Notifications',    icon:<FiBell/>,       href:'/notifications' },
  { id:'preferences',   label:'Preferences',      icon:<FiSettings/> },
];

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-500 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><FiAlertTriangle className="w-3 h-3"/>{error}</p>}
    </div>
  );
}
function InfoRow({ label, value, green }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="w-32 shrink-0 text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${green ? 'text-emerald-600 font-bold' : 'text-slate-800'}`}>{value || '—'}</span>
    </div>
  );
}

/* ── Avatar with upload ─────────────────────────────────── */
function AvatarUploader({ profile, onUpload }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef(null);
  const handle = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5*1024*1024) { toast.error('Image must be under 5 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Only images allowed'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await userAPI.uploadPicture(fd);
      onUpload(res.data?.data);
      toast.success('Photo updated!');
    } catch {} finally { setUploading(false); }
  };
  return (
    <div className="relative w-20 h-20">
      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md flex items-center justify-center text-white text-2xl font-bold cursor-pointer"
        style={{ background: 'linear-gradient(135deg,#0f766e,#1565C0)' }}
        onClick={() => ref.current?.click()}>
        {profile?.profilePicture
          ? <img src={profile.profilePicture} alt="" className="w-full h-full object-cover"/>
          : profile?.name?.charAt(0)?.toUpperCase()}
        {uploading && <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
          <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:0.8,ease:'linear'}}
            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"/>
        </div>}
      </div>
      <button type="button" onClick={() => ref.current?.click()}
        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white shadow">
        <FiCamera className="w-3 h-3"/>
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle}/>
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────── */
function OverviewPanel({ profile }) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-900 mb-4">Personal Information</h3>
        <InfoRow label="Full Name"    value={profile?.name} />
        <InfoRow label="Email"        value={profile?.email} />
        <InfoRow label="Phone"        value={profile?.phone} />
        <InfoRow label="Role"         value={Array.isArray(profile?.roles) ? profile.roles.join(', ') : profile?.role} />
        <InfoRow label="Member Since" value={fmtDate(profile?.createdAt)} />
        <InfoRow label="Member ID"    value={profile ? (profile.memberNumber || profile.userCode || '—') : 'Loading...'} green />
        {profile?.userCode && profile?.memberNumber && profile?.userCode !== profile?.memberNumber && (
          <InfoRow label="User Code"  value={profile.userCode} />
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-900 mb-4">Quick Stats</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Bookings',     icon:<FiCalendar className="w-4 h-4 text-teal-600"/>,    to:'/bookings' },
            { label:'Payments',     icon:<FiCreditCard className="w-4 h-4 text-blue-600"/>,  to:'/payments' },
            { label:'Certificates', icon:<FiAward className="w-4 h-4 text-amber-500"/>,      to:'/certificates' },
          ].map(s => (
            <Link key={s.label} to={s.to}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 py-4 hover:bg-teal-50 hover:border-teal-200 transition-colors">
              {s.icon}
              <span className="text-xs font-semibold text-slate-600">{s.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Edit ───────────────────────────────────────────────── */
function EditPanel({ profile, refetch }) {
  const { updateUser } = useAuth();
  const qc = useQueryClient();
  const { register, handleSubmit, formState:{ errors, isDirty }, reset } = useForm({
    resolver: yupResolver(profileSchema),
    defaultValues: { name:'', phone:'', address:'', organizationName:'', city:'', state:'', country:'', pinCode:'', gender:'' },
  });
  useEffect(() => {
    if (profile) reset({ name:profile.name||'', phone:profile.phone||'', address:profile.address||'',
      organizationName:profile.organizationName||'', city:profile.city||'', state:profile.state||'',
      country:profile.country||'', pinCode:profile.pinCode||'', gender:profile.gender||'' });
  }, [profile, reset]);

  const mut = useMutation(d => userAPI.updateProfile(d), {
    onSuccess: res => {
      const d = res.data?.data;
      updateUser({ name:d?.name, profilePicture:d?.profilePicture });
      qc.invalidateQueries('user-profile');
      toast.success('Profile saved!');
      reset({ name:d?.name||'', phone:d?.phone||'', address:d?.address||'', organizationName:d?.organizationName||'',
        city:d?.city||'', state:d?.state||'', country:d?.country||'', pinCode:d?.pinCode||'', gender:d?.gender||'' });
    },
    onError: err => toast.error(err?.response?.data?.message||'Failed to save'),
  });

  const onAvatarUpload = url => { updateUser({ profilePicture:url }); qc.invalidateQueries('user-profile'); };

  return (
    <form onSubmit={handleSubmit(d => mut.mutate(d))}>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
          <AvatarUploader profile={profile} onUpload={onAvatarUpload}/>
          <div>
            <p className="font-semibold text-slate-800">{profile?.name}</p>
            <p className="text-xs text-slate-400">{profile?.email}</p>
          </div>
        </div>
        <h3 className="font-bold text-slate-900">Edit Profile</h3>
        <Field label="Full Name" error={errors.name?.message}><input {...register('name')} className="input-field" placeholder="Your name"/></Field>
        <Field label="Phone" error={errors.phone?.message}><input {...register('phone')} className="input-field" placeholder="+91 9876543210"/></Field>
        <Field label="Organization" error={errors.organizationName?.message}><input {...register('organizationName')} className="input-field" placeholder="College / company"/></Field>
        <Field label="Address" error={errors.address?.message}><input {...register('address')} className="input-field" placeholder="Address"/></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="City"    error={errors.city?.message}><input {...register('city')}    className="input-field" placeholder="City"/></Field>
          <Field label="State"   error={errors.state?.message}><input {...register('state')}   className="input-field" placeholder="State"/></Field>
          <Field label="Country" error={errors.country?.message}><input {...register('country')} className="input-field" placeholder="Country"/></Field>
          <Field label="PIN"     error={errors.pinCode?.message}><input {...register('pinCode')} className="input-field" placeholder="PIN code"/></Field>
        </div>
        <Field label="Gender" error={errors.gender?.message}>
          <select {...register('gender')} className="input-field">
            <option value="">Select…</option>
            <option>Male</option><option>Female</option><option>Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </Field>
        <button type="submit" disabled={mut.isLoading||!isDirty}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <FiSave className="w-4 h-4"/>{mut.isLoading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

/* ── Security ───────────────────────────────────────────── */
function SecurityPanel() {
  const [show, setShow] = useState({ cur:false, nw:false, cn:false });
  const { register, handleSubmit, formState:{errors}, reset, watch } = useForm({ resolver:yupResolver(pwSchema) });
  const pw = watch('newPassword','');
  const str = pwStrength(pw);
  const mut = useMutation(
    d => userAPI.changePassword({ currentPassword:d.currentPassword, newPassword:d.newPassword }),
    { onSuccess:()=>{ toast.success('Password changed!'); reset(); },
      onError: err => toast.error(err?.response?.data?.message||'Failed') }
  );
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <h3 className="font-bold text-slate-900">Change Password</h3>
      <form onSubmit={handleSubmit(d=>mut.mutate(d))} className="space-y-4">
        {[['currentPassword','Current Password','cur'],['newPassword','New Password','nw'],['confirmPassword','Confirm Password','cn']].map(([key,lbl,sk])=>(
          <Field key={key} label={lbl} error={errors[key]?.message}>
            <div className="relative">
              <input {...register(key)} type={show[sk]?'text':'password'} className="input-field pr-10" placeholder="••••••••"/>
              <button type="button" onClick={()=>setShow(s=>({...s,[sk]:!s[sk]}))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show[sk]?<FiEyeOff className="w-4 h-4"/>:<FiEye className="w-4 h-4"/>}
              </button>
            </div>
          </Field>
        ))}
        {pw.length>0 && (
          <div className="space-y-1">
            <div className="flex gap-1">{[1,2,3,4,5].map(i=>(
              <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{background:i<=str?SC[str]:'#E2E8F0'}}/>
            ))}</div>
            <p className="text-xs font-semibold" style={{color:SC[str]}}>{SL[str]}</p>
          </div>
        )}
        <button type="submit" disabled={mut.isLoading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <FiLock className="w-4 h-4"/>{mut.isLoading?'Updating…':'Update Password'}
        </button>
      </form>
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <FiCheckCircle className="w-4 h-4 text-emerald-500"/>
        <span className="text-xs text-slate-500">JWT session active · auto-refresh enabled</span>
      </div>
    </div>
  );
}

function PreferencesPanel() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="font-bold text-slate-900 mb-3">Preferences</h3>
      <p className="text-sm text-slate-400">Notification and display preferences will appear here.</p>
    </div>
  );
}

/* ── Membership Panel ────────────────────────────────────── */
function MembershipPanel({ profile }) {
  const qc = useQueryClient();
  const { data: membershipData, isLoading, refetch } = useQuery(
    'my-membership',
    () => membershipAPI.getMy().then((r) => r.data?.data),
    { refetchOnWindowFocus: false }
  );

  const [statement, setStatement] = useState('');
  const [department, setDepartment] = useState(profile?.organizationName || '');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payingDuesId, setPayingDuesId] = useState(null);

  const handleApply = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await membershipAPI.apply({ statement, department, yearOfStudy });
      toast.success('Membership application submitted for review!');
      refetch();
      qc.invalidateQueries('my-membership');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayDues = async (duesId) => {
    setPayingDuesId(duesId);
    try {
      const orderRes = await duesAPI.createOrder(duesId);
      const orderData = orderRes.data?.data || orderRes.data;

      if (orderData.displayAmount === 0 || orderData.status === 'PAID') {
        toast.success('Membership dues settled successfully! Membership updated.');
        refetch();
        qc.invalidateQueries('my-membership');
        return;
      }

      const loadRazorpayScript = () => {
        return new Promise((resolve) => {
          if (window.Razorpay) return resolve(true);
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.body.appendChild(s);
        });
      };

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        toast.error('Unable to initialize payment gateway.');
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Skyline Student Association',
        description: orderData.title || 'Membership Dues',
        order_id: orderData.orderId,
        handler: async (resp) => {
          try {
            await duesAPI.verify(duesId, {
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            });
            toast.success('Membership dues settled successfully! Membership updated.');
            refetch();
            qc.invalidateQueries('my-membership');
          } catch (err) {
            toast.error(err.response?.data?.message || 'Payment verification failed');
          }
        },
        theme: {
          color: '#4f46e5',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        toast.error(resp.error?.description || 'Payment failed');
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initiate dues payment');
    } finally {
      setPayingDuesId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Loading membership details...
      </div>
    );
  }

  const status = membershipData?.status || 'NOT_APPLIED';
  const dues = membershipData?.dues || { totalAssessed: 0, totalPaid: 0, outstandingBalance: 0, items: [] };

  const statusBadge = {
    NOT_APPLIED: { bg: 'bg-slate-100 text-slate-700', label: 'Not Applied' },
    PENDING:     { bg: 'bg-amber-100 text-amber-800', label: 'Under Review' },
    APPROVED:    { bg: 'bg-blue-100 text-blue-800', label: 'Approved (Pending Dues)' },
    ACTIVE:      { bg: 'bg-emerald-100 text-emerald-800', label: 'Active Member' },
    REJECTED:    { bg: 'bg-red-100 text-red-800', label: 'Application Rejected' },
    SUSPENDED:   { bg: 'bg-rose-100 text-rose-800', label: 'Suspended' },
    EXPIRED:     { bg: 'bg-gray-100 text-gray-800', label: 'Expired' },
  }[status] || { bg: 'bg-slate-100 text-slate-700', label: status };

  return (
    <div className="space-y-6">
      {/* Association Status Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Skyline Student Association Membership</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Member ID: <span className="font-semibold text-emerald-700">{membershipData?.memberNumber || profile?.memberNumber || '—'}</span>
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadge.bg}`}>
            {statusBadge.label}
          </span>
        </div>

        {status === 'ACTIVE' && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <MdVerified className="h-6 w-6 text-emerald-600" />
              <div>
                <p className="font-bold text-emerald-900">Official Association Member</p>
                <p className="text-xs text-emerald-700">
                  Your membership is active and in good standing.
                  {membershipData?.validUntil && ` Valid until ${new Date(membershipData.validUntil).toLocaleDateString()}.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {status === 'APPROVED' && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="font-bold text-blue-900">Application Approved by President</p>
            <p className="text-xs text-blue-700 mt-1">
              Please settle any outstanding membership dues below to complete active onboarding.
            </p>
          </div>
        )}

        {status === 'PENDING' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-bold text-amber-900">Application Under Review</p>
            <p className="text-xs text-amber-700 mt-1">
              Your application was received on {membershipData?.appliedAt ? new Date(membershipData.appliedAt).toLocaleDateString() : 'recently'}. The President is reviewing your submission.
            </p>
          </div>
        )}

        {status === 'REJECTED' && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-bold text-red-900">Application Decision</p>
            <p className="text-xs text-red-700 mt-1">
              {membershipData?.rejectionReason || 'Your application was not approved at this time.'}
            </p>
          </div>
        )}
      </div>

      {/* Application Form (Visible if NOT_APPLIED or REJECTED) */}
      {(status === 'NOT_APPLIED' || status === 'REJECTED') && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-bold text-slate-900">Apply for Student Association Membership</h4>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Join the Skyline Student Association to access exclusive events, governance voting, and club opportunities.
          </p>
          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Academic Department / Major</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science & Engineering"
                className="input-field w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Year of Study</label>
              <input
                type="text"
                value={yearOfStudy}
                onChange={(e) => setYearOfStudy(e.target.value)}
                placeholder="e.g. 2nd Year / Class of 2027"
                className="input-field w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Statement of Interest</label>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={3}
                placeholder="Tell the association about your interests, clubs you want to participate in, and why you wish to join..."
                className="input-field w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {submitting ? 'Submitting Application...' : 'Submit Membership Application'}
            </button>
          </form>
        </div>
      )}

      {/* Dues & Obligations Ledger */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h4 className="text-lg font-bold text-slate-900">Membership Dues & Financial Obligations</h4>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">
              Outstanding: <span className="text-sm font-bold text-slate-900">₹{dues.outstandingBalance}</span>
            </span>
            <span className="text-xs font-semibold text-slate-500">
              Total Paid: <span className="text-sm font-bold text-emerald-600">₹{dues.totalPaid}</span>
            </span>
          </div>
        </div>

        {dues.items.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No dues assessed on this account.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {dues.items.map((item) => (
              <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                  <p className="text-xs text-slate-400">
                    Term: {item.academicTerm} · Due: {new Date(item.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-900 text-sm">₹{item.amount}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      item.status === 'PAID'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'WAIVED'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.status}
                  </span>
                  {(item.status === 'PENDING' || item.status === 'OVERDUE') && (
                    <button
                      type="button"
                      disabled={payingDuesId === item.id}
                      onClick={() => handlePayDues(item.id)}
                      className="btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    >
                      {payingDuesId === item.id ? 'Processing...' : 'Pay Dues'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────── */
export default function UserProfile() {
  const [active, setActive] = useState('overview');
  const { data:profile, isLoading, refetch } = useQuery(
    'user-profile',
    () => userAPI.getProfile().then(r => r.data?.data),
    { retry:1, staleTime:30_000 }
  );

  if (isLoading) return (
    <div style={{background:'#F8FAFC',minHeight:'100vh'}} className="px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="skeleton h-8 w-40 rounded-xl"/>
        <div className="skeleton h-28 rounded-2xl"/>
        <div className="grid lg:grid-cols-[240px_1fr] gap-5">
          <div className="skeleton h-80 rounded-2xl"/>
          <div className="skeleton h-80 rounded-2xl"/>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{background:'#F8FAFC',minHeight:'100vh'}} className="px-4 sm:px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-5">

        <h1 className="text-2xl font-extrabold text-slate-900" style={{fontFamily:'Space Grotesk,sans-serif'}}>
          My Profile
        </h1>

        {/* Top identity bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Avatar — clicking switches to edit tab so user can change it */}
            <div className="relative cursor-pointer group" onClick={() => setActive('edit')}
              title="Click to change photo">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md flex items-center justify-center text-white text-2xl font-bold"
                style={{background:'linear-gradient(135deg,#0f766e,#1565C0)'}}>
                {profile?.profilePicture
                  ? <img src={profile.profilePicture} alt="" className="w-full h-full object-cover"/>
                  : profile?.name?.charAt(0)?.toUpperCase()}
              </div>
              {/* Subtle hover overlay instead of persistent red button */}
              <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <FiCamera className="w-5 h-5 text-white"/>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{profile?.name}</h2>
              <p className="text-sm text-slate-400 mt-0.5">{profile?.email}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {profile?.emailVerified
                  ? <><MdVerified className="w-3.5 h-3.5"/>Active</>
                  : <><FiAlertTriangle className="w-3.5 h-3.5"/>Unverified</>}
              </span>
            </div>
          </div>
          {/* ID card */}
          <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 min-w-[150px] text-center">
            <p className="text-xs text-slate-400 font-medium mb-1">My ID</p>
            <p className="text-2xl font-extrabold text-emerald-600 tracking-wide">{profile?.memberNumber || profile?.userCode || '—'}</p>
            <p className="text-xs text-slate-400 mt-0.5">Member Number</p>
          </div>
        </div>

        {/* Body */}
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">

          {/* Sidebar */}
          <nav className="bg-white rounded-2xl border border-slate-200 p-3 h-fit">
            {NAV.map(item => {
              const isActive = active === item.id;
              const cls = `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors w-full
                ${isActive ? 'bg-emerald-50 text-emerald-700 border-l-4 border-emerald-500' : 'text-slate-600 hover:bg-slate-50'}`;
              if (item.href) {
                return (
                  <Link key={item.id} to={item.href} className={cls.replace('w-full','')}>
                    <span className="text-slate-400">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              }
              return (
                <button key={item.id} type="button" onClick={() => setActive(item.id)} className={cls}>
                  <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div key={active}
              initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}}
              transition={{duration:0.2}}>
              {active==='overview'    && <OverviewPanel profile={profile}/>}
              {active==='membership'  && <MembershipPanel profile={profile}/>}
              {active==='edit'        && <EditPanel profile={profile} refetch={refetch}/>}
              {active==='security'    && <SecurityPanel/>}
              {active==='preferences' && <PreferencesPanel/>}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
