# CollegeEvents — Node.js & Express Backend Service

Modern, lightweight, event-driven REST and Real-Time backend for **CollegeEvents — AI-Powered Event Booking System**, migrated from Spring Boot 3.2.

---

## 1. Technology Stack

* **Runtime:** Node.js (v20+ LTS / ES Modules)
* **Web Framework:** Express 4.x
* **Primary Database:** MongoDB 7+ via Mongoose ODM
* **Security & Auth:** Helmet, CORS, JSON Web Tokens (`jsonwebtoken`), `bcryptjs`
* **Validation:** Zod (fail-fast environment & request validation)
* **Real-Time:** Socket.IO & WebSocket STOMP protocol adapter (`ws`)
* **Logging:** Structured JSON logging via Pino (`pino`, `pino-http`, `pino-pretty`)
* **Testing:** Vitest & Supertest

---

## 2. Architecture & Directory Structure

```
backend-node/
├── src/
│   ├── app.js               # Express app configuration & middleware pipeline
│   ├── server.js            # Server bootstrapper, Socket.IO & graceful shutdown
│   ├── config/              # Configuration & connections
│   │   ├── env.js           # Zod-validated fail-fast environment schema
│   │   └── db.js            # Mongoose MongoDB connection & lifecycle manager
│   ├── models/              # Mongoose schema definitions
│   │   ├── Counter.js       # Atomic sequence counter for integer ID compatibility
│   │   └── index.js
│   ├── routes/              # Express API routers
│   │   ├── index.js         # Master router mounted under /api
│   │   └── health.routes.js # Liveness & readiness probes
│   ├── controllers/         # Request handling & response serialization
│   │   └── health.controller.js
│   ├── services/            # Core business logic layer
│   │   └── index.js
│   ├── middleware/          # Request interceptors & filters
│   │   ├── requestId.js     # X-Request-Id correlation generator
│   │   ├── logger.js        # Structured HTTP request logger (pino-http)
│   │   ├── validate.js      # Zod request validator middleware
│   │   ├── errorHandler.js  # Centralized exception handler & envelope formatter
│   │   └── notFoundHandler.js# 404 handler
│   ├── validators/          # Reusable Zod schemas
│   │   ├── common.validator.js
│   │   └── index.js
│   ├── utils/               # Shared utilities
│   │   ├── apiResponse.js   # ApiResponse<T> matching Spring Boot envelope
│   │   ├── errors.js        # Standardized AppError hierarchy
│   │   ├── logger.js        # Pino structured logger instance
│   │   └── sequenceHelper.js# Atomic sequence generator helper
│   ├── sockets/             # Socket.IO event gateways
│   │   └── index.js
│   ├── ai/                  # AI Copilot & RAG stubs
│   │   └── index.js
│   ├── scripts/             # Data migration & seeding scripts
│   │   └── index.js
│   └── tests/               # Vitest automated test suites
│       ├── env.test.js
│       ├── apiResponse.test.js
│       ├── validation.test.js
│       ├── error.test.js
│       └── app.test.js
├── Dockerfile               # Production container image
├── vitest.config.js         # Vitest test runner configuration
├── package.json             # ES module dependencies and scripts
├── .env.example             # Safe environment variable template
└── README.md
```

---

## 3. Getting Started

### Prerequisites
* Node.js `>= 20.0.0`
* MongoDB 7 running locally on `localhost:27017` or via Docker

### 1. Start MongoDB with Docker
From the project root:
```bash
docker compose up -d mongo
```

### 2. Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env
```
Ensure `PORT=8080` and `MONGODB_URI=mongodb://localhost:27017/event_booking_db`.

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Development Server
```bash
npm run dev
```
The server will boot on `http://localhost:8080` with auto-restart on changes.

---

## 4. API Endpoints

