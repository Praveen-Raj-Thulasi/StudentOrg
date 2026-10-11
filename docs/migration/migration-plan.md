# CollegeEvents — Backend Migration Plan & Phased Roadmap

> **Migration Target:** Node.js 20+ LTS, Express (ES modules), MongoDB 7 / Mongoose, Socket.IO / STOMP, Gemini Node SDK, Razorpay SDK  
> **Key Constraint:** Zero regressions or breaking changes to the existing React 18 frontend.

---

## 1. Migration Phase Dependency Graph

```
Phase 0: Scaffolding & Core Infrastructure
   │
   ▼
Phase 1: Authentication & Identity
   │
   ▼
Phase 2: User Profiles, Locations & Uploads
   │
   ▼
Phase 3: Events Catalog & Lifecycle Management
   │
   ▼
Phase 4: Bookings, Seat Holding & Payments
   │
   ├───────────────────────────────┐
   ▼                               ▼
Phase 5: Attendance Check-In    Phase 6: Certificate Generation
   │                               │
   └───────────────┬───────────────┘
                   ▼
Phase 7: Real-Time Engine (STOMP WS + SSE)
   │
   ▼
Phase 8: AI Copilot, Agent Tools & RAG
   │
   ▼
Phase 9: Background Schedulers (node-cron)
   │
   ▼
Phase 10: Ratings, Gamification & Admin Oversight
   │
   ▼
Phase 11: MySQL-to-MongoDB ETL Migration
   │
   ▼
Phase 12: E2E Validation & Production Cutover
```

---

## 2. Phased Implementation Breakdown

### Phase 0: Scaffolding, Tooling & Core Infrastructure [COMPLETED]
- **Status:** **COMPLETED** (Verified with 18 automated tests passing & live HTTP verification)
- **Objective:** Establish the Node.js ES module project, Express application, MongoDB connection, configuration loaders, error envelope pipelines, and container support.
- **Implemented Artifacts in `backend-node/`:**
  1. `package.json`: ES module configuration (`"type": "module"`), dependencies (Express, Mongoose, Zod, Helmet, CORS, Pino, Socket.IO, WS, Vitest, Supertest).
  2. `src/config/env.js`: Zod schema validation for environment variables with fail-fast validation on startup.
  3. `src/config/db.js`: Mongoose connection manager with lifecycle events (`connected`, `error`, `disconnected`), graceful shutdown, and status probes.
  4. `src/models/Counter.js` & `src/utils/sequenceHelper.js`: Atomic sequence generator maintaining `id: Number` compatibility with existing React frontend routes.
  5. `src/utils/apiResponse.js` & `src/utils/errors.js`: `ApiResponse<T>` envelope matching Spring Boot specifications (`{ success, status, message, errorCode, data, errors, timestamp, path, requestId }`).
  6. `src/middleware/requestId.js` & `src/middleware/logger.js`: Correlation ID tracking (`X-Request-Id`) and Pino structured HTTP logging.
  7. `src/middleware/validate.js`: Generic Zod request validation middleware mapping field errors to `{ field: message }` dictionary.
  8. `src/middleware/notFoundHandler.js` & `src/middleware/errorHandler.js`: Centralized exception handler formatting operational errors and `TOKEN_EXPIRED` 401 envelopes.
  9. `src/sockets/index.js`: Socket.IO engine initialized on HTTP server with CORS integration.
  10. `src/controllers/health.controller.js` & `src/routes/health.routes.js`: Liveness (`/health`, `/api/health`) and readiness (`/ready`, `/api/ready`) probes.
  11. `docker-compose.yml`: Retains legacy MySQL 8, MongoDB 7, and PGVector services while adding containerized `backend-node` profile and preserving all database volumes (`mongo_data`, `mysql_data`, `pgvector_data`).
  12. Automated test suite (18 unit/integration tests with Vitest & Supertest) passing with zero failures.
- **Verification Outcomes:**
  - `GET /health` and `GET /api/health` return HTTP 200 with `{ status: "UP", uptimeSeconds, environment }`.
  - `GET /ready` and `GET /api/ready` return HTTP 200 with `{ status: "READY", dependencies: { database: { status: "CONNECTED" } } }` when MongoDB is up, and HTTP 503 when disconnected.
  - `GET /api/unknown` returns HTTP 404 with structured error envelope and correlation ID.
  - Security headers (Helmet) and CORS headers with exposed `X-Token-Expiry`, `Authorization`, and `X-Request-Id` headers verified.

---

