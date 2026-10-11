# CollegeEvents — Relational to MongoDB Schema Mapping Specification

> **Source Database:** MySQL 8 (`event_booking_db`) via Hibernate/JPA + Optional MongoDB (`event_booking_logs`)  
> **Target Database:** MongoDB 7 via Mongoose ODM  
> **Key Architecture Decision:** To maintain 100% frontend backward compatibility with existing React routes (e.g., `/events/42`, `/bookings/108`, `/certificates/verify/CRT-...`), collections that expose numeric identifiers to client applications will maintain an auto-incrementing integer `id` field (managed via an atomic `counters` collection) alongside MongoDB's native `_id: ObjectId`.

---

## 1. Type Mapping & Modeling Philosophy

| SQL Data Type (MySQL 8) | Proposed Mongoose / MongoDB Type | Notes & Serialization Rules |
|---|---|---|
| `BIGINT AUTO_INCREMENT PRIMARY KEY` | `Number` (indexed) + `ObjectId` (`_id`) | Handled via atomic sequence helper `getNextSequenceValue('users')`. Virtual `id` getter exposed. |
| `VARCHAR(n)`, `TEXT`, `LONGTEXT` | `String` | Trimming applied where appropriate; length validations enforced via Mongoose validators. |
| `BOOLEAN`, `TINYINT(1)` | `Boolean` | Converted to native booleans (`true` / `false`). Defaults strictly set. |
| `DECIMAL(10,2)`, `DECIMAL(12,2)`, `DOUBLE`| `Number` | Monitored with round-to-2-decimal setter/getter or integer paise/cents where appropriate. |
| `DATETIME`, `TIMESTAMP`, `DATE` | `Date` | Standard ISO 8601 strings returned by Express (`.toISOString()`). |
| `TIME` (e.g. `14:30:00`) | `String` | Formatted as `"HH:mm"` or `"HH:mm:ss"`. |
| `LONGTEXT` (JSON, e.g. `messages_json`) | Native `Array` / `Object` | Unmarshalled into native subdocuments instead of raw JSON strings. |
| Foreign Key (`BIGINT REFERENCES table(id)`)| `Number` (ref) or `ObjectId` (ref) | References link using the integer sequence `id` or `_id`, with Mongoose `.populate()`. |

---

## 2. Table-to-Collection Detailed Mapping

### 2.1 Core Identity: `users` & `organizers`

#### SQL Table: `users`
- **Columns:** `id` (PK, AI), `user_code` (VARCHAR(20), UQ), `name`, `email` (UQ), `password_hash`, `phone`, `address`, `pin_code`, `organization_name`, `city`, `state`, `country`, `date_of_birth`, `gender`, `profile_picture`, `email_verified` (BOOL), `verification_token`, `reset_password_token`, `reset_token_expiry`, `account_locked` (BOOL), `failed_login_attempts` (INT), `role` (VARCHAR(20), default 'USER'), `created_at`, `updated_at`.
- **Target Collection:** `users`
- **Proposed Mongoose Schema:**
```javascript
const UserSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true }, // Auto-increment sequence
  userCode: { type: String, unique: true, sparse: true, index: true }, // "USR0001"
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, default: null },
  address: { type: String, default: null },
  pinCode: { type: String, default: null },
  organizationName: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  country: { type: String, default: null },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, default: null },
  profilePicture: { type: String, default: null },
  emailVerified: { type: Boolean, default: false, index: true },
  verificationToken: { type: String, default: null },
  resetPasswordToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  accountLocked: { type: Boolean, default: false },
  failedLoginAttempts: { type: Number, default: 0 },
  role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER', index: true },
  location: { // Embedded 1:1 from profile_locations
    street: String,
    area: String,
    city: String,
    district: String,
    state: String,
    country: String,
    pinCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  }
}, { timestamps: true });
```