### Core Infrastructure
| Method | Endpoint | Description | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Root liveness probe (Container Orchestrator) | `200 OK` |
| `GET` | `/ready` | Root readiness probe (checks MongoDB connectivity) | `200 OK` / `503 Unavailable` |
| `GET` | `/api/health` | API liveness probe | `200 OK` |
| `GET` | `/api/ready` | API readiness probe | `200 OK` / `503 Unavailable` |
| `GET` | `/api` | Base API engine metadata | `200 OK` |

### Authentication & Identity (`/api/auth/*`)
| Method | Endpoint | Description | Rate Limit |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/user/register` | Register student user (`ROLE_USER`) | Default |
| `POST` | `/api/auth/user/login` | Authenticate student user, returns JWT & refresh token | 10 req / min |
| `POST` | `/api/auth/organizer/register` | Register organizer (`ROLE_ORGANIZER`) | Default |
| `POST` | `/api/auth/organizer/login` | Authenticate organizer, returns JWT & refresh token | 10 req / min |
| `GET` | `/api/auth/verify-email` | Token-based email verification link handler | Default |
| `POST` | `/api/auth/forgot-password` | Request password reset token via email | Default |
| `POST` | `/api/auth/reset-password` | Reset password using reset token | Default |
| `POST` | `/api/auth/reset-password/otp` | Reset password directly using 6-digit OTP | Default |
| `GET` | `/api/auth/session-status` | Polling endpoint for remaining JWT session validity | Authenticated |
| `POST` | `/api/auth/refresh-token` | Single-use refresh token exchange with rotation | Default |
| `POST` | `/api/auth/otp/send` | Send 6-digit OTP to user/organizer email | 10 req / hour |
| `POST` | `/api/auth/otp/verify` | Verify 6-digit OTP and mark email verified | Default |

### User & Organizer Profile Management
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/user/profile` | `USER`, `ADMIN` | Fetch current student profile |
| `PUT` | `/api/user/profile` | `USER`, `ADMIN` | Update student profile details |
| `GET` | `/api/user/profile/location` | `USER`, `ADMIN` | Fetch user coordinate/address location |
| `PUT` | `/api/user/profile/location` | `USER`, `ADMIN` | Update user coordinate/address location |
| `PATCH` | `/api/user/change-password` | `USER`, `ADMIN` | Update password with old password validation |
| `GET` | `/api/organizer/profile` | `ORGANIZER`, `ADMIN` | Fetch current organizer profile |
| `PUT` | `/api/organizer/profile` | `ORGANIZER`, `ADMIN` | Update organizer profile details |
| `GET` | `/api/organizer/profile/location` | `ORGANIZER`, `ADMIN` | Fetch organizer coordinate/address location |
| `PUT` | `/api/organizer/profile/location` | `ORGANIZER`, `ADMIN` | Update organizer coordinate/address location |
| `PATCH` | `/api/organizer/change-password` | `ORGANIZER`, `ADMIN` | Update organizer credentials |

### Events Catalog & Lifecycle (`/api/events/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/events` | Public | Search, filter (18 query params), and paginate events |
| `GET` | `/api/events/featured` | Public | Retrieve up to 6 featured upcoming events |
| `GET` | `/api/events/categories` | Public | List standard event category taxonomy |
| `GET` | `/api/events/upcoming` | Public | Upcoming events sorted chronologically |
| `GET` | `/api/events/completed` | Public | Historical completed events |
| `GET` | `/api/events/expired` | Public | Expired events archive |
| `GET` | `/api/events/:id` | Public | Event details (viewer-aware private contact disclosure) |
| `GET` | `/api/events/my` | `ORGANIZER` | List events created by the logged-in organizer |
| `POST` | `/api/events` | `ORGANIZER` | Create event with initial capacity & auto-approval |
| `PUT` | `/api/events/:id` | `ORGANIZER` | Update event details with ownership & registration lock |
| `DELETE` | `/api/events/:id` | `ORGANIZER` | Cancel / soft-delete owned event |
| `PATCH` | `/api/events/:id/cancel` | `ORGANIZER` | Cancel event and cascade status |
| `PATCH` | `/api/events/:id/publish` | `ORGANIZER` | Publish approved event |
| `GET` | `/api/events/:id/attendance` | `ORGANIZER` | List confirmed event attendees |
| `GET` | `/api/events/:id/attendance/stats` | `ORGANIZER` | Live attendance metrics & percentages |
| `POST` | `/api/events/:id/complete` | `ORGANIZER`, `ADMIN` | Manual event completion transition |
| `POST` | `/api/events/:id/expire` | `ADMIN` | Force expire event |