### Phase 1: Authentication, Authorization & Identity Services [COMPLETED]
- **Status:** **COMPLETED** (Verified with 44 passing automated unit and integration tests across 7 test suites)
- **Objective:** Replicate Spring Security, JWT authentication, BCrypt, OTP handling, session status polling, and token renewal without frontend modifications.
- **Implemented Artifacts in `backend-node/`:**
  1. `src/utils/password.js`: BCrypt hashing and verification ($2a$/$2b$ compatible with Spring Security's `BCryptPasswordEncoder`).
  2. `src/utils/jwt.js`: Token signing/verification, claims extraction (`sub: email`, `id: Number`, `role`, `iss: 'event-booking-system'`), `X-Token-Expiry` timestamp generation, and refresh token UUID `jti` support.
  3. `src/security/refreshTokenStore.js`: Single-use refresh token rotation store with UUID `jti` invalidation and memory pruning to prevent replay attacks.
  4. `src/security/otpStore.js`: In-memory 6-digit cryptographic OTP store with 10-minute TTL, 5-attempt limit, pending guard (`hasPending()`), and single-use invalidation.
  5. `src/middleware/rateLimiter.js`: Sliding-window rate limiter applying rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) to login (10/min) and OTP (10/hr) endpoints.
  6. `src/middleware/auth.js`: `authenticateToken` middleware extracting Bearer JWTs, injecting `X-Token-Expiry` headers, and formatting exact `TOKEN_EXPIRED` 401 envelopes for React silent refresh.
  7. `src/middleware/role.js`: `requireRole(...roles)` checking `req.user.role` with `403 Forbidden` response.
  8. `src/validators/auth.validator.js`: Zod validation schemas for user/organizer registration, login, forgot password, reset password (token and OTP), OTP send/verify, refresh token, and password change.
  9. `src/services/email.service.js`: Nodemailer email delivery with mock fallback logging and persistence to `EmailLog` Mongoose collection.
  10. `src/services/auth.service.js`: Full auth business logic covering registration, login, failed attempt tracking (locks account on 5 consecutive failures), email verification, password reset, and refresh token rotation.
  11. `src/services/user.service.js` & `src/services/organizer.service.js`: Profile management, location coordinate embedding, and secure password updates.
  12. `src/controllers/auth.controller.js`, `user.controller.js`, `organizer.controller.js`: Route controllers wrapped in `asyncHandler` for safe Express 4 error dispatch.
  13. `src/routes/auth.routes.js`, `user.routes.js`, `organizer.routes.js`: Express routers mounted on `/api`.
  14. `src/tests/auth.test.js`: 15 integration tests verifying registration, login, account lockout, role-based authorization, JWT expiration, refresh rotation, and OTP verification.
- **Verification Outcomes:**
  - `POST /api/auth/user/register` and `/api/auth/organizer/register` create accounts with sequential numeric IDs and BCrypt-hashed passwords.
  - `POST /api/auth/user/login` and `/api/auth/organizer/login` authenticate valid credentials, reset failed attempt counters, and return `{ token, refreshToken, type: "Bearer", user, role }`.
  - Account locking triggers after 5 consecutive failed login attempts (`ACCOUNT_LOCKED` / 423 Locked).
  - Expired tokens return exact `{ errorCode: "TOKEN_EXPIRED", status: 401 }` triggering React Axios interceptor silent refresh.
  - `POST /api/auth/refresh-token` validates and rotates refresh tokens; reused refresh tokens are immediately rejected with `TOKEN_ALREADY_USED`.
  - All 44 automated tests pass cleanly with zero failures.

---

### Phase 2: User Profiles, Locations & Uploads
- **Objective:** User and organizer profile management, geo-locations, and multipart file uploads.
- **Tasks:**
  1. Embed `location` subdocuments into `User` and `Organizer` schemas.
  2. Implement `user.controller.js` and `organizer.controller.js` matching all profile GET/PUT and password change endpoints.
  3. Configure `multer` disk storage saving to `uploads/profiles`, `uploads/logos`, `uploads/banners`, and `uploads/documents`. Serve static files on `/uploads/*` and `/api/uploads/*`.
  4. Implement `GET /api/lookup/:code` resolving public user or organizer summary cards.
- **Acceptance Criteria:**
  - Profile image uploads and logo uploads persist to disk and render in the frontend.
  - Coordinates update correctly and are readable by distance calculation queries.

---

