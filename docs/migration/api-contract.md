# CollegeEvents — Complete REST & Real-Time API Contract Specification

> **Base URL:** `/api` (configured in production and development; proxied by Vite from `http://localhost:3000/api` to backend)  
> **Protocol:** HTTP/1.1 & HTTP/2, WebSocket (STOMP 1.2), Server-Sent Events (SSE)  
> **Authentication:** Bearer JWT in `Authorization: Bearer <token>` header (or `?token=<token>` on SSE endpoints)

---

## 1. Global Request & Response Specifications

### 1.1 Response Envelope Format (`ApiResponse<T>`)

Every standard JSON endpoint in the application returns an envelope with the following shape:

#### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {},
  "timestamp": "2026-10-10T12:00:00"
}
```

#### Error Response (Validation / Domain Exceptions)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": "must be a well-formed email address",
    "password": "Password must be at least 8 characters"
  },
  "timestamp": "2026-10-10T12:00:00"
}
```

#### Security Error Response (JWT Filter Level)
Emitted by `JwtAuthenticationFilter` before controller dispatch:
```json
{
  "errorCode": "TOKEN_EXPIRED",
  "status": 401,
  "message": "Access token expired",
  "timestamp": "2026-10-10T12:00:00Z",
  "path": "/api/bookings"
}
```
*Note:* The React frontend specifically inspects `status === 401 && data?.errorCode === 'TOKEN_EXPIRED'` to trigger silent background refresh via `/api/auth/refresh-token`.

#### Response Headers
- `X-Token-Expiry`: Injected on every authenticated response containing the epoch millisecond timestamp when the current JWT access token expires.
- `Authorization`: Exposed in CORS configuration.

### 1.2 Pagination Envelope Format (`PagedResponse<T>` / `Page<T>`)
```json
{
  "content": [],
  "page": 0,
  "size": 10,
  "totalElements": 45,
  "totalPages": 5,
  "first": true,
  "last": false
}
```

---

## 2. Authentication & Security Endpoints (`/api/auth`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` | Error Codes |
|---|---|---|---|---|---|
| `POST` | `/auth/user/register` | Public | `UserRegisterRequest`: `{ name, email, password, phone?, address?, pinCode?, organizationName?, city?, state?, country?, dateOfBirth?, gender? }` | `AuthResponse`: `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn, expiresAt, user: { id, name, email, role: "USER", emailVerified } }` | 400 (Validation), 409 (Email exists) |
| `POST` | `/auth/organizer/register` | Public | `OrganizerRegisterRequest`: `{ organizerName, organizationName, email, password, phone?, website?, description? }` | `AuthResponse` with `role: "ORGANIZER"` | 400, 409 |
| `POST` | `/auth/user/login` | Public | `LoginRequest`: `{ email, password }` | `AuthResponse` | 400, 401 (Bad Credentials), 423 (Locked), 429 (Rate limit: >10/min) |
| `POST` | `/auth/organizer/login` | Public | `LoginRequest`: `{ email, password }` | `AuthResponse` | 400, 401, 423, 429 |
| `GET` | `/auth/verify-email` | Public | Query: `?token=<uuid>&role=<USER\|ORGANIZER>` | `null` (message: `"Email verified successfully!"`) | 400 (Invalid/Expired token) |
| `POST` | `/auth/forgot-password` | Public | `ForgotPasswordRequest`: `{ email, role? }` | `null` (message: `"Password reset link sent..."`) | 404 (Not found) |
| `POST` | `/auth/reset-password` | Public | `ResetPasswordRequest`: `{ token, newPassword }` | `null` (message: `"Password reset successfully."`) | 400 (Invalid token) |
| `POST` | `/auth/reset-password/otp`| Public | Body: `{ email, role?, otp, newPassword }` | `null` | 400 (Invalid/expired OTP) |
| `GET` | `/auth/session-status` | Authenticated | Header: `Authorization: Bearer <token>` | `{ active: true, expiresAt: 1720444800000, remainingMs: 1800000, expiresIn: 3600000, role: "USER", userId: 12 }` | 401 (`TOKEN_EXPIRED`) |
| `POST` | `/auth/refresh-token` | Public | `RefreshTokenRequest`: `{ refreshToken: "<jwt>" }` | `AuthResponse` (new access + refresh pair) | 401 (Invalid, expired, or `TOKEN_ALREADY_USED`) |
| `POST` | `/auth/otp/send` | Public | Body: `{ email, role?, name? }` | `{ emailSent: true }` or `{ emailSent: false, pending: true }` | 400, 429 (>1/60s per email or >10/hr per IP), 503 (SMTP failure) |
| `POST` | `/auth/otp/verify` | Public | Body: `{ email, otp, role? }` | `{ verified: true, emailVerified: true }` | 400 (Invalid or expired OTP) |
| `GET` | `/auth/test-email` | Dev Profile Only | Query: `?to=<email>` | `{ recipient, status: "delivered" }` | 400, 403 (Non-dev profile), 500 |

