# CollegeEvents — Backend Migration Inventory & Feature Audit

> **System:** CollegeEvents — AI-Powered Event Booking System  
> **Source Stack:** Spring Boot 3.2, Java 21, MySQL 8, Hibernate/JPA, Spring Security, Spring AI / Gemini 2.5 Flash, Razorpay SDK, ZXing, iText PDF  
> **Target Stack:** Node.js (ES modules), Express, MongoDB 7 + Mongoose, JWT + bcrypt, Gemini Node SDK, Razorpay Node SDK, Socket.IO / SSE, PDFKit, `qrcode`  
> **Document Purpose:** Complete inventory of every backend feature, endpoint, internal service, background task, and data entity with verified code audit status.

---

## 1. Executive Summary & Codebase State

An exhaustive code audit of `backend/src/main/java/com/eventbooking/` was performed across all 29 REST controllers, 33 JPA entities, 5 MongoDB document models, 33 business services, 10 agent tools, 5 schedulers, and security filters.

### Implementation Status Breakdown
- **Fully Implemented & Verified Active:** Core auth, event management, bookings, Razorpay payment verification, attendance check-in, certificates (iText PDF generation & verification), event community chat, direct messaging, SSE notifications, organizer analytics, gamification, and help center.
- **Active with Fallback Architecture:** AI module (Gemini API with fallback heuristic responses when key is missing or quota exceeded), RAG system (defaults to MySQL table `ai_vector_documents` with in-memory cosine similarity, optional Docker PGVector via `pgvector_schema.sql`).
- **Legacy / Backward-Compatibility Endpoints:** 
  - `ChatbotController.java` (`POST /api/chatbot`) — legacy single-turn endpoint delegating to `ConversationalAgentService`.
  - `ChatController.java` (`POST /api/ai/chat`, `GET /api/ai/chat/stream`, `GET /api/ai/chat/sessions`) — legacy endpoints kept active for older frontend builds; superseded by `/api/ai/copilot/*`.
- **Unused / Dead / Orphaned Code Identified:**
  - `Transaction.java` and `TransactionRepository.java` / SQL table `transactions`: Declared in JPA and SQL schema, but no service or controller ever reads or writes to it. Payments are tracked exclusively via `Payment.java` linked to `Booking`.
  - `ActivityLog.java` and `ActivityLogRepository.java` (MongoDB): Present in `entity/mongo` and `repository/mongo`, but never referenced in business logic. Auditing is instead handled in SQL via `AuditLog.java` and `AuditService.java`.
  - `DirectMessageRepository.findBySenderIdOrReceiverId`: Defined but replaced by `findConversation` native queries.
  - Test endpoint `GET /api/auth/test-email`: Explicitly restricted to `@Profile("dev")`.

---

## 2. Comprehensive Domain Feature Inventory