### Ticket Bookings (`/api/bookings/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/bookings` | `USER` | Atomically reserve tickets with capacity check ($gte) |
| `GET` | `/api/bookings` | `USER` | Paginated personal booking history |
| `GET` | `/api/bookings/:id` | `USER` | Detailed booking view with ownership check |
| `GET` | `/api/bookings/ticket/:ticketId` | `USER` | Ticket code lookup with ownership check |
| `GET` | `/api/bookings/:id/attendance` | `USER` | Attendance & certificate eligibility status |
| `PATCH` | `/api/bookings/:id/cancel` | `USER` | Cancel booking & atomically restore seats ($inc) |

### Attendance & QR Scanning (`/api/attendance/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/attendance/scan` | `ORGANIZER`, `ADMIN` | Scan QR ticket (rejects duplicates with 409 Conflict) |
| `POST` | `/api/attendance/scan/:ticketId` | `ORGANIZER`, `ADMIN` | Legacy scan endpoint delegating to scanner engine |
| `PATCH` | `/api/attendance/events/:eventId/bookings/:bookingId/present` | `ORGANIZER`, `ADMIN` | Manual check-in override |
| `GET` | `/api/attendance/events/:eventId` | `ORGANIZER`, `ADMIN` | List attendee check-in records for event |
| `GET` | `/api/attendance/events/:eventId/stats` | `ORGANIZER`, `ADMIN` | Real-time checked-in vs registered statistics |
| `GET` | `/api/attendance/bookings/:bookingId` | `USER`, `ADMIN` | User attendance status for specific booking |
| `POST` | `/api/attendance/relay/:eventId/:sessionId` | `ORGANIZER`, `ADMIN` | Relay mobile camera scan to organizer desktop via Socket.IO |

### Admin Oversight & Approvals (`/api/admin/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/approvals` | `ADMIN` | Paginated queue of pending/reviewed event approvals |
| `POST` | `/api/admin/events/:eventId/review` | `ADMIN` | Review event (`APPROVE`, `REJECT`, `REQUEST_MODIFICATIONS`) |

### Payments & Refunds (`/api/payments/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/payments` | `USER` | User's paginated payment history |
| `POST` | `/api/payments/bookings/:bookingId/razorpay/order` | `USER` | Create Razorpay order (auto-confirms free events) |
| `POST` | `/api/payments/bookings/:bookingId/razorpay/verify` | `USER` | Server-side HMAC-SHA256 signature verification & ticket confirmation |
| `POST` | `/api/payments/bookings/:bookingId/processing` | `USER` | Move payment to PROCESSING status |
| `POST` | `/api/payments/bookings/:bookingId/success` | `USER` | Mark payment successful (audited, server-verified amount) |
| `POST` | `/api/payments/bookings/:bookingId/failed` | `USER` | Mark payment failed with reason |
| `GET` | `/api/payments/:paymentId/refunds` | `USER`, `ADMIN` | Fetch refunds for a specific payment with ownership check |
| `GET` | `/api/payments/refunds/my` | `USER` | Current user's refund requests and status |
| `POST` | `/api/payments/webhook` | Public (Signed) | Idempotent Razorpay webhook processor (`payment.captured`, `order.paid`) |