### Phase 3: Events Catalog & Lifecycle Management [COMPLETED]
- **Status:** **COMPLETED** (Verified with 11 passing automated unit and integration tests)
- **Objective:** Event search, filtering, CRUD, admin approval workflow, and public visibility states.
- **Implemented Artifacts in `backend-node/`:**
  1. `src/models/Event.js`: Full event Mongoose model supporting status enum, visibility, capacity management, coordinate schema, and hospitality/logistics fields.
  2. `src/validators/event.validator.js`: Zod schemas for event creation, partial update, search query parameters, and admin approval decision reviews.
  3. `src/services/event.service.js`: Filtering across all 18 query parameters, viewer-aware contact masking, owner checks, approval queue triggers, and manual completion/expiration.
  4. `src/controllers/event.controller.js` & `src/routes/event.routes.js`: Public discovery endpoints (`/api/events`, `/api/events/featured`, `/api/events/categories`, `/api/events/upcoming`, `/api/events/completed`, `/api/events/expired`), organizer endpoints (`/api/events/my`, `POST /api/events`, `PUT /api/events/:id`, `DELETE /api/events/:id`, `PATCH /api/events/:id/cancel`, `PATCH /api/events/:id/publish`), and lifecycle controls.
  5. `src/controllers/admin.controller.js` & `src/routes/admin.routes.js`: Admin approval queue (`GET /api/admin/approvals`) and review decisions (`POST /api/admin/events/:eventId/review`).
  6. `src/tests/events.test.js`: 11 integration tests verifying search filtering, category lists, organizer ownership constraints, approval reviews, and admin force expiration.

---

### Phase 4: Ticket Bookings, Seat Holding & Capacity Enforcement [COMPLETED]
- **Status:** **COMPLETED** (Verified with 11 passing automated unit and integration tests)
- **Objective:** High-concurrency seat reservation, booking queue, participant validation, and cancellation restoral.
- **Implemented Artifacts in `backend-node/`:**
  1. `src/models/Booking.js`: Schema embedding `participants` subdocument array, status tracking (`bookingStatus`, `ticketStatus`, `attendanceStatus`), and sequential numeric IDs.
  2. `src/utils/ticketGenerator.js`: Cryptographic ticket ID generator generating human-readable codes in format `EVT-YYYYMMDD-XXXXXXXX`.
  3. `src/validators/booking.validator.js`: Zod schemas validating booking quantity, participant names and emails, and cancellation reason.
  4. `src/services/booking.service.js`: Atomic seat reservation via `Event.reserveSeats` ($gte condition), duplicate active booking prevention, participant email deduplication, PENDING booking/payment creation, and atomic cancellation capacity restoral via `Event.releaseSeats`.
  5. `src/controllers/booking.controller.js` & `src/routes/booking.routes.js`: Route endpoints (`POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/:id`, `GET /api/bookings/ticket/:ticketId`, `PATCH /api/bookings/:id/cancel`).
  6. `src/tests/bookings.test.js`: 11 integration tests verifying atomic reservation, capacity exhaustion ("Tickets Sold Out"), concurrent booking safety without overselling, duplicate booking rejection, user ownership, and cancellation seat restoral.

---

### Phase 5: Attendance Check-In & Scanner Relay [COMPLETED]
- **Status:** **COMPLETED** (Verified with 8 passing automated unit and integration tests)
- **Objective:** QR ticket scanning, manual attendance overrides, duplicate check-in prevention, and external scanner relay.
- **Implemented Artifacts in `backend-node/`:**
  1. `src/models/Attendance.js`: Attendance model recording `ticketId`, `bookingId`, `eventId`, `scannedByOrganizerId`, `scanMethod`, and timestamp.
  2. `src/utils/qrGenerator.js`: QR code PNG rendering engine using `qrcode` library saving to `uploads/qrcodes/qr_<ticketId>.png`.
  3. `src/validators/attendance.validator.js`: Zod schemas for scan requests and mobile relay messages.
  4. `src/services/attendance.service.js`: Cross-event check, organizer ownership check, payment completion check, duplicate scan prevention (returning 409 Conflict with message `"Attendance already recorded."`), status transition to `PRESENT` and `certificateEligible: true`, and live statistics aggregator.
  5. `src/controllers/attendance.controller.js` & `src/routes/attendance.routes.js`: Endpoints (`POST /api/attendance/scan`, `POST /api/attendance/scan/:ticketId`, `PATCH /api/attendance/events/:eventId/bookings/:bookingId/present`, `GET /api/attendance/events/:eventId`, `GET /api/attendance/events/:eventId/stats`, `GET /api/attendance/bookings/:bookingId`, `POST /api/attendance/relay/:eventId/:sessionId`).
  6. `src/tests/attendance.test.js`: 8 integration tests verifying QR generation, attendee check-in, 409 Conflict duplicate scan rejection, cross-event protection, unauthorized scanner rejection, manual override, live statistics, and scanner relay.