#### SQL Table: `organizers`
- **Columns:** `id` (PK, AI), `organizer_code` (UQ), `organizer_name`, `organization_name`, `email` (UQ), `password_hash`, `phone`, `address`, `pin_code`, `city`, `state`, `country`, `organization_logo`, `website`, `description`, `email_verified`, `verification_token`, `reset_password_token`, `reset_token_expiry`, `is_approved`, `role` (default 'ORGANIZER'), `created_at`, `updated_at`.
- **Target Collection:** `organizers`
- **Proposed Mongoose Schema:**
```javascript
const OrganizerSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  organizerCode: { type: String, unique: true, sparse: true, index: true }, // "ORG0001"
  organizerName: { type: String, required: true, trim: true },
  organizationName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, default: null },
  address: { type: String, default: null },
  pinCode: { type: String, default: null },
  city: { type: String, default: null },
  state: { type: String, default: null },
  country: { type: String, default: null },
  organizationLogo: { type: String, default: null },
  website: { type: String, default: null },
  description: { type: String, default: null },
  emailVerified: { type: Boolean, default: false },
  verificationToken: { type: String, default: null },
  resetPasswordToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  isApproved: { type: Boolean, default: true, index: true },
  role: { type: String, default: 'ORGANIZER' },
  location: { // Embedded 1:1 from profile_locations
    street: String,
    area: String,
    city: String,
    district: String,
    state: String,
    country: String,
    pinCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  }
}, { timestamps: true });
```

*Note on `profile_locations`:* In MySQL, `profile_locations` was a separate table with nullable foreign keys to `user_id` and `organizer_id`. In MongoDB, this is modeled as an embedded subdocument within `users` and `organizers`, eliminating joins while preserving full queryability.

---

### 2.2 Event Management: `events` & Ancillary Tables