---

## 3. User & Organizer Profile Endpoints (`/api/user`, `/api/organizer`, `/api/lookup`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/user/profile` | `USER` | None | `UserProfileResponse`: `{ id, userCode, name, email, phone, address, pinCode, organizationName, city, state, country, dateOfBirth, gender, profilePicture, emailVerified, role }` |
| `PUT` | `/user/profile` | `USER` | Body: `{ name?, phone?, address?, pinCode?, city?, state?, organizationName?, dateOfBirth?, gender? }` | `UserProfileResponse` (updated) |
| `GET` | `/user/profile/location` | `USER` | None | `ProfileLocationResponse`: `{ address, street, area, city, district, state, country, pinCode, latitude, longitude }` |
| `PUT` | `/user/profile/location` | `USER` | `ProfileLocationRequest`: `{ address, street?, area?, city, district?, state, country, pinCode, latitude, longitude }` | `ProfileLocationResponse` |
| `POST` | `/user/profile/picture` | `USER` | Multipart: `file` | `String` (e.g. `"/uploads/profiles/user_12_uuid.png"`) |
| `PATCH`| `/user/change-password` | `USER` | Body: `{ currentPassword, newPassword }` | `null` |
| `GET` | `/organizer/profile` | `ORGANIZER`| None | `OrganizerProfileResponse`: `{ id, organizerCode, organizerName, organizationName, email, phone, address, city, organizationLogo, website, description, isApproved }` |
| `PUT` | `/organizer/profile` | `ORGANIZER`| Body: `{ organizerName?, organizationName?, phone?, address?, city?, website?, description? }` | `OrganizerProfileResponse` |
| `GET` | `/organizer/profile/location` | `ORGANIZER` | None | `ProfileLocationResponse` |
| `PUT` | `/organizer/profile/location` | `ORGANIZER` | `ProfileLocationRequest` | `ProfileLocationResponse` |
| `POST` | `/organizer/profile/logo` | `ORGANIZER`| Multipart: `file` | `String` (e.g. `"/uploads/logos/org_uuid.png"`) |
| `PATCH`| `/organizer/change-password`| `ORGANIZER`| Body: `{ currentPassword, newPassword }` | `null` |
| `GET` | `/organizer/dashboard` | `ORGANIZER`| None | Map: `{ totalEvents, publishedEvents, totalRegistrations, totalRevenue, upcomingEvents: [], recentBookings: [] }` |
| `GET` | `/organizer/participants` | `ORGANIZER`| None | List: `[ { id, name, email, department, college, bookingId, ticketId, eventName, eventDate } ]` |
| `GET` | `/organizer/events/{id}/participants/export` | `ORGANIZER` | None | Binary CSV file (`Content-Type: text/csv`, attachment header) |
| `POST` | `/organizer/events/{id}/poster` | `ORGANIZER`| None | `String` (Poster URL / HTML template) |
| `GET` | `/lookup/{code}` | Any Auth | Path: `code` (e.g. `USR0012` or `ORG0005`) | `{ type: "USER"|"ORGANIZER", profile: { ... } }` |

---