---

### Phase 6: Certificate Generation, Verification & PDF Stamping
- **Objective:** Dynamic certificate issuance, PDF rendering via `pdf-lib`, public verification, and template uploads.
- **Tasks:**
  1. Implement `Certificate`, `CertificateTemplate`, and `CertificateHistory` models.
  2. Build PDF rendering service using `pdf-lib`: load event template (or default modern blue layout), stamp recipient name, event title, college name, date, organizer signature, verification token, and verification QR code.
  3. Implement `POST /api/certificates/events/:id/generate`, `/generate-missing`, and `/generate-selected`.
  4. Implement public `GET /api/certificates/verify/:certificateId` incrementing verification counter.
  5. Implement binary download endpoint `GET /api/certificates/download/:certificateId` streaming PDF.
  6. Implement certificate release, revoke, and email resend endpoints.
- **Acceptance Criteria:**
  - Completed events generate verified certificates for attendees.
  - Downloaded PDFs render with crisp typography, accurate participant names, and working QR codes.
  - Public verification page validates authentic certificates without authentication.

---

### Phase 7: Real-Time Engine (STOMP over WebSocket + SSE)
- **Objective:** Zero-change real-time compatibility for community chat, direct messaging, and push notifications.
- **Tasks:**
  1. Implement native STOMP 1.2 protocol server over WebSocket on `/api/ws-native` and `/api/ws`.
  2. Support STOMP frames: `CONNECT` (auth via JWT header), `SUBSCRIBE`, `SEND`, `MESSAGE`, `DISCONNECT`.
  3. Handle community chat topic `/topic/events/:id/community` and direct chat queue `/queue/users/:id/chat`.
  4. Implement SSE stream `GET /api/notifications/stream?token=...` with heartbeat pings every 25 seconds.
  5. Implement REST fallbacks for message history, polling, file attachments, and unsend.
- **Acceptance Criteria:**
  - React `EventCommunityChat` connects over WebSocket and receives instant broadcasts without UI modification.
  - React `Networking` direct messaging sends and receives messages and voice notes in real time.
  - In-app notification bell rings immediately when events occur.

---

### Phase 8: AI Copilot, Agent Tools & RAG Engine
- **Objective:** Google Gemini conversational agents, 10 agent tools, RAG retriever, and streaming.
- **Tasks:**
  1. Integrate `@google/genai` with model `gemini-2.5-flash`.
  2. Implement `AIEngine` with in-memory prompt cache and prompt injection sanitization.
  3. Port `AgentPlanner` and `AgentOrchestrator` supporting `DIRECT`, `RAG_ONLY`, `TOOL_CALL`, `TOOL_AND_RAG`.
  4. Implement all 10 tools (`eventTool`, `bookingTool`, `paymentTool`, `analyticsTool`, `certificateTool`, `emailTool`, `recommendationTool`, `travelTool`, `feedbackTool`, `dashboardTool`).
  5. Port RAG pipeline: document chunking, embedding generation, and cosine similarity retriever on `vector_documents`.
  6. Implement SSE endpoint `GET /api/ai/copilot/stream` and full chat `POST /api/ai/copilot/chat`.
  7. Implement NLP search, travel plan synthesis, event description generator, and feedback sentiment analysis.
- **Acceptance Criteria:**
  - Organizer Copilot answers queries about registrations, revenue, and certificates in real time.
  - Streaming SSE chat displays smooth token typing in the UI.
  - Fallback answers work gracefully when Gemini API key is missing or offline.

---

### Phase 9: Background Automation & Schedulers
- **Objective:** Periodic event lifecycle transitions, seat reservation releases, reminders, and archival.
- **Tasks:**
  1. Configure `node-cron` with matching cron expressions.
  2. Every 60s: release unpaid seat reservations older than 10 minutes.
  3. Every 60s: auto-publish pending approval requests older than 10 minutes.
  4. Hourly: run event lifecycle state transitions (`PUBLISHED`/`UPCOMING` → `LIVE` → `COMPLETED` → `EXPIRED`).
  5. Daily 06:00: send event-day morning reminder emails.
  6. Daily 07:00: auto-generate certificates for events completed yesterday.
  7. Daily 02:00: run missed certificate recovery job.
  8. Daily 23:00: archive completed events older than 90 days.
- **Acceptance Criteria:**
  - Expired pending bookings automatically release seats back to the event within 60 seconds.
  - Scheduled jobs run on time and log structured audit output.