### Certificates (`/api/certificates/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/certificates/my` | `USER` | Paginated personal certificate collection with search |
| `GET` | `/api/certificates/verify/:certificateId` | Public | Public certificate verification endpoint (increments verification count) |
| `GET` | `/api/certificates/download/:certificateId` | `USER`, `ORGANIZER`, `ADMIN` | Secure in-memory PDF generation & download stream (`pdf-lib`) |
| `GET` | `/api/certificates/events/:eventId` | `ORGANIZER` | View all issued certificates for an event |
| `GET` | `/api/certificates/events/:eventId/participants` | `ORGANIZER` | Filterable participant certificate eligibility list |
| `POST` | `/api/certificates/events/:eventId/generate` | `ORGANIZER` | Batch generate certificates for all eligible attendees (`PRESENT`) |
| `POST` | `/api/certificates/events/:eventId/generate-missing` | `ORGANIZER` | Generate only missing certificates for attendees |
| `POST` | `/api/certificates/events/:eventId/generate-selected` | `ORGANIZER` | Generate certificates for selected student user IDs |
| `POST` | `/api/certificates/events/:eventId/release` | `ORGANIZER` | Mark certificates released and dispatch notification emails |
| `POST` | `/api/certificates/:certificateId/email` | `ORGANIZER` | Resend certificate email to attendee |
| `PATCH` | `/api/certificates/:certificateId/revoke` | `ORGANIZER` | Revoke certificate with reason |
| `GET` | `/api/certificates/admin` | `ADMIN` | Admin search across all certificates |
| `GET` | `/api/certificates/admin/stats` | `ADMIN` | Certificate metrics (generated, downloaded, verified, failed) |
| `DELETE` | `/api/certificates/admin/:certificateId` | `ADMIN` | Administrative certificate revocation |

### In-App Notifications & Real-Time SSE (`/api/notifications/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | `USER`, `ORGANIZER` | Paginated notification feed with recipient ownership isolation |
| `GET` | `/api/notifications/unread` | `USER`, `ORGANIZER` | Count of unread notifications |
| `PATCH` | `/api/notifications/read-all` | `USER`, `ORGANIZER` | Mark all notifications read |
| `GET` | `/api/notifications/stream` | Authenticated | Server-Sent Events (SSE) live push stream with keep-alive heartbeats |

