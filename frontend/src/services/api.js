import axios from 'axios';
import { toast } from 'react-toastify';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export function getApiErrorMessage(err, fallback = 'An unexpected error occurred') {
  const data = err?.response?.data;
  if (!data) return err?.message || fallback;
  if (data.message && data.errors && typeof data.errors === 'object') {
    const details = Object.entries(data.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(', ');
    return details ? `${data.message}: ${details}` : data.message;
  }
  return data.message || data.error || (typeof data === 'string' ? data : null) || fallback;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('eb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor ─────────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config || {};
    const silent = Boolean(config.silent || config._silent);

    if (!err.response) {
      if (silent) return Promise.reject(err);
      toast.error('⚠️ Network error — please check your connection.');
      return Promise.reject(err);
    }

    const { status, data } = err.response;
    // Silent token refresh on TOKEN_EXPIRED
    if (status === 401 && data?.errorCode === 'TOKEN_EXPIRED' && !config._retry) {
      config._retry = true;
      try {
        const refreshToken = localStorage.getItem('eb_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data: res } = await api.post('/auth/refresh-token', { refreshToken });
        const payload = res.data?.data ?? res.data;
        const { accessToken, refreshToken: newRefresh } = payload;

        localStorage.setItem('eb_token', accessToken);
        if (newRefresh) localStorage.setItem('eb_refresh_token', newRefresh);

        // Re-arm the auto-logout timer in AuthContext
        const expiresAt = payload.expiresAt || (payload.expiresIn ? Date.now() + payload.expiresIn : null);
        if (expiresAt) {
          localStorage.setItem('eb_expires_at', String(expiresAt));
          window.dispatchEvent(new CustomEvent('eb:token-refreshed', { detail: { expiresAt } }));
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        config.headers['Authorization'] = `Bearer ${accessToken}`;

        return api(config); // retry original request
      } catch {
        // Refresh failed — clear session and redirect
        localStorage.removeItem('eb_token');
        localStorage.removeItem('eb_refresh_token');
        localStorage.removeItem('eb_user');
        localStorage.removeItem('eb_expires_at');
        delete api.defaults.headers.common['Authorization'];
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }

    // Hard 401 (not TOKEN_EXPIRED) on a protected route — redirect to login
    if (status === 401 && !config._retry) {
      const isAuthRoute = (config?.url ?? '').includes('/auth/');
      if (!isAuthRoute && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('eb_token');
        localStorage.removeItem('eb_refresh_token');
        localStorage.removeItem('eb_user');
        localStorage.removeItem('eb_expires_at');
        window.location.href = '/login';
      }
    }

    const msg = getApiErrorMessage(err);

    // Don't toast on 401 auth routes (let the login form handle it)
    const isAuthEndpoint    = (config?.url ?? '').includes('/auth/');
    const isOtpEndpoint     = (config?.url ?? '').includes('/auth/otp/');
    // Payment endpoints handle their own toasts — suppress global toast for them
    const isPaymentEndpoint = (config?.url ?? '').includes('/payments/');
    // Background polling endpoints — suppress toast to avoid spam
    const isSilentEndpoint  = (config?.url ?? '').includes('/notifications/unread')
                           || (config?.url ?? '').includes('/chat/unread')
                           || (config?.url ?? '').includes('/ai/chat/sessions');
    if (!silent && status !== 404
        && !(status === 401 && isAuthEndpoint)
        && !isOtpEndpoint && !isPaymentEndpoint && !isSilentEndpoint) {
      toast.error(msg);
    }

    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────
export const authAPI = {
  userRegister:      (d) => api.post('/auth/user/register', d),
  userLogin:         (d) => api.post('/auth/user/login', d),
  organizerRegister: (d) => api.post('/auth/organizer/register', d),
  organizerLogin:    (d) => api.post('/auth/organizer/login', d),
  verifyEmail:       (token, role) => api.get(`/auth/verify-email?token=${token}&role=${role}`),
  forgotPassword:    (d) => api.post('/auth/forgot-password', d),
  resetPassword:     (d) => api.post('/auth/reset-password', d),
  resetPasswordWithOtp: (d) => api.post('/auth/reset-password/otp', d),
  refreshToken:      (d) => api.post('/auth/refresh-token', d),
  sendOtp:           (d) => api.post('/auth/otp/send', d),
  verifyOtp:         (d) => api.post('/auth/otp/verify', d),
};

// ── Events ───────────────────────────────────────────────────────────
export const eventsAPI = {
  search:      (p)     => api.get('/events', { params: p }),
  featured:    ()      => api.get('/events/featured'),
  getById:     (id)    => api.get(`/events/${id}`),
  categories:  ()      => api.get('/events/categories'),
  create:      (d)     => api.post('/events', d),
  update:      (id, d) => api.put(`/events/${id}`, d),
  delete:      (id)    => api.delete(`/events/${id}`),
  cancel:      (id)    => api.patch(`/events/${id}/cancel`),
  publish:     (id)    => api.patch(`/events/${id}/publish`),
  myEvents:    (p, config = {}) => api.get('/events/my', { ...config, params: p }),
  uploadBanner:(id, f) => api.post(`/events/${id}/banner`, f, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadAuthorizedDocument:(id, f) => api.post(`/events/${id}/authorized-document`, f, { headers: { 'Content-Type': 'multipart/form-data' } }),
  eventQa:     (id, question) => api.post(`/ai/eventgpt/events/${id}/qa`, { question }),
};

// ── Bookings ──────────────────────────────────────────────────────────
export const bookingsAPI = {
  book:       (d)     => api.post('/bookings', d),
  myBookings: (p)     => api.get('/bookings', { params: p }),
  getById:    (id)    => api.get(`/bookings/${id}`),
  getByTicket:(tid)   => api.get(`/bookings/ticket/${tid}`),
  cancel:     (id, r) => api.patch(`/bookings/${id}/cancel`, null, { params: { reason: r } }),
};

export const helpAPI = {
  get:    (p)     => api.get('/help', { params: p }),
  faqs:   (p)     => api.get('/help/faqs', { params: p }),
  videos: ()      => api.get('/help/videos'),
  saveVideo: (id, d) => id ? api.put(`/help/videos/${id}`, d) : api.post('/help/videos', d),
  deleteVideo: (id) => api.delete(`/help/videos/${id}`),
};

export const paymentsAPI = {
  history: (p) => api.get('/payments', { params: p }),
  markProcessing: (bookingId, d) => api.post(`/payments/bookings/${bookingId}/processing`, d),
  markSuccess: (bookingId, d) => api.post(`/payments/bookings/${bookingId}/success`, d),
  markFailed: (bookingId, d) => api.post(`/payments/bookings/${bookingId}/failed`, d),
  createRazorpayOrder: (bookingId) => api.post(`/payments/bookings/${bookingId}/razorpay/order`),
  verifyRazorpay: (bookingId, d) => api.post(`/payments/bookings/${bookingId}/razorpay/verify`, d),
  refundsByPayment: (paymentId) => api.get(`/payments/${paymentId}/refunds`),
  myRefunds: () => api.get('/payments/refunds/my'),
};

export const adminAPI = {
  dashboard: () => api.get('/admin/dashboard'),
  approvals: (p) => api.get('/admin/approvals', { params: p }),
  reviewEvent: (eventId, d) => api.post(`/admin/events/${eventId}/review`, d),
  users: (p) => api.get('/admin/users', { params: p }),
  organizers: (p) => api.get('/admin/organizers', { params: p }),
  events: (p) => api.get('/admin/events', { params: p }),
  payments: (p) => api.get('/admin/payments', { params: p }),
  refunds: (p) => api.get('/admin/refunds', { params: p }),
  updateRefundStatus: (id, d) => api.patch(`/admin/refunds/${id}/status`, d),
  auditLogs: (p) => api.get('/admin/audit-logs', { params: p }),
};

// ── User ─────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile:     ()  => api.get('/user/profile'),
  updateProfile:  (d) => api.put('/user/profile', d),
  getLocation:    ()  => api.get('/user/profile/location'),
  updateLocation: (d) => api.put('/user/profile/location', d),
  uploadPicture:  (f) => api.post('/user/profile/picture', f, { headers: { 'Content-Type': 'multipart/form-data' } }),
  changePassword: (d) => api.patch('/user/change-password', d),
};

// ── Organizer ─────────────────────────────────────────────────────────
export const organizerAPI = {
  getProfile:     ()  => api.get('/organizer/profile'),
  updateProfile:  (d) => api.put('/organizer/profile', d),
  getLocation:    ()  => api.get('/organizer/profile/location'),
  updateLocation: (d) => api.put('/organizer/profile/location', d),
  uploadLogo:     (f) => api.post('/organizer/profile/logo', f, { headers: { 'Content-Type': 'multipart/form-data' } }),
  changePassword: (d) => api.patch('/organizer/change-password', d),
  getDashboard:   (config = {})  => api.get('/organizer/dashboard', config),
  participants:   ()  => api.get('/organizer/participants'),
  exportParticipants: (eventId) => api.get(`/organizer/events/${eventId}/participants/export`, { responseType: 'blob' }),
  generatePoster: (eventId) => api.post(`/organizer/events/${eventId}/poster`),
};

export const chatbotAPI = {
  ask: (message, history = [], sessionId) => api.post('/ai/chat', { message, history, sessionId }),
  sessions: () => api.get('/ai/chat/sessions'),
  legacyAsk: (message) => api.post('/chatbot', { message }),
};

// ── AI Features ───────────────────────────────────────────────────────
export const aiAPI = {
  nlpSearch:           (q)       => api.get('/ai/search', { params: { q } }),
  eventSummary:        (id)      => api.get(`/ai/events/${id}/summary`),
  travelInfo:          (id)      => api.get(`/ai/events/${id}/travel`),
  travelPlan:          (id)      => api.get(`/ai/eventgpt/events/${id}/travel-plan`),
  travelDetails:       (id)      => api.get(`/ai/eventgpt/events/${id}/travel`),
  eventGptStatus:      ()        => api.get('/ai/eventgpt/status'),
  eventQa:             (id, question) => api.post(`/ai/eventgpt/events/${id}/qa`, { question }),
  packingChecklist:    (id)      => api.get(`/ai/eventgpt/events/${id}/packing-checklist`),
  feedbackAnalysis:    (id)      => api.post(`/ai/eventgpt/events/${id}/feedback-analysis`),
  prediction:          (id)      => api.post(`/ai/eventgpt/events/${id}/prediction`),
  generateDescription: (prompt)  => api.post('/ai/events/generate-description', { prompt }),
  careerGuidance:      ()        => api.get('/ai/career-guidance'),
  agentTools:          ()        => api.get('/ai/agent/tools'),
  invokeAgent:         (d)       => api.post('/ai/agent/invoke', d),
  indexRag:            ()        => api.post('/ai/rag/index'),
};

// ── Recommendations ───────────────────────────────────────────────────
export const recommendationsAPI = {
  discover:        (lat, lon) => api.get('/recommendations/discover', { params: { lat, lon } }),
  getInterests:    ()         => api.get('/recommendations/interests'),
  updateInterests: (d)        => api.put('/recommendations/interests', d),
};

// ── Ratings ───────────────────────────────────────────────────────────
export const ratingsAPI = {
  submit:     (eventId, d) => api.post(`/ratings/events/${eventId}`, d),
  updateMine: (eventId, d) => api.put(`/ratings/events/${eventId}/my`, d),
  getByEvent: (eventId, p) => api.get(`/ratings/events/${eventId}`, { params: p }),
  getSummary: (eventId)    => api.get(`/ratings/events/${eventId}/summary`),
  getMyReview:(eventId)    => api.get(`/ratings/events/${eventId}/my`),
  eligibility:(eventId)    => api.get(`/ratings/events/${eventId}/eligibility`),
  moderate:   (id, status, note) => api.patch(`/ratings/${id}/moderate`, null, { params: { status, note } }),
};

// ── Certificates ──────────────────────────────────────────────────────
export const certificatesAPI = {
  my:       (p)   => api.get('/certificates/my', { params: p }),
  verify:   (id)  => api.get(`/certificates/verify/${id}`),
  download: (id)  => api.get(`/certificates/download/${id}`, { responseType: 'blob' }),
  forEvent: (eid) => api.get(`/certificates/events/${eid}`),
  participants: (eid, p) => api.get(`/certificates/events/${eid}/participants`, { params: p }),
  generate: (eid) => api.post(`/certificates/events/${eid}/generate`),
  generateMissing: (eid) => api.post(`/certificates/events/${eid}/generate-missing`),
  generateSelected: (eid, userIds) => api.post(`/certificates/events/${eid}/generate-selected`, { userIds }),
  release:  (eid) => api.post(`/certificates/events/${eid}/release`),
  revoke:   (id, reason) => api.patch(`/certificates/${id}/revoke`, { reason }),
  resendEmail: (id) => api.post(`/certificates/${id}/email`),
  uploadTemplate: (eid, f, signatureName) => api.post(`/certificates/events/${eid}/template`, f, {
    params: { signatureName },
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadSignature: (eid, f) => api.post(`/certificates/events/${eid}/signature`, f, { headers: { 'Content-Type': 'multipart/form-data' } }),
  admin:    (p) => api.get('/certificates/admin', { params: p }),
  adminStats: () => api.get('/certificates/admin/stats'),
  adminDelete: (id) => api.delete(`/certificates/admin/${id}`),
};

// ── Portfolio ─────────────────────────────────────────────────────────
export const portfolioAPI = {
  my: () => api.get('/portfolio/my'),
};

// ── Gamification ──────────────────────────────────────────────────────
export const gamificationAPI = {
  my: () => api.get('/gamification/my'),
};

// ── Organizer Analytics ───────────────────────────────────────────────
export const analyticsAPI = {
  organizer:   ()      => api.get('/organizer/analytics'),
  leaderboard: (limit) => api.get('/organizer/analytics/leaderboard', { params: { limit } }),
};

// ── AI Insights (Admin) ───────────────────────────────────────────────
export const aiInsightsAPI = {
  platform:       ()       => api.get('/ai/insights/platform'),
  fraud:          ()       => api.get('/ai/insights/fraud'),
  myBehavior:     ()       => api.get('/ai/insights/behavior/me'),
  refreshBehavior:(userId) => api.post(`/ai/insights/behavior/refresh/${userId}`),
};

// ── Networking ────────────────────────────────────────────────────────
export const networkingAPI = {
  suggestions:    ()           => api.get('/networking/suggestions'),
  connect:        (receiverId) => api.post(`/networking/connect/${receiverId}`),
  respond:        (id, status) => api.patch(`/networking/${id}/respond`, null, { params: { status } }),
  myConnections:  ()           => api.get('/networking/my-connections'),
  pending:        ()           => api.get('/networking/pending'),
};

// ── Direct Chat ────────────────────────────────────────────────────────
export const directChatAPI = {
  send:         (receiverId, content)           => api.post(`/chat/${receiverId}`, { content }),
  sendVoice:    (receiverId, formData)          => api.post(`/chat/${receiverId}/voice`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  edit:         (messageId, content)            => api.patch(`/chat/messages/${messageId}`, { content }, { silent: true }),
  deleteForMe:  (messageId)                     => api.delete(`/chat/messages/${messageId}`, { silent: true }),
  unsend:       (messageId)                     => api.delete(`/chat/messages/${messageId}/everyone`, { silent: true }),
  conversation: (otherId)                       => api.get(`/chat/${otherId}`),
  poll:         (otherId, lastId = 0)           => api.get(`/chat/${otherId}/poll`, { params: { lastId } }),
  unread:       ()                              => api.get('/chat/unread'),
  wsUrl:        ()                              => `${window.location.origin.replace(/^http/, 'ws')}/api/ws-native`,
};

export const eventCommunityAPI = {
  context:  (eventId) => api.get(`/events/${eventId}/community`),
  messages: (eventId, limit = 50) => api.get(`/events/${eventId}/community/messages`, { params: { limit } }),
  poll:     (eventId, afterId = 0) => api.get(`/events/${eventId}/community/messages/poll`, { params: { afterId } }),
  older:    (eventId, beforeId) => api.get(`/events/${eventId}/community/messages/older`, { params: { beforeId } }),
  send:     (eventId, payload) => api.post(`/events/${eventId}/community/messages`, typeof payload === 'string' ? { message: payload } : payload, { silent: true }),
  upload:   (eventId, formData) => api.post(`/events/${eventId}/community/messages/attachment`, formData, { silent: true, headers: { 'Content-Type': 'multipart/form-data' } }),
  edit:     (eventId, messageId, message) => api.patch(`/events/${eventId}/community/messages/${messageId}`, { message }, { silent: true }),
  delete:   (eventId, messageId) => api.delete(`/events/${eventId}/community/messages/${messageId}`, { silent: true }),
  pin:      (eventId, messageId, pinned = true) => api.patch(`/events/${eventId}/community/messages/${messageId}/pin`, null, { silent: true, params: { pinned } }),
  wsUrl:    () => `${window.location.origin.replace(/^http/, 'ws')}/api/ws-native`,
  sockJsUrl: () => `${window.location.origin}/api/ws`,
};

export const attendanceAPI = {
  scan: (eventId, ticketId, scanMethod) => api.post('/attendance/scan', { eventId, ticketId, scanMethod }),
  markPresent: (eventId, bookingId) => api.patch(`/attendance/events/${eventId}/bookings/${bookingId}/present`),
  forEvent: (eventId) => api.get(`/events/${eventId}/attendance`),
  forBooking: (bookingId) => api.get(`/bookings/${bookingId}/attendance`),
  stats: (eventId) => api.get(`/events/${eventId}/attendance/stats`),
  relay: (eventId, sessionId, ticketId, device) =>
    api.post(`/attendance/relay/${eventId}/${sessionId}`, { ticketId, device }),
};

// ── Notifications ─────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll:      (p) => api.get('/notifications', { params: p }),
  getUnread:   ()  => api.get('/notifications/unread', { silent: true }),
  markAllRead: ()  => api.patch('/notifications/read-all'),
  streamUrl:   ()  => `${api.defaults.baseURL}/notifications/stream?token=${encodeURIComponent(localStorage.getItem('eb_token') || '')}`,
};

export default api;