---

### Phase 10: Ratings, Gamification, Leaderboard & Admin Oversight
- **Objective:** Reviews, XP/badges, student portfolio, college rankings, and platform insights.
- **Tasks:**
  1. Implement ratings and reviews with 7-day edit window and attendance verification check.
  2. Implement gamification: award XP on attendance (50 XP), certificates (100 XP), and reviews (20 XP).
  3. Implement student portfolio aggregator `GET /api/portfolio/my`.
  4. Implement college leaderboard aggregator and rankings.
  5. Implement admin platform insights dashboard (`GET /api/admin/insights/platform`) and fraud reports.
- **Acceptance Criteria:**
  - Student profile displays accurate level, XP bar, badges, and AI career summary.
  - College rankings compute correct participant counts and average ratings.

---

### Phase 11: Data Migration Script (ETL)
- **Objective:** Migrate historical MySQL data into MongoDB without data loss.
- **Tasks:**
  1. Write Node.js ETL script (`scripts/migrate-mysql-to-mongo.js`) connecting to MySQL and MongoDB.
  2. Migrate users, organizers, profile locations, events, bookings, participants, payments, refunds, attendance, certificates, ratings, FAQs, and achievements.
  3. Initialize `Counter` collection sequence values to `MAX(id) + 1` for each collection to prevent ID collisions.
  4. Validate checksums and document counts between MySQL and MongoDB.
- **Acceptance Criteria:**
  - 100% row-to-document match across all active tables.
  - Sequence counters begin strictly after the highest existing historical ID.

---

### Phase 12: End-to-End Validation & Production Cutover
- **Objective:** Verification against the unmodified React frontend and production switch.
- **Tasks:**
  1. Run Vite frontend against Node.js backend.
  2. Execute complete regression smoke test suite:
     - Auth: Register, login, refresh token, verify email, OTP reset.
     - Events: Browse, filter, create, edit, upload banner, publish, approve.
     - Bookings: Multi-participant checkout, Razorpay payment, QR generation.
     - Attendance: Camera check-in, statistics update, scanner relay.
     - Certificates: Generation, download PDF, public verification.
     - Real-Time: Community chat rooms, 1-on-1 direct chat, SSE notifications.
     - AI: Copilot conversation, tool invocations, travel assistant, NLP search.
  3. Verify Docker Compose configuration replacing MySQL with MongoDB as primary.
- **Acceptance Criteria:**
  - Zero frontend errors in browser console.
  - All existing React pages render and interact properly.

---

## 3. Technical Risk Matrix & Mitigation Strategies

| Risk | Severity | Potential Impact | Mitigation Strategy |
|---|---|---|---|
| **STOMP Protocol Incompatibility** | **High** | React chat pages fail to connect, breaking community and direct messaging. | Implement native STOMP 1.2 protocol server over WebSocket on `/api/ws-native` parsing raw STOMP frames (`CONNECT`, `SUBSCRIBE`, `SEND`). |
| **Numeric ID Expectation** | **High** | React routing (`/events/:id`) breaks if MongoDB generates 24-char hex ObjectIds. | Implement atomic integer sequence generator (`Counter` model) maintaining numeric `id` field alongside native `_id`. |
| **Silent Token Refresh Breakage** | **High** | Users get unexpectedly logged out every hour when access tokens expire. | Replicate exact 401 response format (`{ errorCode: "TOKEN_EXPIRED", status: 401 }`) and `X-Token-Expiry` header expected by Axios response interceptor. |
| **Concurrent Booking Over-selling** | **High** | Multiple users book the last seat simultaneously, exceeding venue capacity. | Use atomic Mongoose updates with `$gte: quantity` condition (`findOneAndUpdate({ id, availableSeats: { $gte: qty } }, { $inc: { availableSeats: -qty } })`). |
| **PDF Stamping Discrepancies** | **Medium** | Certificate text overflows or misaligns compared to original iText PDFs. | Calibrate font sizes, margins, and absolute coordinates in `pdf-lib` against existing template graphics. |
| **Gemini API Outage / Quota** | **Medium** | Chatbot crashes or returns 500 errors when API rate limit is reached. | Implement heuristic fallback synthesizer that extracts answers directly from database/RAG without calling external API. |
| **Payment Signature Fraud** | **Critical**| Attackers forge successful booking confirmations. | Enforce strict HMAC-SHA256 verification of `razorpay_order_id + "|" + razorpay_payment_id` against `RAZORPAY_KEY_SECRET`. |