### AI Copilot & EventGPT Subsystem (`/api/ai/*`)
| Method | Endpoint | Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/copilot/chat` | Public / Auth | Full Agent Orchestrator with RAG & Tool integration (EventBot & EventCopilot) |
| `GET` | `/api/ai/copilot/stream` | Public / Auth | SSE real-time streaming endpoint for Copilot token responses |
| `GET` | `/api/ai/copilot/sessions` | Authenticated | Retrieve user conversation history sessions (20 turns memory) |
| `DELETE`| `/api/ai/copilot/sessions/:sessionId` | Authenticated | Clear conversation memory session |
| `GET` | `/api/ai/copilot/persona` | Public / Auth | Current role-scoped AI persona configuration |
| `GET` | `/api/ai/agent/tools` | Authenticated | List registered agent tools with schema & role permissions |
| `POST` | `/api/ai/agent/invoke` | Authenticated | Direct tool dispatcher with confirmation gates for mutating operations |
| `POST` | `/api/ai/rag/index` | `ORGANIZER`, `ADMIN` | Trigger batch RAG indexing for events, FAQs, policies, and reviews |
| `GET` | `/api/ai/rag/status` | `ORGANIZER`, `ADMIN` | Vector store status, document count, and active provider |
| `POST` | `/api/ai/eventgpt/travel` | Public / Auth | Multi-modal travel planning (trains, buses, metro, hotels, parking) |
| `POST` | `/api/ai/eventgpt/qa` | Public / Auth | Domain Q&A grounded with RAG event knowledge |
| `POST` | `/api/ai/eventgpt/checklist` | Public / Auth | Personalized event packing & preparation checklist |
| `POST` | `/api/ai/eventgpt/feedback-analysis` | `ORGANIZER`, `ADMIN` | NLP sentiment breakdown, rating trends, and organizer action items |
| `POST` | `/api/ai/eventgpt/attendance-prediction` | `ORGANIZER`, `ADMIN` | Predictive turnout modeling based on bookings, views, and recency |
| `GET` | `/api/ai/insights/platform` | `ADMIN` | Platform-wide monthly growth, category heatmaps, and college leaderboards |
| `GET` | `/api/ai/insights/fraud` | `ADMIN` | Automated fraud detection report (rapid bookings, spike anomalies) |
| `POST` | `/api/ai/chat` | Public / Auth | Legacy frontend compatibility chat alias |
| `POST` | `/api/ai/search` | Public / Auth | NLP natural language search with semantic expansion |

---

## 5. Security & Concurrency Architecture

1. **Password Hashing:**
   - Powered by `bcryptjs` using a cost factor of 12.
   - Fully compatible with Spring Security's `BCryptPasswordEncoder` ($2a$/$2b$ salt prefixes).
2. **JWT Issuance & Verification:**
   - Issues HMAC-SHA256 tokens matching the Spring Boot claim structure: `sub` (email), `id` (integer sequence), `role`, `iss` (`event-booking-system`).
   - Every authenticated response injects `X-Token-Expiry: <timestampMs>` for UI session countdowns.
3. **Silent Token Refresh Contract:**
   - When a token expires, the backend responds with HTTP 401 and `{ "errorCode": "TOKEN_EXPIRED", "message": "Access token expired" }`.
   - The React frontend Axios response interceptor intercepts this error and seamlessly hits `POST /api/auth/refresh-token`.
4. **Refresh Token Replay Protection:**
   - Refresh tokens include a unique UUID `jti` claim.
   - In-memory store tracks redeemed `jti`s. Replaying an already-consumed refresh token immediately yields HTTP 401 `TOKEN_ALREADY_USED`.
5. **High-Concurrency Atomic Capacity Enforcement:**
   - Guaranteed zero overselling under heavy concurrent booking traffic.
   - Implemented via MongoDB atomic conditional updates:
     ```javascript
     Event.findOneAndUpdate(
       { id: eventId, availableSeats: { $gte: quantity }, status: { $in: ['PUBLISHED', 'UPCOMING', 'LIVE', 'APPROVED'] } },
       { $inc: { availableSeats: -quantity } },
       { new: true }
     );
     ```
   - Capacity exhaustion immediately throws `SEATS_UNAVAILABLE` yielding a clean `"Tickets Sold Out"` error.
   - Cancellation atomically restores seats via `{ $inc: { availableSeats: quantity } }`.
6. **Payment Integrity & Idempotent Webhooks:**
   - Server computes HMAC-SHA256 of `orderId|paymentId` against `RAZORPAY_KEY_SECRET`. Never trusts client-supplied success flags or amounts.
   - Webhook endpoint verifies `X-Razorpay-Signature` against the raw payload bytes. Duplicate deliveries are handled idempotently (`{ status: 'ok', idempotent: true }`).
   - All financial transitions are recorded in `audit_logs`.
7. **Certificate Security:**
   - Generated with format `CERT-YYYY-XXXXXX`. Only attendees marked `PRESENT` with completed bookings are eligible.
   - Pure in-memory PDF generation with `pdf-lib` prevents disk race conditions and unauthorized tampering.
   - Unauthorized and revoked certificate downloads are strictly rejected.
8. **AI Safety, Agent Tools & RAG Vector Architecture:**
   - **Google Gemini Provider:** Implemented via official `@google/genai` Node.js SDK with configurable models (`gemini-2.5-flash`), 15-second timeouts, and comprehensive metric instrumentation.
   - **Agent Orchestrator & Heuristic Planner:** Intelligently classifies user queries into `DIRECT`, `RAG_ONLY`, `TOOL_CALL`, or `TOOL_AND_RAG` execution strategies based on intent and user role.
   - **10 Core Agent Tools:** `eventTool`, `bookingTool`, `analyticsTool`, `dashboardTool`, `certificateTool`, `paymentTool`, `feedbackTool`, `recommendationTool`, `emailTool`, `travelTool`.
   - **Security Permissions & Confirmation Gates:** Strict role boundaries enforced inside every tool (e.g. `analyticsTool` rejects students; `bookingTool` enforces authenticated principal isolation). Mutating operations (`createEvent`, `updateEvent`, `deleteEvent`, `sendEmail`) are gated by confirmation requirements (`requiresConfirmation: true`) and reject direct execution.
   - **Prompt Injection & Secrets Sanitization:** All incoming prompts pass through regex filters that scrub injection attempts (`ignore previous instructions`, `reveal system prompt`) and redact sensitive patterns (`api_key=`, `bearer `, passwords).
   - **Vector Store & RAG Search:** 96-dimensional normalized embeddings with cosine similarity. Connects directly to MongoDB Atlas `$vectorSearch` pipeline with transparent fallback to in-memory cosine similarity ranking when running on standard local MongoDB instances.
9. **Background Schedulers (`node-cron`):**
   - 60s scan: Releases reservations for unpaid bookings older than 10 minutes and restores seat capacity.
   - 60s scan: Auto-approves events in review queue exceeding 10-minute SLA.
   - Hourly scan: Transitions event lifecycle states (`UPCOMING` -> `LIVE` -> `COMPLETED` -> `EXPIRED`).
   - Daily scan: Recovers missing certificates for completed events.
   - Every job is built to be completely safe to retry repeatedly without duplicate operations.

---

## 6. Testing

Run the test suite using Vitest (133 tests across 16 test suites with 100% pass rate):
```bash
# Run all unit, integration and migration tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests for data migration suite
npx vitest run src/tests/migration.test.js
```

---

## 7. MySQL to MongoDB Data Migration Utility

The backend includes a standalone, safe, repeatable data migration utility under `scripts/` to transition historical data from MySQL 8 to MongoDB 7.

### Migration Commands
```bash
# 1. Pre-Migration Readiness Checks (Connectivity, schemas, constraints, bcrypt compatibility)
npm run migrate:check

