# CollegeEvents — Frontend Compatibility & Contract Preservation Guide

> **Target Goal:** Zero code modifications to the existing React 18 / Vite / Tailwind frontend.  
> **Key Finding:** The React client relies on specific HTTP headers, error codes, response wrappers, binary endpoints, Server-Sent Events, and native STOMP WebSocket frames. Every contract detailed below must be preserved exactly by the Node.js / Express backend.

---

## 1. Network Transport & Proxy Configuration

### 1.1 Vite Dev Server Proxy Rules (`frontend/vite.config.js`)
```javascript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
      secure: false
    },
    '/uploads': {
      target: 'http://localhost:8080',
      changeOrigin: true,
      secure: false,
      rewrite: (path) => '/api' + path
    }
  }
}
```
**Backend Requirement:**
1. The Express server MUST listen on port `8080` (or `PORT` environment variable).
2. All REST and streaming endpoints MUST be mounted under the `/api` prefix (e.g. `app.use('/api', masterRouter)`).
3. Uploaded files must be served from both `http://localhost:8080/uploads/*` and `http://localhost:8080/api/uploads/*` (or rewrite handled by Express static middleware).

---

## 2. Global Client Layer & Interceptor Contracts (`frontend/src/services/api.js`)

### 2.1 Request Interceptor
The frontend automatically injects the JWT bearer token into the `Authorization` header:
```javascript
const token = localStorage.getItem('eb_token');
if (token) config.headers.Authorization = `Bearer ${token}`;
```
**Backend Requirement:** The Express `auth.middleware.js` must parse `req.headers.authorization` starting with `Bearer `.

### 2.2 Response Interceptor: Silent Token Refresh Flow
When a token expires, the React frontend executes an automated silent renewal without user disruption:
```javascript
if (status === 401 && data?.errorCode === 'TOKEN_EXPIRED' && !config._retry) {
  config._retry = true;
  const refreshToken = localStorage.getItem('eb_refresh_token');
  const { data: res } = await api.post('/auth/refresh-token', { refreshToken });
  const payload = res.data?.data ?? res.data;
  // expects payload to contain { accessToken, refreshToken, expiresAt, expiresIn }
  localStorage.setItem('eb_token', accessToken);
  if (newRefresh) localStorage.setItem('eb_refresh_token', newRefresh);
  // updates auto-logout timer
  return api(config); // retries original request
}
```
**CRITICAL Non-Negotiable Contract:**
- On expired access tokens, the backend MUST respond with HTTP `401 Unauthorized` and the exact JSON payload:
  ```json
  {
    "errorCode": "TOKEN_EXPIRED",
    "status": 401,
    "message": "Access token expired",
    "timestamp": "2026-10-10T12:00:00Z",
    "path": "/api/..."
  }
  ```
- `POST /api/auth/refresh-token` MUST accept `{ "refreshToken": "<jwt>" }` and return:
  ```json
  {
    "success": true,
    "message": "Token refreshed successfully",
    "data": {
      "accessToken": "<new_jwt>",
      "refreshToken": "<new_refresh_jwt>",
      "tokenType": "Bearer",
      "expiresIn": 3600000,
      "expiresAt": 1720448400000
    }
  }
  ```

### 2.3 Expiry Header Injection
```javascript
response.setHeader("X-Token-Expiry", String.valueOf(expiryMs));
```
**Backend Requirement:** On every authenticated response, the Express server must inject the `X-Token-Expiry` header containing the millisecond timestamp when the access token expires.

### 2.4 Error Envelope & Toast Suppression
The frontend helper `getApiErrorMessage` expects:
```javascript
data.message || data.error || fallback
// and if data.errors exists:
Object.entries(data.errors).map(([field, message]) => `${field}: ${message}`).join(', ')
```
Background polling endpoints (`/notifications/unread`, `/chat/unread`, `/ai/chat/sessions`) suppress error toasts so transient network dips do not trigger popup spam.

---

## 3. Session & Storage Contracts (`frontend/src/context/AuthContext.jsx`)