### Domain 1: Authentication, Authorization & Identity
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Student Registration | `AuthController.registerUser`, `AuthService.registerUser` | **Active / Verified** | Hashes password with BCrypt (strength 12), generates `USRxxxx` user code, creates verification token, sends HTML verification email, returns `AuthResponse`. |
| Organizer Registration | `AuthController.registerOrganizer`, `AuthService.registerOrganizer` | **Active / Verified** | Generates `ORGxxxx` code, organization details, unapproved status default, sends verification email. |
| User & Organizer Login | `AuthController.loginUser`, `AuthController.loginOrganizer` | **Active / Verified** | In-memory IP rate limiting (10 attempts/min via `RateLimiterService`), password check, account lock tracking (`failed_login_attempts`), returns JWT access token + refresh token + expiry epoch. |
| Email Verification | `AuthController.verifyEmail` | **Active / Verified** | Validates UUID token for USER or ORGANIZER, marks `email_verified=true`, clears token. |
| Password Reset (Link) | `AuthController.forgotPassword`, `resetPassword` | **Active / Verified** | Generates reset token with 15-minute expiry, sends email with frontend reset URL. |
| Password Reset (OTP) | `AuthController.resetPasswordWithOtp` | **Active / Verified** | In-memory `OtpStore` validates 6-digit OTP, enforces expiry (5 min), updates BCrypt password hash. |
| OTP Send & Verify | `AuthController.sendOtp`, `AuthController.verifyOtp` | **Active / Verified** | Enforces rate limits (1 request/60s per email, 10/hr per IP), generates 6-digit cryptographic OTP, delivers via Gmail SMTP with fallback hints, verifies against `OtpStore`. |
| Session Status Check | `AuthController.sessionStatus` | **Active / Verified** | `GET /api/auth/session-status` inspected by frontend to check token validity, remaining milliseconds, and user identity without side-effects. |
| Silent Token Renewal | `AuthController.refreshToken` | **Active / Verified** | Validates JWT refresh token, checks single-use `jti` in `RefreshTokenStore`, revokes previous `jti`, issues new pair. |
| Role-Based Access Control | `SecurityConfig`, `@PreAuthorize`, `AuthGuard` | **Active / Verified** | Three distinct roles: `USER`, `ORGANIZER`, `ADMIN`. Method-level `@PreAuthorize` guards all sensitive endpoints. |
| Public ID Code Lookup | `LookupController.byPublicId` | **Active / Verified** | Resolves `USRxxxx` or `ORGxxxx` codes into public profile cards for cross-user discovery. |

---

### Domain 2: User & Organizer Profiles
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| User Profile Management | `UserProfileController`, `UserProfileService` | **Active / Verified** | View/update personal info (phone, address, organization, gender, DOB), change password. |
| User Profile Picture Upload | `UserProfileController.uploadPicture` | **Active / Verified** | Multipart upload stored in `uploads/profiles/`, URL saved in database. |
| Profile Geo-Location | `UserProfileController`, `OrganizerProfileController` | **Active / Verified** | Read/write coordinates (`latitude`, `longitude`), street, district, state, pin code for proximity calculations. |
| Organizer Profile Management| `OrganizerProfileController`, `OrganizerProfileService` | **Active / Verified** | Update organization name, logo, website, description, contact details. |
| Organizer Logo Upload | `OrganizerProfileController.uploadLogo` | **Active / Verified** | Multipart upload stored in `uploads/logos/`. |
| Organizer Dashboard Stats | `OrganizerProfileController.getDashboard`, `AnalyticsService` | **Active / Verified** | Aggregates active events, total revenue, bookings count, and upcoming schedules. |
| Participant Roster View | `OrganizerProfileController.getParticipants` | **Active / Verified** | Joins bookings and participant records for events created by the logged-in organizer. |

---

### Domain 3: Event Lifecycle & Management
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Event Search & Filtering | `EventController.searchEvents`, `EventService.search` | **Active / Verified** | Supports 18 query parameters: keyword, category, eventType, location, collegeName, departmentName, venueName, organizerName, dateFrom, dateTo, priceMin, priceMax, freeOnly, paidOnly, interCollege, intraCollege, past, sortBy, pagination. |
| Event Detail Viewer | `EventController.getEvent`, `EventService.getEventForViewer` | **Active / Verified** | Viewer role-aware response: reveals WhatsApp links, emergency contacts, and private travel details only to confirmed attendees, event organizer, or admins. |
| Event Creation & Editing | `EventController.createEvent`, `updateEvent` | **Active / Verified** | Validates seat capacities, prices, dates, categories, food/accommodation provisions, schedules, speakers. |
| Event Publishing Workflow | `EventController.publishEvent`, `EventService.publishEvent` | **Active / Verified** | Organizers submit draft event; sets status `PENDING_APPROVAL`, creates `ApprovalRequest` record for Admin queue. |
| Event Cancellation | `EventController.cancelEvent`, `EventService.cancelEvent` | **Active / Verified** | Sets status `CANCELLED`, cascades cancellation to active bookings, triggers automatic refund creation. |
| Event Banner Upload | `EventController.uploadBanner` | **Active / Verified** | Multipart upload to `uploads/banners/`. |
| Event Authorized Doc Upload | `EventController.uploadAuthorizedDocument` | **Active / Verified** | Upload official bonafide/college permission letters to `uploads/documents/`. |
| Organizer Event List | `EventController.myEvents` | **Active / Verified** | Paginated listing of events belonging to the organizer with status filters. |
| Participant Export (CSV/Excel)| `EventAssetController.exportParticipants` | **Active / Verified** | Generates CSV file of all registered participants with names, emails, colleges, departments, ticket IDs. |
| Event Poster Generation | `EventAssetController.generatePoster` | **Active / Verified** | Renders HTML/canvas poster summary containing event branding and schedule. |
| Event Completion / Expiry | `EventController.forceComplete`, `forceExpire` | **Active / Verified** | Admin/organizer manual state transitions complementing the background schedulers. |