## 4. Events Lifecycle & Discovery (`/api/events`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/events` | Public | Query: `keyword, category, eventType, location, collegeName, departmentName, venueName, organizerName, dateFrom, dateTo, priceMin, priceMax, freeOnly, paidOnly, interCollege, intraCollege, past, sortBy, page, size` | `PagedResponse<EventResponse>` |
| `GET` | `/events/featured` | Public | None | List: `[ EventResponse ]` (featured upcoming events) |
| `GET` | `/events/categories` | Public | None | List of strings: `["HACKATHON", "TECHNICAL_SYMPOSIUM", "WORKSHOP", ...]` |
| `GET` | `/events/upcoming` | Public | Query: `page, size` | `PagedResponse<EventResponse>` |
| `GET` | `/events/completed` | Public | None | List: `[ EventResponse ]` |
| `GET` | `/events/expired` | Public | None | List: `[ EventResponse ]` |
| `GET` | `/events/{id}` | Public | Path: `id` | `EventResponse` (reveals private emergency/WhatsApp links if confirmed attendee, creator, or admin) |
| `POST` | `/events` | `ORGANIZER`| `EventRequest`: `{ eventName, description, category, eventType, eventBanner?, eventDate, eventTime, endDate?, endTime?, venueName, location, googleMapsUrl?, ticketPrice, totalSeats, collegeName?, departmentName?, hasCertificate?, registrationDeadline?, foodProvided?, accommodationProvided?, ... }` | `EventResponse` (status: `DRAFT`) |
| `PUT` | `/events/{id}` | `ORGANIZER`| `EventRequest` | `EventResponse` |
| `DELETE`| `/events/{id}` | `ORGANIZER`| Path: `id` | `null` (deletes event if no confirmed bookings exist) |
| `PATCH`| `/events/{id}/publish` | `ORGANIZER`| Path: `id` | `EventResponse` (transitions to `PENDING_APPROVAL`, creates approval request) |
| `PATCH`| `/events/{id}/cancel` | `ORGANIZER`| Path: `id` | `EventResponse` (transitions to `CANCELLED`, cascades cancellations) |
| `GET` | `/events/my` | `ORGANIZER`| Query: `status?, page, size` | `PagedResponse<EventResponse>` |
| `POST` | `/events/{id}/banner` | `ORGANIZER`| Multipart: `file` | `String` (stored banner URL) |
| `POST` | `/events/{id}/authorized-document` | `ORGANIZER`| Multipart: `file` | `String` (stored authorization letter URL) |
| `GET` | `/events/{id}/attendance` | `ORGANIZER`| Path: `id` | List: `[ AttendanceResponse ]` |
| `GET` | `/events/{id}/attendance/stats`| `ORGANIZER`| Path: `id` | `AttendanceStatsResponse`: `{ registeredParticipants, checkedInParticipants, absentParticipants, attendancePercentage, liveAttendanceCount }` |
| `POST` | `/events/{id}/complete` | `ORGANIZER` / `ADMIN` | Path: `id` | `EventResponse` (status: `COMPLETED`) |
| `POST` | `/events/{id}/expire` | `ADMIN` | Path: `id` | `EventResponse` (status: `EXPIRED`) |

---

## 5. Ticket Bookings (`/api/bookings`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `POST` | `/bookings` | `USER` | `BookingRequest`: `{ eventId, quantity, participants: [ { name, email, department?, college? } ] }` | `BookingResponse`: `{ id, ticketId, event, user, quantity, totalAmount, bookingStatus: "PENDING", ticketStatus: "ACTIVE", bookedAt, participants: [] }` |
| `GET` | `/bookings` | `USER` | Query: `page, size` | `PagedResponse<BookingResponse>` |
| `GET` | `/bookings/{id}` | `USER` | Path: `id` | `BookingResponse` |
| `GET` | `/bookings/ticket/{ticketId}` | `USER` | Path: `ticketId` | `BookingResponse` |
| `GET` | `/bookings/{id}/attendance` | `USER` | Path: `id` | `AttendanceResponse`: `{ bookingId, ticketId, eventId, eventName, participantName, participantEmail, attendanceStatus, checkInTime, certificateEligible }` |
| `PATCH`| `/bookings/{id}/cancel` | `USER` | Path: `id`, Query: `?reason=...` | `BookingResponse` (status: `CANCELLED`, triggers refund if paid) |

---