The React application stores user identity and session states across four `localStorage` keys:
| Storage Key | Format / Content | Purpose |
|---|---|---|
| `eb_token` | Raw JWT string | Access token attached to `Authorization: Bearer <token>` |
| `eb_refresh_token`| Raw JWT string | Long-lived refresh token used by Axios interceptor |
| `eb_user` | Stringified JSON object: `{ id, name, email, role, profilePicture, emailVerified }` | Restores user context and navigation permissions |
| `eb_expires_at` | Numeric string (epoch ms, e.g. `"1720448400000"`) | Drives the auto-logout warning and countdown timers |

---

## 4. Real-Time & Streaming Protocols

### 4.1 Native STOMP-over-WebSocket Protocol (`/api/ws-native`)
The existing React frontend connects directly using the browser's native `new WebSocket(...)` in three components:
1. `frontend/src/pages/user/Networking.jsx` (Line 472):
   ```javascript
   const ws = new WebSocket(directChatAPI.wsUrl()); // ws(s)://<host>/api/ws-native
   ws.onopen = () => {
     ws.send(stompFrame('CONNECT', {
       'accept-version': '1.1,1.2',
       'heart-beat': '10000,10000',
       'Authorization': `Bearer ${token}`
     }));
   };
   ```
   - Subscribes to: `/queue/users/${userId}/chat`
   - Expects inbound frames: `MESSAGE` with JSON body `{ action: "created"|"updated"|"deletedForMe", message: { ... } }`
2. `frontend/src/components/common/EventCommunityChat.jsx` (Line 64):
   - Connects to: `/api/ws-native`
   - Subscribes to: `/topic/events/${eventId}/community`
   - Sends to: `/app/events/${eventId}/community`
   - Expects inbound frames: `MESSAGE` with JSON body `{ action: "created"|"updated"|"deleted", message: { ... } }`
3. `frontend/src/pages/organizer/AttendanceScanner.jsx` (Line 239):
   - Connects to: `/api/ws-native`
   - Subscribes to: `/topic/scanner-relay/${eventId}/${sessionId}`
   - Expects inbound frames: `MESSAGE` with JSON body `{ ticketId: "EVT-...", device: "...", eventId: ... }`

**Compatibility Rule:** The Node.js backend MUST implement a STOMP 1.2 protocol emulator on the WebSocket server mounted at `/api/ws-native`. Standard Socket.IO alone will cause these components to throw connection errors.

### 4.2 Server-Sent Events (SSE) Streaming
1. **In-App Notifications (`frontend/src/pages/user/Notifications.jsx`):**
   - URL: `/api/notifications/stream?token=<jwt_access_token>`
   - Protocol: Native `EventSource`
   - Emits: Standard SSE messages with event name `notification` and JSON payload.
2. **AI Copilot Streaming (`frontend/src/pages/organizer/Copilot.jsx`):**
   - URL: `/api/ai/copilot/stream?message=...&sessionId=...`
   - Invocation: `fetch(...)` with `Authorization: Bearer <token>`
   - Emits chunk sequence:
     - `event: session` -> data: `<sessionId>`
     - `event: token` -> data: `<text_chunk>`
     - `event: done` -> data: `[DONE]`
     - `event: error` -> data: `<error_message>`

---

## 5. Page-by-Page Frontend Contract Inventory