# 2. Dry-Run Simulation (Tests extraction, transformations & schema validation without writes)
npm run migrate:dry-run

# 3. Live Migration Execution (Dependency-aware batch extraction & controlled upserts)
npm run migrate

# 4. Post-Migration 5-Pillar Reconciliation (Generates Markdown & JSON reports)
npm run migrate:validate

# 5. One-Step Migration & Full Reconciliation
npm run migrate:reconcile
```

### Key Safety Guarantees
1. **Source of Truth Preservation:** Reads from MySQL using `mysql2` and writes to MongoDB with zero runtime application dependency on MySQL.
2. **Relational Integrity:** Resolves all foreign keys to MongoDB `ObjectId` references across `events`, `bookings`, `payments`, `certificates`, `attendance`, `ratings`, and social collections.
3. **Persistent ID Mappings:** Stores source-to-target ID translations in `migration_id_mappings` collection, guaranteeing deterministic reruns.
4. **Sequence Counter Synchronization:** Updates `counters` so subsequent application operations continue sequence IDs monotonically from the highest migrated ID.
5. **Zero Overwrites:** Uses controlled upserts based on unique business identifiers (`userCode`, `email`, `ticketId`, `transactionId`, `certificateId`). Never drops or overwrites unrelated records.
6. **Credential Privacy:** Bcrypt password hashes (`$2a$` / `$2b$`) are preserved intact without being logged or altered. Secrets, tokens, and payment credentials are fully redacted.
7. **Human Approval Gate:** Automated cutover is strictly prohibited. Refer to [Cutover Runbook](../docs/migration/cutover-runbook.md) for full backup, freeze, sign-off, and rollback procedures.