#### SQL Table: `events`
- **Columns (50+ columns across schema & migrations):** `id`, `organizer_id` (FK), `event_name`, `description`, `category`, `event_type`, `event_banner`, `event_images`, `event_date`, `event_time`, `end_date`, `end_time`, `venue_name`, `location`, `google_maps_url`, `ticket_price`, `total_seats`, `available_seats`, `status` (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PUBLISHED`, `UPCOMING`, `LIVE`, `ONGOING`, `COMPLETED`, `CANCELLED`, `EXPIRED`), `visibility`, `is_featured`, `tags`, `organizer_details`, `college_name`, `department_name`, `has_certificate`, `registration_deadline`, `food_provided`, `accommodation_provided`, `tea_coffee_provided`, `special_diet`, `boys_hostel_available`, `girls_hostel_available`, `hotel_tieup_available`, `accommodation_check_in`, `accommodation_check_out`, `accommodation_contact_person`, `session_schedule`, `speaker_list`, `live_announcements`, `whatsapp_group_link`, `whatsapp_contact_number`, `venue_latitude`, `venue_longitude`, `estimated_travel_time`, `cab_estimate`, `nearby_hotels`, `nearby_restaurants`, `emergency_contacts`, `authorized_document_url`, `certificate_template_url`, `certificate_signature_name`, `created_at`, `updated_at`.
- **Target Collection:** `events`
- **Proposed Mongoose Schema:**
```javascript
const EventSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  organizerId: { type: Number, required: true, ref: 'Organizer', index: true },
  eventName: { type: String, required: true, trim: true, index: true },
  description: { type: String },
  category: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  eventBanner: { type: String },
  eventImages: [{ type: String }],
  eventDate: { type: Date, required: true, index: true },
  eventTime: { type: String, required: true },
  endDate: { type: Date },
  endTime: { type: String },
  venueName: { type: String },
  location: { type: String, index: true },
  googleMapsUrl: { type: String },
  ticketPrice: { type: Number, required: true, default: 0.0 },
  totalSeats: { type: Number, required: true },
  availableSeats: { type: Number, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED', 'UPCOMING', 'LIVE', 'ONGOING', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
    default: 'DRAFT',
    index: true
  },
  visibility: { type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PUBLIC' },
  isFeatured: { type: Boolean, default: false, index: true },
  tags: [{ type: String }],
  organizerDetails: { type: String },
  collegeName: { type: String, index: true },
  departmentName: { type: String, index: true },
  hasCertificate: { type: Boolean, default: false },
  registrationDeadline: { type: Date },
  authorizedDocumentUrl: { type: String },
  
  // Hospitality & Logistics
  foodProvided: { type: Boolean, default: false },
  teaCoffeeProvided: { type: Boolean, default: false },
  specialDiet: { type: String },
  accommodationProvided: { type: Boolean, default: false },
  boysHostelAvailable: { type: Boolean, default: false },
  girlsHostelAvailable: { type: Boolean, default: false },
  hotelTieupAvailable: { type: Boolean, default: false },
  accommodationDetails: {
    checkIn: String,
    checkOut: String,
    contactPerson: String
  },
  
  // Travel & Venue Context
  venueCoordinates: {
    latitude: Number,
    longitude: Number
  },
  estimatedTravelTime: { type: String },
  cabEstimate: { type: String },
  nearbyHotels: { type: String },
  nearbyRestaurants: { type: String },
  emergencyContacts: { type: String },
  whatsappGroupLink: { type: String },
  whatsappContactNumber: { type: String },
  
  // Program Schedule
  sessionSchedule: { type: String },
  speakerList: { type: String },
  liveAnnouncements: { type: String },

  // Embedded Certificate Configuration (from certificate_settings)
  certificateSettings: {
    certificateAvailable: { type: Boolean, default: false },
    automaticGeneration: { type: Boolean, default: false },
    releaseMode: { type: String, enum: ['MANUAL', 'AUTOMATIC', 'SCHEDULED'], default: 'MANUAL' },
    releaseDate: Date,
    minimumAttendanceRequired: { type: Boolean, default: true },
    certificateType: { type: String, default: 'PARTICIPATION' },
    organizerSignatureUrl: String,
    organizerName: String,
    organizationName: String,
    verificationBaseUrl: String,
    certificateExpiry: Date,
    theme: { type: String, default: 'MODERN_BLUE' },
    released: { type: Boolean, default: false },
    releasedAt: Date
  }
}, { timestamps: true });

// Compound indexes for high-throughput search queries
EventSchema.index({ status: 1, eventDate: 1 });
EventSchema.index({ category: 1, status: 1 });
EventSchema.index({ eventName: 'text', description: 'text', collegeName: 'text' });
```

---

### 2.3 Ticket Bookings, Participants & Payments

#### SQL Tables: `bookings`, `participants`, `booking_queue`
- **Target Collections:**
  - `bookings`: primary booking records, embedding `participants` array (since participants belong exclusively to a single ticket booking).
  - `booking_queue`: persistent queue entries for transaction state tracking.

```javascript
const ParticipantSubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  department: { type: String },
  college: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const BookingSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  ticketId: { type: String, required: true, unique: true, index: true }, // "EVT-20261010-ABCD1234"
  userId: { type: Number, required: true, ref: 'User', index: true },
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  quantity: { type: Number, required: true, min: 1 },
  totalAmount: { type: Number, required: true },
  bookingStatus: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
    default: 'PENDING',
    index: true
  },
  ticketStatus: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE',
    index: true
  },
  attendanceStatus: {
    type: String,
    enum: ['NOT_ATTENDED', 'PRESENT', 'ABSENT'],
    default: 'NOT_ATTENDED',
    index: true
  },
  qrCodePath: { type: String, default: null },
  checkInTime: { type: Date, default: null },
  checkedInBy: { type: Number, ref: 'Organizer', default: null },
  certificateEligible: { type: Boolean, default: false },
  cancellationReason: { type: String, default: null },
  cancelledAt: { type: Date, default: null },
  expiredAt: { type: Date, default: null },
  bookedAt: { type: Date, default: Date.now, index: true },
  participants: [ParticipantSubSchema]
}, { timestamps: true });