| Page / Component | Endpoint(s) Invoked | Method | Payload / Query | Expected Data Structure |
|---|---|---|---|---|
| **Landing** (`Landing.jsx`) | `/events/featured`<br>`/events/categories` | GET | None | `data: [ EventResponse ]`<br>`data: [ "HACKATHON", ... ]` |
| **Discover** (`Discover.jsx`) | `/recommendations/discover`<br>`/events/featured` | GET | `?lat=...&lon=...` | `data: { recommended: [], trending: [], nearYou: [], popular: [], aiPicks: [] }` |
| **Events** (`Events.jsx`) | `/events` | GET | 18 query parameters | `data: { content: [ EventResponse ], totalPages, totalElements, ... }` |
| **EventDetail** (`EventDetail.jsx`) | `/events/:id`<br>`/ratings/events/:id/summary`<br>`/ratings/events/:id/my`<br>`/ratings/events/:id/eligibility`<br>`/bookings` | GET<br>GET<br>GET<br>GET<br>POST | Path `id`<br>Body: `BookingRequest` | Detailed event card, rating statistics, feedback permissions, confirmed booking object |
| **TravelDashboard** (`TravelDashboard.jsx`) | `/ai/eventgpt/events/:id/qa`<br>`/ai/events/:id/travel` | POST<br>GET | Direct `fetch` with `{ question }` | `data: { answer: "..." }` or `{ answer: "..." }` |
| **BookingDetail** (`BookingDetail.jsx`) | `/bookings/:id`<br>`/payments/bookings/:id/razorpay/order`<br>`/payments/bookings/:id/razorpay/verify`<br>`/bookings/:id/cancel` | GET<br>POST<br>POST<br>PATCH | Path `id`<br>Body: `RazorpayVerifyRequest`<br>`?reason=...` | Booking metadata, Razorpay order object, payment confirmation, cancellation status |
| **MyBookings** (`MyBookings.jsx`) | `/bookings` | GET | `?page=...&size=...` | `data: { content: [ BookingResponse ], ... }` |
| **AttendanceScanner** (`AttendanceScanner.jsx`) | `/attendance/scan`<br>`/events/:id/attendance/stats`<br>`/attendance/events/:id/bookings/:bookingId/present` | POST<br>GET<br>PATCH | Body: `{ eventId, ticketId, scanMethod }` | Attendance confirmation, live percentages |
| **Certificates** (`Certificates.jsx` - User) | `/certificates/my`<br>`/certificates/download/:id` | GET<br>GET | Path `id` | `data: { content: [ Certificate ] }`<br>Binary PDF blob |
| **VerifyCertificate** (`VerifyCertificate.jsx`)| `/certificates/verify/:id` | GET | Path `id` | Public verification record `{ recipientName, eventName, issuedAt, ... }` |
| **Copilot** (`Copilot.jsx` - Organizer) | `/ai/copilot/persona`<br>`/ai/copilot/sessions`<br>`/ai/copilot/chat`<br>`/ai/copilot/stream` | GET<br>GET<br>POST<br>GET (SSE) | Query: `?message=...` | Persona attributes, past sessions, full AI reply, token stream |
| **ChatbotWidget** (`ChatbotWidget.jsx`) | `/ai/chat`<br>`/ai/chat/sessions` | POST<br>GET | Body: `{ message, history, sessionId }` | `{ sessionId, answer, provider }` |
| **Networking** (`Networking.jsx`) | `/networking/suggestions`<br>`/networking/connect/:id`<br>`/networking/:id/respond`<br>`/networking/my-connections`<br>`/networking/pending`<br>`/chat/:otherId`<br>`/chat/:id/voice` | GET<br>POST<br>PATCH<br>GET<br>GET<br>GET<br>POST | Multipart audio | Peer matches, direct chat history, voice audio recording |
| **Organizer Dashboard** (`Dashboard.jsx`) | `/organizer/dashboard`<br>`/organizer/analytics` | GET | None | Aggregated registration revenue, upcoming events, AI performance advice |
| **Admin Approvals** (`Approvals.jsx`) | `/admin/approvals`<br>`/admin/events/:id/review` | GET<br>POST | `{ decision: "APPROVE", reason }` | Paginated approval queue, updated event status |

---

## 6. Non-Negotiable Contract Checkpoints Summary

1. **Numeric ID Equality:** All primary identifiers (`user.id`, `event.id`, `booking.id`, `certificate.id`) MUST serialize as numbers (e.g. `42`), not 24-character hexadecimal MongoDB ObjectId strings.
2. **Envelope Wrapping:** Standard JSON endpoints MUST return the envelope `{ success: true, message: "...", data: ... }`. Direct unwrapping occurs in Axios interceptors via `res.data?.data ?? res.data`.
3. **HTTP 401 & `TOKEN_EXPIRED`:** Expirations must return `status: 401` and `data.errorCode: "TOKEN_EXPIRED"`.
4. **Header `X-Token-Expiry`:** Must be present on authenticated responses to keep UI session timers synchronized.
5. **Binary Responses:** PDF certificate downloads and CSV participant exports must return binary byte streams with proper `Content-Type` and `Content-Disposition` headers.
6. **STOMP Protocol:** Native WebSocket at `/api/ws-native` must accept standard STOMP frames and dispatch to `/topic/...` and `/queue/...`.
7. **Multipart Form Field Names:** File uploads must look for specific form fields: `"file"` (banner, logo, picture, template), `"audio"` (voice notes).