---

### Domain 4: Ticket Booking & Participant Registration
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Multi-Participant Booking | `BookingController.bookTickets`, `BookingService.bookTickets` | **Active / Verified** | Atomically verifies seat availability (`PESSIMISTIC_WRITE` lock), prevents duplicate bookings, persists participant records per ticket, decrements available seats, records queue entry. |
| Temporary Seat Hold | `BookingService.bookTickets`, `BookingScheduler` | **Active / Verified** | Holds seats in status `PENDING` for 10 minutes. If payment is not completed within 10 minutes, `BookingScheduler` releases the reservation and increments available seats. |
| Ticket ID Generation | `TicketIdGenerator.generate` | **Active / Verified** | Formats human-readable tickets: `EVT-YYYYMMDD-XXXXXXXX` (8 random alphanumeric characters). |
| QR Code Generation | `QrCodeGenerator.generate`, ZXing library | **Active / Verified** | Generated only **after** payment confirmation; renders 300x300 PNG under `uploads/qrcodes/qr_<ticketId>.png`. |
| User Booking History | `BookingController.myBookings`, `BookingService.getUserBookings` | **Active / Verified** | Paginated user tickets with event details, payment status, QR code link, attendance status. |
| Single Booking Details | `BookingController.getBooking`, `getByTicketId` | **Active / Verified** | Fetches booking metadata, participant list, payment history. |
| Booking Cancellation | `BookingController.cancelBooking`, `BookingService.cancelBooking` | **Active / Verified** | Sets status `CANCELLED`, restores available seats, revokes QR code, automatically initiates a `Refund` record if paid online. |

---