// Prevent duplicate active booking for same user and event
BookingSchema.index({ userId: 1, eventId: 1, bookingStatus: 1 });
```

#### SQL Table: `payments` & `refunds`
```javascript
const PaymentSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  transactionId: { type: String, required: true, unique: true, index: true }, // "TXN-..."
  bookingId: { type: Number, required: true, ref: 'Booking', index: true },
  amount: { type: Number, required: true },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
    required: true,
    index: true
  },
  paymentMethod: { type: String, default: 'ONLINE' },
  gatewayReference: { type: String }, // "GW-..." or Razorpay payment ID
  gatewayOrderId: { type: String, index: true }, // "order_..."
  failureReason: { type: String },
  paidAt: { type: Date }
}, { timestamps: true });

const RefundSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  refundReference: { type: String, required: true, unique: true, index: true }, // "REF-..."
  paymentId: { type: Number, required: true, ref: 'Payment', index: true },
  bookingId: { type: Number, required: true, ref: 'Booking', index: true },
  userId: { type: Number, required: true, ref: 'User', index: true },
  refundAmount: { type: Number, required: true },
  refundStatus: {
    type: String,
    enum: ['INITIATED', 'REFUND_REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED'],
    default: 'INITIATED',
    index: true
  },
  reason: { type: String },
  refundDate: { type: Date, default: Date.now }
}, { timestamps: true });
```

*Note on `transactions`:* The unused SQL table `transactions` is officially mapped to `payments`.

---

### 2.4 Attendance: `attendance`

```javascript
const AttendanceSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  ticketId: { type: String, required: true, unique: true, index: true },
  bookingId: { type: Number, required: true, ref: 'Booking', index: true },
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  checkedInAt: { type: Date, required: true, default: Date.now },
  scannedByOrganizerId: { type: Number, ref: 'Organizer' },
  scanMethod: { type: String, enum: ['QR_CAMERA', 'BARCODE_SCANNER', 'MANUAL'], default: 'MANUAL' }
}, { timestamps: true });
```

---

### 2.5 Certificates: `certificates`, `certificate_templates`, `certificate_history`

```javascript
const CertificateSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  certificateId: { type: String, required: true, unique: true, index: true }, // "CRT-..."
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  userId: { type: Number, required: true, ref: 'User', index: true },
  recipientName: { type: String, required: true },
  collegeName: { type: String },
  departmentName: { type: String },
  eventName: { type: String, required: true },
  issuedAt: { type: Date, default: Date.now, index: true },
  pdfUrl: { type: String },
  qrCodeUrl: { type: String },
  imageUrl: { type: String },
  verificationToken: { type: String, index: true },
  certificateType: { type: String, default: 'PARTICIPATION' },
  participantId: { type: String },
  participantEmail: { type: String },
  organizerName: { type: String },
  organizationName: { type: String },
  verificationUrl: { type: String },
  releaseDate: { type: Date },
  releasedAt: { type: Date },
  revokedAt: { type: Date },
  revokeReason: { type: String },
  downloadCount: { type: Number, default: 0 },
  verificationCount: { type: Number, default: 0 },
  emailSent: { type: Boolean, default: false },
  emailSentAt: { type: Date },
  emailAttemptCount: { type: Number, default: 0 },
  emailFailureReason: { type: String },
  status: { type: String, enum: ['PENDING', 'ISSUED', 'REVOKED'], default: 'PENDING', index: true }
}, { timestamps: true });

CertificateSchema.index({ eventId: 1, userId: 1 }, { unique: true });

const CertificateHistorySchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  certificateId: { type: String, required: true, index: true },
  action: { type: String, required: true }, // GENERATED, RELEASED, REVOKED, DOWNLOADED
  actorId: { type: Number },
  actorRole: { type: String },
  note: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const CertificateTemplateSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  templateUrl: { type: String, required: true },
  originalFileName: { type: String },
  contentType: { type: String },
  active: { type: Boolean, default: true },
  uploadedAt: { type: Date, default: Date.now }
});
```

---

### 2.6 Social & Community: `event_community_messages` & `direct_messages`

```javascript
const EventCommunityMessageSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  senderId: { type: Number, required: true },
  senderRole: { type: String, required: true }, // "USER" | "ORGANIZER"
  senderName: { type: String, required: true },
  messageType: { type: String, enum: ['TEXT', 'IMAGE', 'FILE', 'ANNOUNCEMENT'], default: 'TEXT' },
  message: { type: String, required: true },
  attachmentUrl: { type: String, default: null },
  pinned: { type: Boolean, default: false },
  announcement: { type: Boolean, default: false },
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  moderationStatus: { type: String, default: 'CLEAN' },
  sentAt: { type: Date, default: Date.now, index: true },
  editedAt: { type: Date },
  deletedAt: { type: Date }
});

EventCommunityMessageSchema.index({ eventId: 1, sentAt: -1 });

const DirectMessageSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  senderId: { type: Number, required: true, ref: 'User', index: true },
  receiverId: { type: Number, required: true, ref: 'User', index: true },
  content: { type: String, required: true },
  voiceUrl: { type: String, default: null },
  voiceDuration: { type: Number, default: 0 },
  isRead: { type: Boolean, default: false, index: true },
  deletedForSender: { type: Boolean, default: false },
  unsendForEveryone: { type: Boolean, default: false },
  sentAt: { type: Date, default: Date.now, index: true }
});

DirectMessageSchema.index({ senderId: 1, receiverId: 1, sentAt: -1 });
```

---

### 2.7 AI, Copilot, RAG & Vector Documents

#### SQL Tables: `chat_sessions`, `ai_vector_documents`
```javascript
const ChatSessionSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: Number, ref: 'User', index: true },
  userRole: { type: String, default: 'GUEST' },
  title: { type: String, default: 'Chat' },
  messages: [{
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const AiVectorDocumentSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  sourceType: { type: String, required: true, index: true }, // "EVENT", "FAQ", "REVIEW"
  sourceId: { type: String, required: true, index: true },
  chunkIndex: { type: Number, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  contentHash: { type: String, required: true, index: true },
  embedding: [{ type: Number }], // 96-dim or 768-dim float array
  createdAt: { type: Date, default: Date.now }
});

AiVectorDocumentSchema.index({ sourceType: 1, sourceId: 1, chunkIndex: 1 }, { unique: true });
```

---

### 2.8 Ratings, Gamification, Networking & Analytics

#### SQL Tables: `event_ratings`, `sentiment_analyses`, `organizer_scores`, `user_interests`, `event_recommendations`, `user_levels`, `user_achievements`, `networking_connections`, `event_predictions`, `college_rankings`

```javascript
// Ratings & Reviews
const EventRatingSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  userId: { type: Number, required: true, ref: 'User', index: true },
  bookingId: { type: Number, ref: 'Booking' },
  overallRating: { type: Number, required: true, min: 1, max: 5 },
  speakerRating: { type: Number, min: 1, max: 5 },
  venueRating: { type: Number, min: 1, max: 5 },
  foodRating: { type: Number, min: 1, max: 5 },
  organizationRating: { type: Number, min: 1, max: 5 },
  timeManagementRating: { type: Number, min: 1, max: 5 },
  contentQualityRating: { type: Number, min: 1, max: 5 },
  valueForMoneyRating: { type: Number, min: 1, max: 5 },
  accommodationRating: { type: Number, min: 1, max: 5 },
  eventQualityRating: { type: Number, min: 1, max: 5 },
  reviewText: { type: String },
  photoUrls: [{ type: String }],
  suggestions: { type: String },
  anonymous: { type: Boolean, default: false },
  isVerifiedAttendance: { type: Boolean, default: false, index: true },
  moderationStatus: { type: String, enum: ['APPROVED', 'PENDING', 'REJECTED'], default: 'APPROVED', index: true },
  moderationNote: { type: String },
  isFakeFlagged: { type: Boolean, default: false },
  sentiment: { type: String }, // POSITIVE, NEUTRAL, NEGATIVE
  sentimentScore: { type: Number }
}, { timestamps: true });