## 6. Payments & Razorpay Integration (`/api/payments`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/payments` | `USER` | Query: `page, size` | `Page<PaymentResponse>` |
| `POST` | `/payments/bookings/{id}/razorpay/order` | `USER` | Path: `id` (bookingId) | `RazorpayOrderResponse`: `{ keyId, orderId, currency: "INR", amount: 25000, displayAmount: 250.00, bookingId, eventName, customerName, customerEmail }` |
| `POST` | `/payments/bookings/{id}/razorpay/verify`| `USER` | `RazorpayVerifyRequest`: `{ razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentMethod? }` | `BookingResponse` (status confirmed, QR code generated) |
| `POST` | `/payments/bookings/{id}/processing` | `USER` | `PaymentStatusUpdateRequest`: `{ paymentMethod?, gatewayTransactionId? }` | `PaymentResponse` (status: `PROCESSING`) |
| `POST` | `/payments/bookings/{id}/success` | `USER` | `PaymentStatusUpdateRequest` | `BookingResponse` (marks confirmed, sends email) |
| `POST` | `/payments/bookings/{id}/failed` | `USER` | `PaymentStatusUpdateRequest`: `{ failureReason? }` | `PaymentResponse` (status: `FAILED`) |
| `GET` | `/payments/{paymentId}/refunds` | `USER` / `ADMIN` | Path: `paymentId` | List: `[ RefundResponse ]` |
| `GET` | `/payments/refunds/my` | `USER` | None | List: `[ RefundResponse ]` (user refund history) |

---

## 7. Attendance & QR Ticket Check-In (`/api/attendance`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `POST` | `/attendance/scan` | `ORGANIZER`| `AttendanceScanRequest`: `{ eventId, ticketId, scanMethod: "QR_CAMERA"\|"BARCODE_SCANNER"\|"MANUAL" }` | `AttendanceResponse` (returns 200 on success, 409 Conflict if already checked in) |
| `POST` | `/attendance/scan/{ticketId}` | `ORGANIZER`| Path: `ticketId`, Query: `?eventId=...` | Legacy check-in, delegates to `/attendance/scan` |
| `PATCH`| `/attendance/events/{eventId}/bookings/{bookingId}/present` | `ORGANIZER`| Path: `eventId, bookingId` | `AttendanceResponse` (manual attendance override) |
| `GET` | `/attendance/events/{eventId}` | `ORGANIZER`| Path: `eventId` | List: `[ AttendanceResponse ]` |
| `GET` | `/attendance/events/{eventId}/stats`| `ORGANIZER`| Path: `eventId` | `AttendanceStatsResponse` |
| `GET` | `/attendance/bookings/{bookingId}` | `USER` | Path: `bookingId` | `AttendanceResponse` |
| `POST` | `/attendance/relay/{eventId}/{sessionId}` | `ORGANIZER`| Body: `{ ticketId: "EVT-...", device: "Mobile Scanner" }` | `null` (relays ticket over WebSocket topic `/topic/scanner-relay/{eventId}/{sessionId}`) |

---