### Domain 5: Payments & Refunds
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Razorpay Order Creation | `PaymentController.createRazorpayOrder`, `PaymentService` | **Active / Verified** | Calculates amount in paise, creates Razorpay API order via Basic Auth, returns `keyId`, `orderId`, and currency. Handles free events (zero amount) automatically. |
| Razorpay Signature Verification| `PaymentController.verifyRazorpayPayment`, `PaymentService` | **Active / Verified** | Validates HMAC-SHA256 signature (`orderId + "|" + paymentId` against `RAZORPAY_KEY_SECRET`), transitions payment to `SUCCESSFUL`, triggers QR code generation and email confirmation. |
| Payment Status State Machine | `PaymentService.markProcessing`, `markFailed`, `markSuccessful` | **Active / Verified** | Manages transitions between `PENDING`, `PROCESSING`, `SUCCESSFUL`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`. |
| Payment History | `PaymentController.history` | **Active / Verified** | Paginated list of user payments with transaction IDs and gateway references. |
| Refund Query Endpoints | `PaymentController.refunds`, `myRefunds` | **Active / Verified** | View refund progress per payment and across the user profile. |
| Admin Refund Management | `AdminController.refunds`, `updateRefundStatus` | **Active / Verified** | Admins inspect refund queue and update statuses (`INITIATED`, `REFUND_REQUESTED`, `PROCESSING`, `COMPLETED`, `REJECTED`). Recalculates parent payment status. |
| Unused Transaction Entity | `Transaction.java`, `TransactionRepository.java` | **Unused / Legacy** | Duplicate table `transactions` created in initial migration; replaced in all active code by `Payment`. |

---

### Domain 6: Attendance & Check-In
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| QR Ticket Check-In | `AttendanceController.scan` | **Active / Verified** | Validates ticket ownership, event match, payment status, non-cancelled status, records `Attendance` record with timestamp, marks booking `PRESENT` and `certificate_eligible=true`. Rejects duplicate scans with 409 Conflict. |
| Manual Participant Check-In | `AttendanceController.markPresentManually` | **Active / Verified** | Allows organizer to manually mark an attendee present from the roster table. |
| Attendance Real-Time Stats | `AttendanceController.stats` | **Active / Verified** | Live count of registered vs present vs absent participants with calculated percentage. |
| External Mobile Scanner Relay| `AttendanceController.relay`, STOMP broker | **Active / Verified** | Mobile phone scanner posts ticket ID to `/api/attendance/relay/{eventId}/{sessionId}`; server broadcasts to `/topic/scanner-relay/{eventId}/{sessionId}` so organizer's laptop browser auto-submits the check-in. |

---

### Domain 7: Certificates System
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Automated Certificate Issuance| `CertificateController.generate`, `CertificateService` | **Active / Verified** | Validates event completion, iterates verified attendees (`attendanceStatus == PRESENT`), builds PDF, assigns verification token, generates verification QR, awards gamification XP. |
| Missing Certificate Recovery | `CertificateController.generateMissing`, `CertificateRecoveryService` | **Active / Verified** | Idempotently finds verified attendees lacking certificates and creates missing records. |
| Selected Participant Issuance| `CertificateController.generateSelected` | **Active / Verified** | Issues certificates for specified subset of user IDs. |
| PDF Rendering Engine | `CertificateService.downloadCertificatePdfForUser`, iText | **Active / Verified** | Dynamically stamps participant name, event title, date, college, signature image, and verification QR code onto PDF. |
| Public Certificate Verification| `CertificateController.verify` | **Active / Verified** | Public endpoint `/api/certificates/verify/{certificateId}` returning recipient details, event metadata, verification count without requiring login. |
| Template & Signature Uploads | `CertificateController.uploadTemplate`, `uploadSignature` | **Active / Verified** | Organizers upload customized certificate background templates and official signatures. |
| Certificate Release & Revoke | `CertificateController.release`, `revoke` | **Active / Verified** | Manual or scheduled release to attendees; revocation with recorded audit reason. |
| Admin Certificate Controls | `CertificateController.adminSearch`, `adminStats`, `adminDelete`| **Active / Verified** | Platform-wide certificate oversight, search by recipient or event, revocation. |

---

### Domain 8: Real-Time & Social Features
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Event Community Chat | `EventCommunityController`, `EventCommunityService` | **Active / Verified** | Real-time chat room per event. REST fallback for history, pagination, polling; STOMP inbound `/app/events/{eventId}/community`, broadcast `/topic/events/{eventId}/community`. Supports pinned messages, announcements, text, file attachments, editing, deletion, muting participants. |
| Direct Peer Messaging | `DirectMessageController`, `DirectMessageService` | **Active / Verified** | 1-on-1 chat between connected users. REST long-polling fallback `/chat/{otherId}/poll`, STOMP queues `/queue/users/{userId}/chat`. Supports voice audio notes (multipart), edit, delete-for-me, and unsend. |
| Peer Networking Suggestions | `NetworkingController.suggestions`, `NetworkingService` | **Active / Verified** | Rule-based + algorithmic suggestions based on common college, department, skills, and mutual events attended. |
| Connection Request Flow | `NetworkingController.connect`, `respond`, `myConnections` | **Active / Verified** | Send request, accept/reject (`PENDING`, `ACCEPTED`, `REJECTED`), list active connections. |
| Push Notifications (SSE) | `NotificationController.stream`, `NotificationService` | **Active / Verified** | `GET /api/notifications/stream?token=...` establishes Server-Sent Events stream. Emits real-time notification envelopes to connected client tabs. |
| Notification Persistence | `NotificationController`, `NotificationRepository` (Mongo) | **Active / Verified (Conditional)** | Persists in MongoDB `notifications` collection when MongoDB enabled; falls back gracefully to in-memory SSE when disabled. |

---

### Domain 9: AI, Copilot, RAG & EventGPT
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Conversational Copilot Agents | `CopilotController`, `ConversationalAgentService`, `AgentOrchestrator` | **Active / Verified** | Unified endpoint `/api/ai/copilot/chat` and `/api/ai/copilot/stream`. Auto-adapts persona based on role: `EventCopilot` (organizer) vs `EventBot` (student/guest). |
| Agent Orchestrator & Planner | `AgentOrchestrator`, `AgentPlanner`, `SystemPrompts` | **Active / Verified** | Analyzes user intent and selects 1 of 4 execution strategies: `DIRECT`, `RAG_ONLY`, `TOOL_CALL`, `TOOL_AND_RAG`. |
| 10 Specialized Agent Tools | `backend/src/ai/agent/tools/` | **Active / Verified** | Guarded execution of: `eventTool`, `bookingTool`, `paymentTool`, `analyticsTool`, `certificateTool`, `emailTool`, `recommendationTool`, `travelTool`, `feedbackTool`, `dashboardTool`. |
| Direct Tool Invocation API | `AgentController.tools`, `invoke`, `EventGptToolService` | **Active / Verified** | Lists available agent tools and allows authorized programmatic invocation with arguments. |
| RAG Vector Knowledge Store | `RAGService`, `VectorIndexService`, `DocumentIndexer` | **Active / Verified** | Chunks and indexes events, FAQs, ratings, certificates. Defaults to MySQL `ai_vector_documents` with in-memory cosine ranking; supports PGVector when configured. |
| Natural Language Event Search | `AIController.nlpSearch`, `AIService.nlpSearch` | **Active / Verified** | Parses natural language query ("find free technical workshops in Chennai next week") into structured filter attributes. |
| Travel AI Assistant | `AIController.travelAssistant`, `EventGptController.travelPlan` | **Active / Verified** | Synthesizes transit options, bus/train/metro links, parking, hotel tie-ups, and weather advice for event venue. |
| Event Description Generator | `AIController.generateDescription`, `AIService` | **Active / Verified** | Organizers submit brief prompt; AI generates full event description, agenda, suggested FAQs, and social media copy. |
| Career Guidance AI | `AIController.careerGuidance`, `AIService` | **Active / Verified** | Analyzes attended events, certificates earned, department, and interests to recommend skill roadmaps. |
| Feedback Sentiment Analysis | `EventGptController.analyzeFeedback`, `RatingService` | **Active / Verified** | Analyzes event review texts, computes sentiment score (-1.0 to +1.0), extracts strengths, weaknesses, and testimonials. |
| Event Outcome Predictions | `EventGptController.predict`, `OrganizerAnalyticsService` | **Active / Verified** | Predicts expected registrations, actual attendance, no-show rate, food requirements, certificate count, revenue, and break-even points. |
| Admin Platform Insights | `AIInsightsController.platformInsights` | **Active / Verified** | Aggregates 12-month event growth, department participation heatmaps, college leaderboards, category distributions, rating health. |
| Fraud & Anomaly Detection | `AIInsightsController.fraudReport`, `FraudDetectionService`| **Active / Verified** | Flags bot bookings, duplicate user registrations, review spam, and anomalies. |
| Behavioral Profile Learner | `AIInsightsController.refreshBehavior`, `BehavioralLearningService`| **Active / Verified** | Asynchronously records searches, clicks, bookings to personalize future recommendation weights. |
| Legacy Chat Endpoints | `ChatController.java`, `ChatbotController.java` | **Legacy Active** | Backward-compatible wrappers for `/api/chatbot` and `/api/ai/chat*`. |

---

### Domain 10: Ratings, Gamification & Leaderboard
| Feature / Capability | Source Implementation | Status | Description & Verified Behavior |
|---|---|---|---|
| Event Reviews & Ratings | `RatingController`, `RatingService` | **Active / Verified** | Verified attendees submit 1-5 star ratings across overall, speaker, venue, food, organization, content quality, value for money, accommodation. |
| Review Moderation | `RatingController.moderate`, `RatingService` | **Active / Verified** | Admin moderation (`APPROVED`, `REJECTED`, `FLAGGED`) with moderation notes. |
| Gamification & XP System | `GamificationController.myProfile`, `GamificationService` | **Active / Verified** | Tracks total XP, level progression, badges earned (e.g. First Event, Active Learner, Top Reviewer). Awards XP on event attendance, certificate receipt, and reviews. |
| Student Portfolio | `PortfolioController.myPortfolio`, `PortfolioService` | **Active / Verified** | Comprehensive student resume: attended events, verified certificates, earned badges, skills inventory, AI summary. |
| College Leaderboard | `OrganizerAnalyticsController.leaderboard`, `CollegeRankingRepository`| **Active / Verified** | Public ranking of participating colleges based on participants, certificates earned, and ratings. |

---

### Domain 11: Schedulers & Background Automations
| Scheduler Task | Class / Trigger | Status | Description & Verified Behavior |
|---|---|---|---|
| Auto-Publish Approved Events | `EventScheduler.autoApproveAndPublishEvents` (every 60s) | **Active / Verified** | Scans pending approvals older than 10 minutes and transitions approved events to `PUBLISHED`. |
| Lifecycle State Transitions | `EventScheduler.runLifecycleTransitions` (every hour) | **Active / Verified** | Moves events from `PUBLISHED`/`UPCOMING` → `LIVE` when date arrives, to `COMPLETED` when end date passes, to `EXPIRED` after certificate deadline. |
| Unpaid Seat Hold Release | `BookingScheduler.releaseExpiredPaymentReservations` (every 60s)| **Active / Verified** | Scans `PENDING` bookings older than 10 minutes, cancels reservation, and restores available seats. |
| Event Day Morning Reminders | `AIWorkflowScheduler.sendEventDayReminders` (daily 06:00) | **Active / Verified** | Sends email alerts to confirmed attendees on event morning with venue and ticket details. |
| Auto-Generate Certificates | `AIWorkflowScheduler.autoGenerateCertificates` (daily 07:00) | **Active / Verified** | Auto-generates certificates for events completed the previous day. |
| Stale Event Archival | `AIWorkflowScheduler.archiveStaleEvents` (daily 23:00) | **Active / Verified** | Marks past completed events older than 90 days. |
| Certificate Recovery Job | `CertificateScheduler.generatePendingCertificates` (daily 02:00)| **Active / Verified** | Recovers any missed certificates across all completed events. |

---

## 3. Inventory Summary & Migration Directives

1. **All 29 controllers** must be converted into Express modular route handlers preserving exact HTTP methods, URI segments, query parameters, headers, and payload schemas.
2. **All 33 relational entities** must be mapped to Mongoose schemas. Redundant/unused entities (`Transaction`, `ActivityLog`) must be documented as deprecated and safely migrated or omitted.
3. **Real-time contracts** must support both the existing native STOMP WebSocket protocol expected by React (`/api/ws-native` and `/api/ws`) and modern Socket.IO channels.
4. **SSE endpoints** (`/notifications/stream`, `/ai/copilot/stream`, `/ai/chat/stream`) must be preserved as pure HTTP Server-Sent Events to maintain zero-change frontend compatibility.
5. **Security contracts** (JWT bearer format, `X-Token-Expiry` header, `TOKEN_EXPIRED` error payload) must match exactly.