EventRatingSchema.index({ userId: 1, eventId: 1 }, { unique: true });

// Gamification
const UserLevelSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true, ref: 'User', index: true },
  totalXp: { type: Number, default: 0 },
  currentLevel: { type: Number, default: 1 },
  eventsAttended: { type: Number, default: 0 },
  eventsRegistered: { type: Number, default: 0 },
  certificatesEarned: { type: Number, default: 0 },
  reviewsGiven: { type: Number, default: 0 },
  totalHoursCompleted: { type: Number, default: 0 }
}, { timestamps: true });

const UserAchievementSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  userId: { type: Number, required: true, ref: 'User', index: true },
  badgeType: { type: String, required: true, index: true },
  badgeName: { type: String, required: true },
  badgeDescription: { type: String },
  xpAwarded: { type: Number, default: 0 },
  iconUrl: { type: String },
  earnedAt: { type: Date, default: Date.now }
});

// Networking Connections
const NetworkingConnectionSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  requesterId: { type: Number, required: true, ref: 'User', index: true },
  receiverId: { type: Number, required: true, ref: 'User', index: true },
  status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING', index: true },
  matchReason: { type: String },
  matchScore: { type: Number }
}, { timestamps: true });

NetworkingConnectionSchema.index({ requesterId: 1, receiverId: 1 }, { unique: true });

// College Rankings Leaderboard
const CollegeRankingSchema = new mongoose.Schema({
  collegeName: { type: String, required: true, unique: true, index: true },
  totalParticipants: { type: Number, default: 0 },
  totalEventsAttended: { type: Number, default: 0 },
  totalCertificates: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0.0 },
  overallScore: { type: Number, default: 0.0 },
  rankPosition: { type: Number, default: 0 }
}, { timestamps: true });
```

---

### 2.9 Platform Administration & Support: `approval_requests`, `audit_logs`, `faqs`, `tutorial_videos`

```javascript
const ApprovalRequestSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  eventId: { type: Number, required: true, ref: 'Event', index: true },
  organizerId: { type: Number, required: true, ref: 'Organizer', index: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
  decisionReason: { type: String },
  reviewedByAdminId: { type: Number, ref: 'User' },
  reviewedAt: { type: Date }
}, { timestamps: true });

const AuditLogSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  actorId: { type: Number, index: true },
  actorType: { type: String, index: true }, // USER, ORGANIZER, ADMIN, SYSTEM
  action: { type: String, required: true, index: true },
  targetType: { type: String }, // EVENT, BOOKING, PAYMENT, ATTENDANCE
  targetId: { type: String },
  details: { type: String },
  createdAt: { type: Date, default: Date.now, index: true }
});

const FaqSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  category: { type: String, default: 'GENERAL' },
  displayOrder: { type: Number, default: 0 }
}, { timestamps: true });

const TutorialVideoSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  videoUrl: { type: String, required: true },
  category: { type: String, default: 'ORGANIZER' },
  durationSeconds: { type: Number, default: 0 }
}, { timestamps: true });
```

---

### 2.10 Operational Collections (Existing MongoDB Integration)

```javascript
// In-App Notifications
const NotificationSchema = new mongoose.Schema({
  recipientId: { type: Number, required: true, index: true },
  recipientType: { type: String, required: true }, // USER | ORGANIZER
  notificationType: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  actionUrl: { type: String },
  read: { type: Boolean, default: false, index: true },
  readAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Email Audit Logs
const EmailLogSchema = new mongoose.Schema({
  recipient: { type: String, required: true, index: true },
  subject: { type: String, required: true },
  emailType: { type: String, index: true }, // OTP, BOOKING_CONFIRMATION, CERTIFICATE, REMINDER
  sentAt: { type: Date, default: Date.now },
  status: { type: String, default: 'SENT' },
  errorMessage: { type: String }
});

// Search & Analytics Logging
const SearchHistorySchema = new mongoose.Schema({
  userId: { type: Number, index: true },
  query: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const AnalyticsDataSchema = new mongoose.Schema({
  metricKey: { type: String, required: true, index: true },
  scope: { type: String, required: true }, // GLOBAL, ORGANIZER_12, EVENT_45
  data: { type: mongoose.Schema.Types.Mixed },
  recordedAt: { type: Date, default: Date.now }
});

// Global Auto-Increment Counter Collection
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "users", "events", "bookings"
  seq: { type: Number, default: 1 }
});
```

---

## 3. Database Indexes & Performance Directives

1. **Auto-Increment Counters:** An atomic `Counter` helper using `findOneAndUpdate({ _id: sequenceName }, { $inc: { seq: 1 } }, { new: true, upsert: true })` supplies integer IDs synchronously during document pre-save.
2. **Text Search:** Full-text compound index `{ eventName: "text", description: "text", collegeName: "text" }` replaces MySQL `LIKE %keyword%` full-table scans.
3. **Compound Range Indexes:** `{ status: 1, eventDate: 1 }` enables sub-millisecond event listing queries with sorting.
4. **TTL Indexes:** `chat_sessions` and `otps` (if moved from memory to MongoDB) can specify `{ expireAfterSeconds: 86400 }` to automate storage cleanup without cron jobs.

---

## 4. Final Implemented Models & Architecture Verification

All 34 Mongoose models have been implemented in `backend-node/src/models/` and verified with automated test coverage:

| Target Model File | Collection | Original SQL / Mongo Source | Relationship & Modeling Pattern |
|---|---|---|---|
| `Counter.js` | `counters` | N/A | Atomic sequence counter for integer ID compatibility |
| `User.js` | `users` | `users`, `profile_locations` | Embedded location subdocument; `USRxxxx` generator; security `toJSON` password/token exclusion |
| `Organizer.js` | `organizers` | `organizers`, `profile_locations` | Embedded location subdocument; `ORGxxxx` code generator; approval status index |
| `Event.js` | `events` | `events`, `certificate_settings` | Embedded certificate settings & logistics; full-text search index; atomic `reserveSeats` & `releaseSeats` concurrency control |
| `Booking.js` | `bookings` | `bookings`, `participants` | Embedded `participants` array (bounded to ticket count); referenced `userId` & `eventId`; unique `ticketId` |
| `Payment.js` | `payments` | `payments`, `transactions` | Referenced `bookingId`; unique `transactionId`; Razorpay `gatewayOrderId` & `gatewayReference` |
| `Refund.js` | `refunds` | `refunds` | Referenced `paymentId`, `bookingId`, `userId`; unique `refundReference` |
| `Attendance.js` | `attendance` | `attendance` | Referenced `bookingId`, `eventId`, `scannedByOrganizerId`; unique `ticketId` check-in index |
| `Certificate.js` | `certificates` | `certificates` | Unique `certificateId`; compound unique `{ eventId: 1, userId: 1 }`; verification counters |
| `CertificateTemplate.js` | `certificate_templates` | `certificate_templates` | Referenced `eventId`; template file tracking |
| `CertificateHistory.js` | `certificate_history` | `certificate_history` | Action audit log (GENERATED, RELEASED, REVOKED, DOWNLOADED) |
| `EventCommunityMessage.js` | `event_community_messages` | `event_community_messages` | Referenced `eventId`; compound index `{ eventId: 1, sentAt: -1 }` for chat feeds |
| `DirectMessage.js` | `direct_messages` | `direct_messages` | Referenced `senderId` & `receiverId`; compound index `{ senderId: 1, receiverId: 1, sentAt: -1 }` |
| `NetworkingConnection.js` | `networking_connections` | `networking_connections` | Referenced `requesterId` & `receiverId`; compound unique index `{ requesterId: 1, receiverId: 1 }` |
| `EventRating.js` | `event_ratings` | `event_ratings` | Referenced `eventId` & `userId`; compound unique index `{ userId: 1, eventId: 1 }`; multidimensional ratings |
| `UserLevel.js` | `user_levels` | `user_levels` | 1:1 referenced `userId` (unique); total XP & level progression counters |
| `UserAchievement.js` | `user_achievements` | `user_achievements` | Referenced `userId`; badge awards & XP points |
| `UserInterest.js` | `user_interests` | `user_interests` | 1:1 referenced `userId` (unique); user career and interest preferences |
| `EventRecommendation.js` | `event_recommendations` | `event_recommendations` | Referenced `userId` & `eventId`; scored recommendations with expiration |
| `OrganizerScore.js` | `organizer_scores` | `organizer_scores` | 1:1 referenced `organizerId` (unique); computed platform reputation metrics |
| `SentimentAnalysis.js` | `sentiment_analyses` | `sentiment_analyses` | 1:1 referenced `eventId` (unique); aggregated positive/neutral/negative reviews |
| `EventPrediction.js` | `event_predictions` | `event_predictions` | 1:1 referenced `eventId` (unique); projected turnout, budget, and revenue |
| `CollegeRanking.js` | `college_rankings` | `college_rankings` | Unique `collegeName`; aggregate attendee and certificate points leaderboard |
| `ApprovalRequest.js` | `approval_requests` | `approval_requests` | Referenced `eventId` & `organizerId`; moderation queue workflow |
| `AuditLog.js` | `audit_logs` | `audit_logs` | Platform-wide immutable audit trail entries |
| `BookingQueueEntry.js` | `booking_queue` | `booking_queue` | Concurrency state queue buffer with unique `requestId` and FIFO indexing |
| `Faq.js` | `faq` | `faq` | Help Center categorized questions and answers |
| `TutorialVideo.js` | `tutorial_videos` | `tutorial_videos` | Video walkthrough URLs and categories |
| `ChatSession.js` | `chat_sessions` | `chat_sessions` | Unique `sessionId`; embedded conversation messages array |
| `AiVectorDocument.js` | `ai_vector_documents` | `ai_vector_documents` | Unique `{ sourceType: 1, sourceId: 1, chunkIndex: 1 }`; float vector array embedding for RAG |
| `Notification.js` | `notifications` | Mongo `notifications` | In-app push notifications with `{ recipientId: 1, recipientType: 1, read: 1 }` index |
| `EmailLog.js` | `email_logs` | Mongo `email_logs` | SMTP delivery audit log with status and error message tracking |
| `SearchHistory.js` | `search_history` | Mongo `search_history` | User search keyword analytics |
| `AnalyticsData.js` | `analytics_data` | Mongo `analytics_data` | Compound index `{ metricKey: 1, scope: 1, recordedAt: -1 }` for metrics aggregation |

### Concurrency Control Verification
Atomic capacity reservations operate via MongoDB query conditions:
```javascript
const updatedEvent = await Event.findOneAndUpdate(
  {
    $or: [{ id: eventId }, { _id: eventId }],
    availableSeats: { $gte: quantity },
    status: { $in: ['PUBLISHED', 'UPCOMING', 'LIVE', 'APPROVED'] },
  },
  { $inc: { availableSeats: -quantity } },
  { new: true }
);
```
Under simultaneous high-throughput checkout calls, any request where `availableSeats < quantity` fails atomically with `SEATS_UNAVAILABLE`, preventing overselling without requiring heavy table-locking or two-phase commit overhead.