## 8. Certificates Management (`/api/certificates`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/certificates/my` | `USER` | Query: `page, size, q?` | `Page<Certificate>` (triggers background recovery for missing certs) |
| `GET` | `/certificates/verify/{certificateId}`| Public | Path: `certificateId` (e.g. `CRT-2026-X9A2`) | `Certificate`: `{ certificateId, recipientName, eventName, issuedAt, collegeName, departmentName, status, verificationCount }` |
| `GET` | `/certificates/download/{certificateId}`| Authenticated | Path: `certificateId` | Binary PDF stream (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."`) |
| `GET` | `/certificates/events/{eventId}` | `ORGANIZER`| Path: `eventId` | List: `[ Certificate ]` |
| `GET` | `/certificates/events/{eventId}/participants`| `ORGANIZER`| Query: `q?, department?, college?` | List: `[ { userId, name, email, department, college, attended, hasCertificate, eligible } ]` |
| `POST` | `/certificates/events/{eventId}/generate`| `ORGANIZER`| Path: `eventId` | `{ generated: 45, skipped: [] }` |
| `POST` | `/certificates/events/{eventId}/generate-missing`| `ORGANIZER`| Path: `eventId` | `{ generated: 3 }` |
| `POST` | `/certificates/events/{eventId}/generate-selected`| `ORGANIZER`| Body: `{ userIds: [ 12, 15, 18 ] }` | `{ generated: 3, skipped: [] }` |
| `POST` | `/certificates/events/{eventId}/release`| `ORGANIZER`| Path: `eventId` | `{ released: 48 }` |
| `POST` | `/certificates/events/{eventId}/template`| `ORGANIZER`| Multipart: `file`, Query: `?signatureName=...` | `String` (stored template path) |
| `POST` | `/certificates/events/{eventId}/signature`| `ORGANIZER`| Multipart: `file` | `String` (stored signature image path) |
| `POST` | `/certificates/{certificateId}/email`| `ORGANIZER`| Path: `certificateId` | `Certificate` (queues delivery email) |
| `PATCH`| `/certificates/{certificateId}/revoke`| `ORGANIZER`| Body: `{ reason: "..." }` | `Certificate` (status: `REVOKED`) |
| `GET` | `/certificates/admin` | `ADMIN` | Query: `q?, page, size` | `Page<Certificate>` |
| `GET` | `/certificates/admin/stats` | `ADMIN` | None | `{ totalCertificates, verifiedCount, revokedCount, activeEventsWithCertificates }` |
| `DELETE`| `/certificates/admin/{certificateId}`| `ADMIN` | Path: `certificateId` | `"OK"` |

---

## 9. Real-Time Community Chat & Direct Messages (`/api/events/.../community`, `/api/chat`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/events/{eventId}/community` | Authenticated | Path: `eventId` | `{ eventId, eventName, totalMembers, isClosed, isMuted, myRole, announcements: [] }` |
| `GET` | `/events/{eventId}/community/messages` | Authenticated | Query: `limit=50` | List: `[ { id, senderId, senderName, senderRole, message, messageType, attachmentUrl, pinned, announcement, sentAt } ]` |
| `GET` | `/events/{eventId}/community/messages/poll` | Authenticated | Query: `afterId=120` | List of newer messages (incremental poll fallback) |
| `GET` | `/events/{eventId}/community/messages/older`| Authenticated | Query: `beforeId=50` | List of older messages (infinite scroll pagination) |
| `POST` | `/events/{eventId}/community/messages` | Authenticated | Body: `{ message, messageType?, attachmentUrl?, announcement?, pinned? }` | Saved message object (broadcasts on `/topic/events/{id}/community`) |
| `POST` | `/events/{eventId}/community/messages/attachment` | Authenticated | Multipart: `file`, Param: `message?` | Saved message object with attachment URL |
| `PATCH`| `/events/{eventId}/community/messages/{id}`| Sender / Org | Body: `{ message }` | Updated message object |
| `DELETE`| `/events/{eventId}/community/messages/{id}`| Sender / Org | Path: `id` | Updated message (marked `deleted=true`) |
| `PATCH`| `/events/{eventId}/community/messages/{id}/pin`| `ORGANIZER` | Query: `pinned=true\|false` | Updated message object |
| `PATCH`| `/events/{eventId}/community/close` | `ORGANIZER` | Query: `closed=true\|false` | `null` |
| `POST` | `/events/{eventId}/community/mute` | `ORGANIZER` | Body: `{ senderId, senderRole, minutes }` | `null` |
| `POST` | `/chat/{receiverId}` | `USER` | Body: `{ content }` | Saved direct message (broadcasts on `/queue/users/{id}/chat`) |
| `GET` | `/chat/{otherId}` | `USER` | Path: `otherId` | List: `[ DirectMessage ]` |
| `GET` | `/chat/{otherId}/poll` | `USER` | Query: `lastId=0` | List of newer direct messages |
| `GET` | `/chat/unread` | `USER` | None | `{ unread: 4 }` |
| `POST` | `/chat/{receiverId}/voice` | `USER` | Multipart: `audio`, Param: `duration=12` | Saved direct message with voice URL |
| `PATCH`| `/chat/messages/{id}` | `USER` | Body: `{ content }` | Updated message |
| `DELETE`| `/chat/messages/{id}` | `USER` | Path: `id` | Message deleted for current user |
| `DELETE`| `/chat/messages/{id}/everyone` | `USER` | Path: `id` | Message unsend for everyone |

---

## 10. Peer Networking & Gamification (`/api/networking`, `/api/gamification`, `/api/portfolio`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/networking/suggestions` | `USER` | None | List: `[ { user: UserSummary, matchScore, commonFactors: [ "Same college", "Attended 2 shared events" ] } ]` |
| `POST` | `/networking/connect/{receiverId}`| `USER` | Path: `receiverId` | `{ id, requesterId, receiverId, status: "PENDING", matchScore }` |
| `PATCH`| `/networking/{id}/respond` | `USER` | Query: `?status=ACCEPTED\|REJECTED` | `{ id, status }` |
| `GET` | `/networking/my-connections` | `USER` | None | List: `[ ConnectionSummary ]` |
| `GET` | `/networking/pending` | `USER` | None | List: `[ PendingRequestSummary ]` |
| `GET` | `/gamification/my` | `USER` | None | `{ totalXp: 350, currentLevel: 3, nextLevelXp: 500, eventsAttended: 4, certificatesEarned: 3, badges: [ { badgeType, badgeName, earnedAt, iconUrl } ] }` |
| `GET` | `/portfolio/my` | `USER` | None | `{ studentName, college, department, totalEventsAttended, certificates: [], badges: [], skills: [], aiSummary: "Active technical participant..." }` |

---

## 11. Ratings, Reviews & Recommendations (`/api/ratings`, `/api/recommendations`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `POST` | `/ratings/events/{eventId}` | `USER` | `EventRating`: `{ overallRating: 5, speakerRating?, venueRating?, foodRating?, organizationRating?, contentQualityRating?, valueForMoneyRating?, reviewText? }` | `EventRating` |
| `PUT` | `/ratings/events/{eventId}/my` | `USER` | `EventRating` (allowed within 7 days) | `EventRating` |
| `GET` | `/ratings/events/{eventId}` | Public | Query: `page, size` | `Page<PublicReview>` |
| `GET` | `/ratings/events/{eventId}/summary`| Public | Path: `eventId` | `{ averageRating: 4.6, totalReviews: 32, ratingBreakdown: { 5: 20, 4: 8, ... }, sentimentScore: 0.85, sentimentLabel: "POSITIVE" }` |
| `GET` | `/ratings/events/{eventId}/my` | `USER` | Path: `eventId` | `EventRating` (or `null`) |
| `GET` | `/ratings/events/{eventId}/eligibility`| `USER` | Path: `eventId` | `{ eligible: true, alreadyReviewed: false, canEdit: false, daysRemaining: 7 }` |
| `PATCH`| `/ratings/{ratingId}/moderate` | `ADMIN` | Query: `?status=APPROVED\|REJECTED, ?note=...` | `EventRating` |
| `GET` | `/recommendations/discover` | Public / User| Query: `lat?, lon?` | `{ recommended: [], trending: [], nearYou: [], popular: [], aiPicks: [] }` |
| `GET` | `/recommendations/interests` | `USER` | None | `UserInterest`: `{ skills, interests, department, college, favoriteCategories, careerGoal }` |
| `PUT` | `/recommendations/interests` | `USER` | `UserInterest` | `UserInterest` |

---

## 12. AI, Copilot, RAG & EventGPT (`/api/ai/...`)

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `POST` | `/ai/copilot/chat` | Public / Auth | `AIChatRequest`: `{ message: "Show analytics", sessionId?: "uuid" }` | `AIChatResponse`: `{ sessionId, answer, provider: "gemini", sources: [], actions: [], timestamp }` |
| `GET` | `/ai/copilot/stream` | Public / Auth | Query: `?message=...&sessionId=...`, Header: `Authorization: Bearer <token>` | `text/event-stream` emitting `session`, `token`, `done`, `error` |
| `GET` | `/ai/copilot/sessions` | Authenticated | None | List: `[ { sessionId, title, updatedAt } ]` |
| `GET` | `/ai/copilot/persona` | Public / Auth | None | `{ name: "EventCopilot"\|"EventBot", role, description, capabilities: [], avatar }` |
| `POST` | `/ai/chat` | Public / Auth | `AIChatRequest`: `{ message, history?: [], sessionId? }` | `AIChatResponse` (backward-compatibility alias to agent) |
| `GET` | `/ai/chat/stream` | Public / Auth | Query: `?message=...&sessionId=...` | `text/event-stream` |
| `GET` | `/ai/chat/sessions` | Authenticated | None | List of recent chat sessions |
| `POST` | `/chatbot` | Public | Body: `{ message }` | `{ answer: "..." }` (legacy endpoint) |
| `GET` | `/ai/search` | Public / User| Query: `?q="free workshops next week"` | List: `[ EventResponse ]` (NLP parsed search) |
| `GET` | `/ai/events/{id}/summary` | Public | Path: `id` | `{ whoShouldAttend: "...", keyTakeaways: "...", agendaHighlights: "..." }` |
| `POST` | `/ai/events/generate-description`| Public / Org| Body: `{ prompt: "AI hackathon with cash prizes" }` | `{ description: "...", agenda: "...", faqs: [], captions: [] }` |
| `GET` | `/ai/career-guidance` | `USER` | None | `String` (personalized career roadmap markdown) |
| `GET` | `/ai/events/{id}/travel` | Public / Auth | Path: `id` | Travel info cards (bus, train, parking, weather, hotels) |
| `GET` | `/ai/eventgpt/events/{id}/travel-plan`| Public / Auth | Path: `id` | Detailed venue travel directions |
| `GET` | `/ai/eventgpt/events/{id}/travel`| Authenticated | Path: `id` | Authenticated travel view with private contact numbers |
| `POST` | `/ai/eventgpt/events/{id}/qa` | Authenticated | Body: `{ question }` | `{ answer: "..." }` (Q&A answering using event context) |
| `GET` | `/ai/eventgpt/events/{id}/packing-checklist`| Authenticated | Path: `id` | `{ items: [ "Laptop", "Charger", "Student ID card" ] }` |
| `POST` | `/ai/eventgpt/events/{id}/feedback-analysis`| `ORGANIZER` / `ADMIN` | Path: `id` | `{ satisfactionScore, sentiment, strengths: [], weaknesses: [], suggestions: [] }` |
| `POST` | `/ai/eventgpt/events/{id}/prediction`| `ORGANIZER`| Path: `id` | `{ predictedRegistrations, predictedAttendance, predictedRevenue, noShowRate }` |
| `GET` | `/ai/eventgpt/status` | Public | None | Phase status map |
| `GET` | `/ai/agent/tools` | Authenticated | None | List: `[ "eventTool", "bookingTool", "paymentTool", ... ]` |
| `POST` | `/ai/agent/invoke` | Authenticated | `AgentToolRequest`: `{ toolName, arguments: {}, prompt? }` | `AgentToolResponse`: `{ toolName, success: true, result: {} }` |
| `POST` | `/ai/rag/index` | `ORGANIZER` / `ADMIN` | None | `{ indexedChunks: 124, status: "completed" }` |
| `GET` | `/ai/rag/status` | `ORGANIZER` / `ADMIN` | None | `{ provider: "mysql"\|"pgvector", indexedDocuments: 124, embeddingCache: "enabled" }` |
| `GET` | `/ai/insights/platform` | `ADMIN` | None | Platform-wide analytics dashboard payload |
| `GET` | `/ai/insights/fraud` | `ADMIN` | None | Fraud anomaly report |
| `POST` | `/ai/insights/behavior/refresh/{id}`| `ADMIN` | Path: `id` | `"Behavioral profile refresh queued"` |
| `GET` | `/ai/insights/behavior/me` | `USER` | None | `{ message: "...", userId }` |

---

## 13. Notifications, Help Center, Admin & Analytics

| Method | Endpoint | Role | Request Body / Query | Success Response `data` |
|---|---|---|---|---|
| `GET` | `/notifications` | Authenticated | Query: `page=0, size=20` | `Page<Notification>` |
| `GET` | `/notifications/unread` | Authenticated | None | `Long` (unread count) |
| `PATCH`| `/notifications/read-all` | Authenticated | None | `null` |
| `GET` | `/notifications/stream` | Authenticated | Query: `?token=<jwt>` | `text/event-stream` pushing live notification envelopes |
| `GET` | `/help` | Public | Query: `search?, category?` | `{ faqs: [], videos: [], contactSupport: {} }` |
| `GET` | `/help/faqs` | Public | Query: `search?, category?` | List: `[ Faq ]` |
| `POST` | `/help/faqs` | `ADMIN` | `FaqRequest`: `{ question, answer, category, displayOrder }` | `Faq` |
| `PUT` | `/help/faqs/{id}` | `ADMIN` | `FaqRequest` | `Faq` |
| `GET` | `/help/videos` | Public | None | List: `[ TutorialVideo ]` |
| `POST` | `/help/videos` | `ADMIN` | `TutorialVideoRequest`: `{ title, description, videoUrl, category, durationSeconds }` | `TutorialVideo` |
| `PUT` | `/help/videos/{id}` | `ADMIN` | `TutorialVideoRequest` | `TutorialVideo` |
| `DELETE`| `/help/videos/{id}` | `ADMIN` | Path: `id` | `null` |
| `GET` | `/admin/dashboard` | `ADMIN` | None | `{ totalUsers, totalOrganizers, totalEvents, pendingApprovals, totalRevenue }` |
| `GET` | `/admin/ai-metrics` | `ADMIN` | None | `{ totalCalls, cacheHits, cacheMisses, avgLatencyMs }` |
| `GET` | `/admin/approvals` | `ADMIN` | Query: `status?, page, size` | `Page<ApprovalRequest>` |
| `POST` | `/admin/events/{eventId}/review`| `ADMIN` | `ApprovalDecisionRequest`: `{ decision: "APPROVE"\|"REJECT", reason? }` | `EventResponse` |
| `GET` | `/admin/users` | `ADMIN` | Query: pagination | `Page<User>` |
| `GET` | `/admin/organizers` | `ADMIN` | Query: pagination | `Page<Organizer>` |
| `GET` | `/admin/events` | `ADMIN` | Query: pagination | `Page<Event>` |
| `GET` | `/admin/payments` | `ADMIN` | Query: pagination | `Page<Payment>` |
| `GET` | `/admin/refunds` | `ADMIN` | Query: pagination | `Page<Refund>` |
| `PATCH`| `/admin/refunds/{id}/status` | `ADMIN` | `RefundStatusUpdateRequest`: `{ status, note? }` | `RefundResponse` |
| `GET` | `/admin/audit-logs` | `ADMIN` | Query: pagination | `Page<AuditLog>` |
| `GET` | `/organizer/analytics` | `ORGANIZER`| None | Full organizer performance metrics with AI suggestions |
| `GET` | `/organizer/analytics/leaderboard`| Public | Query: `limit=20` | List: `[ { collegeName, participants, rankPosition } ]` |
| `GET` | `/organizer/analytics/ask` | `ORGANIZER`| Query: `?q="how many registered for workshop?"`| `String` (plain English answer from analytics data) |
| `GET` | `/organizer/analytics/predict/{id}`| `ORGANIZER`| Path: `id` | Predictive metrics for specified event |

---

## 14. Real-Time WebSocket Specifications

### Connection Endpoints
- Raw Native STOMP WebSocket: `ws://localhost:8080/api/ws-native`
- SockJS STOMP Endpoint: `http://localhost:8080/api/ws`
- Connect Header: `Authorization: Bearer <jwt_access_token>` (validated in `WebSocketChannelInterceptor`)

### STOMP Channels & Topics
1. **Event Community Chat:**
   - Client sends to: `/app/events/{eventId}/community`
   - Client subscribes to: `/topic/events/{eventId}/community`
   - Broadcast payload: `{ "action": "created"|"updated"|"deleted", "message": { ... } }`
2. **Direct Peer Chat:**
   - Inbound HTTP endpoint: `POST /api/chat/{receiverId}`
   - Client subscribes to: `/queue/users/{myUserId}/chat`
   - Broadcast payload: `{ "action": "created"|"updated"|"deletedForMe", "message": { ... } }`
3. **External Scanner Relay:**
   - Inbound HTTP endpoint: `POST /api/attendance/relay/{eventId}/{sessionId}`
   - Organizer browser subscribes to: `/topic/scanner-relay/{eventId}/{sessionId}`
   - Broadcast payload: `{ "ticketId": "EVT-...", "device": "iPhone", "eventId": 12 }`
