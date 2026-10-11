/**
 * CollegeEvents - Production MySQL to MongoDB Data Migration Utility
 *
 * Safe, repeatable, dependency-aware batch migration utility.
 *
 * Usage:
 *   node scripts/migrate-mysql-to-mongo.js [--dry-run] [--batch-size=250] [--tables=users,events] [--reconcile]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import all Mongoose models
import { User } from '../src/models/User.js';
import { Organizer } from '../src/models/Organizer.js';
import { Event } from '../src/models/Event.js';
import { Booking } from '../src/models/Booking.js';
import { Payment } from '../src/models/Payment.js';
import { Refund } from '../src/models/Refund.js';
import { Attendance } from '../src/models/Attendance.js';
import { Certificate } from '../src/models/Certificate.js';
import { CertificateTemplate } from '../src/models/CertificateTemplate.js';
import { CertificateHistory } from '../src/models/CertificateHistory.js';
import { EventRating } from '../src/models/EventRating.js';
import { SentimentAnalysis } from '../src/models/SentimentAnalysis.js';
import { OrganizerScore } from '../src/models/OrganizerScore.js';
import { UserInterest } from '../src/models/UserInterest.js';
import { EventRecommendation } from '../src/models/EventRecommendation.js';
import { UserLevel } from '../src/models/UserLevel.js';
import { UserAchievement } from '../src/models/UserAchievement.js';
import { NetworkingConnection } from '../src/models/NetworkingConnection.js';
import { DirectMessage } from '../src/models/DirectMessage.js';
import { EventPrediction } from '../src/models/EventPrediction.js';
import { CollegeRanking } from '../src/models/CollegeRanking.js';
import { ChatSession } from '../src/models/ChatSession.js';
import { AiVectorDocument } from '../src/models/AiVectorDocument.js';
import { Faq } from '../src/models/Faq.js';
import { TutorialVideo } from '../src/models/TutorialVideo.js';
import { Counter } from '../src/models/Counter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Schema for persistent migration ID mapping
const migrationIdMappingSchema = new mongoose.Schema(
  {
    sourceTable: { type: String, required: true },
    sourceId: { type: mongoose.Schema.Types.Mixed, required: true },
    targetCollection: { type: String, required: true },
    targetId: { type: Number, required: true },
    targetObjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    migratedAt: { type: Date, default: Date.now },
  },
  { collection: 'migration_id_mappings' }
);
migrationIdMappingSchema.index({ sourceTable: 1, sourceId: 1 }, { unique: true });

const MigrationIdMapping =
  mongoose.models.MigrationIdMapping ||
  mongoose.model('MigrationIdMapping', migrationIdMappingSchema);

// Parse CLI options
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    batchSize: 250,
    tables: null,
    reconcile: false,
    reportFile: path.resolve(__dirname, '../reports/migration-reconciliation-report.json'),
  };

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-d') options.dryRun = true;
    else if (arg.startsWith('--batch-size=')) options.batchSize = parseInt(arg.split('=')[1], 10) || 250;
    else if (arg.startsWith('--tables=')) options.tables = arg.split('=')[1].split(',').map((t) => t.trim().toLowerCase());
    else if (arg === '--reconcile') options.reconcile = true;
    else if (arg.startsWith('--report-file=')) options.reportFile = path.resolve(arg.split('=')[1]);
  }
  return options;
}

// Memory mapping cache
class IdMappingRegistry {
  constructor() {
    this.cache = new Map(); // key: "table:sourceId" -> { objectId, targetId }
  }

  key(table, id) {
    return `${table.toLowerCase()}:${id}`;
  }

  async loadFromMongo() {
    const mappings = await MigrationIdMapping.find({}).lean();
    for (const m of mappings) {
      this.cache.set(this.key(m.sourceTable, m.sourceId), {
        objectId: m.targetObjectId,
        targetId: m.targetId,
      });
    }
  }

  get(table, id) {
    if (id === null || id === undefined) return null;
    return this.cache.get(this.key(table, id)) || null;
  }

  set(table, id, objectId, targetId) {
    this.cache.set(this.key(table, id), { objectId, targetId });
  }

  async persist(table, id, objectId, targetId, isDryRun) {
    this.set(table, id, objectId, targetId);
    if (!isDryRun) {
      await MigrationIdMapping.updateOne(
        { sourceTable: table.toLowerCase(), sourceId: id },
        {
          $set: {
            targetCollection: table,
            targetId,
            targetObjectId: objectId,
            migratedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }
}

async function getMysqlConnection() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USERNAME || 'root';
  const database = process.env.DB_NAME || 'event_booking_db';
  const passwordsToTry = [
    process.env.MYSQL_PASSWORD,
    process.env.DB_PASSWORD,
    'root123',
    'root',
    '',
  ].filter((p) => p !== undefined);

  for (const password of passwordsToTry) {
    try {
      const conn = await mysql.createConnection({ host, port, user, password, database });
      return { conn, host, port, user, database };
    } catch (err) {
      if (err.code !== 'ER_ACCESS_DENIED_ERROR') throw err;
    }
  }
  throw new Error(`Access denied connecting to MySQL at ${host}:${port} as ${user}`);
}

// Helpers for data conversion
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    if (val.trim().startsWith('[') && val.trim().endsWith(']')) {
      try {
        return JSON.parse(val);
      } catch (e) {}
    }
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseJson(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

export async function runMigration(optionsOverride = {}) {
  const options = { ...parseArgs(), ...optionsOverride };
  const startTime = Date.now();

  console.log('='.repeat(70));
  console.log('   COLLEGEEVENTS: MYSQL TO MONGODB DATA MIGRATION UTILITY');
  console.log('='.repeat(70));
  console.log(`Mode:       ${options.dryRun ? 'DRY-RUN (Simulated - No Database Writes)' : 'LIVE EXECUTION'}`);
  console.log(`Batch Size: ${options.batchSize}`);
  console.log(`Target:     ${options.tables ? options.tables.join(', ') : 'All Dependency Tables'}`);
  console.log(`Started:    ${new Date().toISOString()}\n`);

  const { conn: mysqlConn, host, port, user, database } = await getMysqlConnection();
  console.log(`Connected to MySQL: ${host}:${port}/${database}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/event_booking_db';
  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n`);

  const idMap = new IdMappingRegistry();
  await idMap.loadFromMongo();

  const report = {
    mode: options.dryRun ? 'DRY_RUN' : 'LIVE',
    batchSize: options.batchSize,
    startedAt: new Date(startTime).toISOString(),
    completedAt: null,
    totalDurationMs: 0,
    tables: {},
    overallStats: {
      totalSourceRows: 0,
      totalMigrated: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      totalErrors: 0,
    },
    errors: [],
  };

  // Helper for batch extraction
  async function streamTable(tableName, callback) {
    const [cntRes] = await mysqlConn.query(`SELECT COUNT(*) as c FROM \`${tableName}\``);
    const totalRows = cntRes[0].c;

    const stats = {
      sourceCount: totalRows,
      migratedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      maxId: 0,
    };

    if (totalRows === 0) return stats;

    let offset = 0;
    while (offset < totalRows) {
      const [rows] = await mysqlConn.query(
        `SELECT * FROM \`${tableName}\` ORDER BY id ASC LIMIT ? OFFSET ?`,
        [options.batchSize, offset]
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        try {
          if (row.id && row.id > stats.maxId) stats.maxId = row.id;
          const res = await callback(row);
          if (res === 'UPDATED') stats.updatedCount++;
          else if (res === 'SKIPPED') stats.skippedCount++;
          else stats.migratedCount++;
        } catch (err) {
          stats.errorCount++;
          report.errors.push({
            table: tableName,
            sourceId: row.id,
            error: err.message,
          });
        }
      }
      offset += rows.length;
      process.stdout.write(`\r  [${tableName}] Processed ${Math.min(offset, totalRows)}/${totalRows} rows...`);
    }
    process.stdout.write('\n');
    return stats;
  }

  // Pre-load location table for fast embedding
  const locationMap = new Map();
  try {
    const [locs] = await mysqlConn.query('SELECT * FROM profile_locations');
    for (const loc of locs) {
      if (loc.user_id) locationMap.set(`user:${loc.user_id}`, loc);
      if (loc.organizer_id) locationMap.set(`org:${loc.organizer_id}`, loc);
    }
  } catch (e) {}

  // Pre-load certificate settings for events
  const certSettingsMap = new Map();
  try {
    const [csets] = await mysqlConn.query('SELECT * FROM certificate_settings');
    for (const cs of csets) {
      certSettingsMap.set(cs.event_id, cs);
    }
  } catch (e) {}

  // Pre-load participants grouped by booking_id
  const participantsMap = new Map();
  try {
    const [parts] = await mysqlConn.query('SELECT * FROM participants');
    for (const p of parts) {
      if (!participantsMap.has(p.booking_id)) participantsMap.set(p.booking_id, []);
      participantsMap.get(p.booking_id).push({
        name: p.name,
        email: p.email,
        department: p.department || null,
        college: p.college || null,
        createdAt: parseDate(p.created_at) || new Date(),
      });
    }
  } catch (e) {}

  const shouldRun = (name) => !options.tables || options.tables.includes(name.toLowerCase());

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. USERS
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('users')) {
    console.log('1. Migrating `users` table...');
    const stats = await streamTable('users', async (row) => {
      const loc = locationMap.get(`user:${row.id}`) || {};
      const docData = {
        id: row.id,
        userCode: row.user_code || `USR${String(row.id).padStart(4, '0')}`,
        name: row.name,
        email: (row.email || '').toLowerCase().trim(),
        passwordHash: row.password_hash,
        phone: row.phone || null,
        address: row.address || loc.address || null,
        pinCode: row.pin_code || loc.pin_code || null,
        organizationName: row.organization_name || null,
        city: row.city || loc.city || null,
        state: row.state || loc.state || null,
        country: row.country || loc.country || null,
        dateOfBirth: parseDate(row.date_of_birth),
        gender: row.gender || null,
        profilePicture: row.profile_picture || null,
        emailVerified: Boolean(row.email_verified),
        verificationToken: row.verification_token || null,
        resetPasswordToken: row.reset_password_token || null,
        resetTokenExpiry: parseDate(row.reset_token_expiry),
        accountLocked: Boolean(row.account_locked),
        failedLoginAttempts: row.failed_login_attempts || 0,
        role: row.role === 'ADMIN' ? 'ADMIN' : 'USER',
        location: {
          address: loc.address || row.address || null,
          street: loc.street || null,
          area: loc.area || null,
          city: loc.city || row.city || null,
          district: loc.district || null,
          state: loc.state || row.state || null,
          country: loc.country || row.country || null,
          pinCode: loc.pin_code || row.pin_code || null,
          coordinates: {
            latitude: loc.latitude ? Number(loc.latitude) : null,
            longitude: loc.longitude ? Number(loc.longitude) : null,
          },
        },
      };

      if (!options.dryRun) {
        let existing = await User.findOne({ email: docData.email });
        if (!existing) existing = await User.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('users', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await User.create(docData);
        await idMap.persist('users', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('users', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'users' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.users = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ORGANIZERS
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('organizers')) {
    console.log('2. Migrating `organizers` table...');
    const stats = await streamTable('organizers', async (row) => {
      const loc = locationMap.get(`org:${row.id}`) || {};
      const docData = {
        id: row.id,
        organizerCode: row.organizer_code || `ORG${String(row.id).padStart(4, '0')}`,
        organizerName: row.organizer_name,
        organizationName: row.organization_name || row.organizer_name,
        email: (row.email || '').toLowerCase().trim(),
        passwordHash: row.password_hash,
        phone: row.phone || null,
        address: row.address || loc.address || null,
        pinCode: row.pin_code || loc.pin_code || null,
        city: row.city || loc.city || null,
        state: row.state || loc.state || null,
        country: row.country || loc.country || null,
        organizationLogo: row.organization_logo || null,
        website: row.website || null,
        description: row.description || null,
        emailVerified: Boolean(row.email_verified),
        verificationToken: row.verification_token || null,
        resetPasswordToken: row.reset_password_token || null,
        resetTokenExpiry: parseDate(row.reset_token_expiry),
        isApproved: Boolean(row.is_approved !== 0),
        role: 'ORGANIZER',
        location: {
          address: loc.address || row.address || null,
          street: loc.street || null,
          area: loc.area || null,
          city: loc.city || row.city || null,
          district: loc.district || null,
          state: loc.state || row.state || null,
          country: loc.country || row.country || null,
          pinCode: loc.pin_code || row.pin_code || null,
          coordinates: {
            latitude: loc.latitude ? Number(loc.latitude) : null,
            longitude: loc.longitude ? Number(loc.longitude) : null,
          },
        },
      };

      if (!options.dryRun) {
        let existing = await Organizer.findOne({ email: docData.email });
        if (!existing) existing = await Organizer.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('organizers', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Organizer.create(docData);
        await idMap.persist('organizers', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('organizers', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'organizers' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.organizers = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. EVENTS
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('events')) {
    console.log('3. Migrating `events` table...');
    const stats = await streamTable('events', async (row) => {
      const orgMapping = idMap.get('organizers', row.organizer_id);
      const cs = certSettingsMap.get(row.id) || {};

      const docData = {
        id: row.id,
        organizerId: row.organizer_id,
        organizer: orgMapping?.objectId || null,
        eventName: row.event_name,
        description: row.description || null,
        category: row.category || 'General',
        eventType: row.event_type || 'CONFERENCE',
        eventBanner: row.event_banner || null,
        eventImages: parseArray(row.event_images),
        eventDate: parseDate(row.event_date) || new Date(),
        eventTime: row.event_time || '10:00 AM',
        endDate: parseDate(row.end_date),
        endTime: row.end_time || null,
        venueName: row.venue_name || null,
        location: row.location || null,
        googleMapsUrl: row.google_maps_url || null,
        ticketPrice: Number(row.ticket_price) || 0.0,
        totalSeats: Number(row.total_seats) || 100,
        availableSeats: Number(row.available_seats) >= 0 ? Number(row.available_seats) : Number(row.total_seats),
        status: row.status || 'DRAFT',
        visibility: row.visibility || 'PUBLIC',
        isFeatured: Boolean(row.is_featured),
        tags: parseArray(row.tags),
        organizerDetails: row.organizer_details || null,
        collegeName: row.college_name || null,
        departmentName: row.department_name || null,
        hasCertificate: Boolean(row.has_certificate || cs.certificate_available),
        registrationDeadline: parseDate(row.registration_deadline),
        authorizedDocumentUrl: row.authorized_document_url || null,
        certificateTemplateUrl: row.certificate_template_url || null,
        certificateSignatureName: row.certificate_signature_name || null,
        foodProvided: Boolean(row.food_provided),
        teaCoffeeProvided: Boolean(row.tea_coffee_provided),
        specialDiet: row.special_diet || null,
        accommodationProvided: Boolean(row.accommodation_provided),
        boysHostelAvailable: Boolean(row.boys_hostel_available),
        girlsHostelAvailable: Boolean(row.girls_hostel_available),
        hotelTieupAvailable: Boolean(row.hotel_tieup_available),
        accommodationDetails: {
          checkIn: row.accommodation_check_in || null,
          checkOut: row.accommodation_check_out || null,
          contactPerson: row.accommodation_contact_person || null,
        },
        venueCoordinates: {
          latitude: row.venue_latitude ? Number(row.venue_latitude) : null,
          longitude: row.venue_longitude ? Number(row.venue_longitude) : null,
        },
        estimatedTravelTime: row.estimated_travel_time || null,
        cabEstimate: row.cab_estimate || null,
        nearbyHotels: row.nearby_hotels || null,
        nearbyRestaurants: row.nearby_restaurants || null,
        emergencyContacts: row.emergency_contacts || null,
        whatsappGroupLink: row.whatsapp_group_link || null,
        whatsappContactNumber: row.whatsapp_contact_number || null,
        sessionSchedule: row.session_schedule || null,
        speakerList: row.speaker_list || null,
        liveAnnouncements: row.live_announcements || null,
        certificateSettings: {
          certificateAvailable: Boolean(cs.certificate_available),
          automaticGeneration: Boolean(cs.automatic_generation),
          releaseMode: cs.release_mode || 'MANUAL',
          releaseDate: parseDate(cs.release_date),
          minimumAttendanceRequired: Boolean(cs.minimum_attendance_required !== 0),
          certificateType: cs.certificate_type || 'PARTICIPATION',
          organizerSignatureUrl: cs.organizer_signature_url || null,
          organizerName: cs.organizer_name || null,
          organizationName: cs.organization_name || null,
          verificationBaseUrl: cs.verification_base_url || null,
          certificateExpiry: parseDate(cs.certificate_expiry),
          theme: cs.theme || 'MODERN_BLUE',
          released: Boolean(cs.released),
          releasedAt: parseDate(cs.released_at),
        },
      };

      if (!options.dryRun) {
        let existing = await Event.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('events', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Event.create(docData);
        await idMap.persist('events', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('events', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'events' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.events = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BOOKINGS (with embedded participants)
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('bookings')) {
    console.log('4. Migrating `bookings` table...');
    const stats = await streamTable('bookings', async (row) => {
      const userMapping = idMap.get('users', row.user_id);
      const eventMapping = idMap.get('events', row.event_id);
      const parts = participantsMap.get(row.id) || [];

      const docData = {
        id: row.id,
        ticketId: row.ticket_id,
        userId: row.user_id,
        user: userMapping?.objectId || null,
        eventId: row.event_id,
        event: eventMapping?.objectId || null,
        quantity: Number(row.quantity) || 1,
        totalAmount: Number(row.total_amount) || 0,
        bookingStatus: row.booking_status || 'CONFIRMED',
        ticketStatus: row.ticket_status || 'ACTIVE',
        attendanceStatus: row.attendance_status || 'NOT_ATTENDED',
        qrCodePath: row.qr_code_path || null,
        checkInTime: parseDate(row.check_in_time),
        checkedInBy: row.checked_in_by || null,
        certificateEligible: Boolean(row.certificate_eligible),
        cancellationReason: row.cancellation_reason || null,
        cancelledAt: parseDate(row.cancelled_at),
        expiredAt: parseDate(row.expired_at),
        bookedAt: parseDate(row.booked_at) || new Date(),
        participants: parts,
      };

      if (!options.dryRun) {
        let existing = await Booking.findOne({ ticketId: docData.ticketId });
        if (!existing) existing = await Booking.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('bookings', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Booking.create(docData);
        await idMap.persist('bookings', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('bookings', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'bookings' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.bookings = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PAYMENTS
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('payments')) {
    console.log('5. Migrating `payments` table...');
    const stats = await streamTable('payments', async (row) => {
      const bookingMapping = idMap.get('bookings', row.booking_id);

      const docData = {
        id: row.id,
        transactionId: row.transaction_id,
        bookingId: row.booking_id,
        booking: bookingMapping?.objectId || null,
        amount: Number(row.amount) || 0,
        paymentStatus: row.payment_status || 'SUCCESSFUL',
        paymentMethod: row.payment_method || 'ONLINE',
        gatewayReference: row.gateway_reference || null,
        gatewayOrderId: row.gateway_order_id || null,
        failureReason: row.failure_reason || null,
        paidAt: parseDate(row.paid_at) || new Date(),
      };

      if (!options.dryRun) {
        let existing = await Payment.findOne({ transactionId: docData.transactionId });
        if (!existing) existing = await Payment.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('payments', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Payment.create(docData);
        await idMap.persist('payments', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('payments', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'payments' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.payments = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. REFUNDS
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('refunds')) {
    console.log('6. Migrating `refunds` table...');
    const stats = await streamTable('refunds', async (row) => {
      const payMapping = idMap.get('payments', row.payment_id);

      const docData = {
        id: row.id,
        refundReference: row.refund_reference || `REF-${String(row.id).padStart(6, '0')}`,
        paymentId: row.payment_id,
        payment: payMapping?.objectId || null,
        refundAmount: Number(row.refund_amount) || 0,
        refundStatus: row.refund_status || 'INITIATED',
        reason: row.reason || null,
        refundDate: parseDate(row.refund_date) || new Date(),
      };

      if (!options.dryRun) {
        let existing = await Refund.findOne({ refundReference: docData.refundReference });
        if (!existing) existing = await Refund.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('refunds', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Refund.create(docData);
        await idMap.persist('refunds', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('refunds', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'refunds' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.refunds = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. CERTIFICATES
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('certificates')) {
    console.log('7. Migrating `certificates` table...');
    const stats = await streamTable('certificates', async (row) => {
      const eventMapping = idMap.get('events', row.event_id);
      const userMapping = idMap.get('users', row.user_id);

      const docData = {
        id: row.id,
        certificateId: row.certificate_id,
        eventId: row.event_id,
        event: eventMapping?.objectId || null,
        userId: row.user_id,
        user: userMapping?.objectId || null,
        recipientName: row.recipient_name,
        collegeName: row.college_name || null,
        departmentName: row.department_name || null,
        eventName: row.event_name,
        issuedAt: parseDate(row.issued_at) || new Date(),
        pdfUrl: row.pdf_url || null,
        qrCodeUrl: row.qr_code_url || null,
        imageUrl: row.image_url || null,
        verificationToken: row.verification_token || null,
        certificateType: row.certificate_type || 'PARTICIPATION',
        participantId: row.participant_id || null,
        participantEmail: row.participant_email || null,
        organizerName: row.organizer_name || null,
        organizationName: row.organization_name || null,
        verificationUrl: row.verification_url || null,
        releaseDate: parseDate(row.release_date),
        releasedAt: parseDate(row.released_at),
        revokedAt: parseDate(row.revoked_at),
        revokeReason: row.revoke_reason || null,
        downloadCount: Number(row.download_count) || 0,
        verificationCount: Number(row.verification_count) || 0,
        emailSent: Boolean(row.email_sent),
        emailSentAt: parseDate(row.email_sent_at),
        emailAttemptCount: Number(row.email_attempt_count) || 0,
        emailFailureReason: row.email_failure_reason || null,
        status: row.status || 'PENDING',
      };

      if (!options.dryRun) {
        let existing = await Certificate.findOne({ certificateId: docData.certificateId });
        if (!existing) existing = await Certificate.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('certificates', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Certificate.create(docData);
        await idMap.persist('certificates', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('certificates', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'certificates' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.certificates = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. ATTENDANCE
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('attendance')) {
    console.log('8. Migrating `attendance` table...');
    const stats = await streamTable('attendance', async (row) => {
      const bookingMapping = idMap.get('bookings', row.booking_id);

      const docData = {
        id: row.id,
        ticketId: row.ticket_id,
        bookingId: row.booking_id,
        booking: bookingMapping?.objectId || null,
        checkedInAt: parseDate(row.checked_in_at) || new Date(),
        scannedByOrganizerId: row.scanned_by_organizer_id || null,
      };

      if (!options.dryRun) {
        let existing = await Attendance.findOne({ ticketId: docData.ticketId });
        if (!existing) existing = await Attendance.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('attendance', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await Attendance.create(docData);
        await idMap.persist('attendance', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('attendance', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'attendance' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.attendance = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. EVENT RATINGS & REVIEWS
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('event_ratings')) {
    console.log('9. Migrating `event_ratings` table...');
    const stats = await streamTable('event_ratings', async (row) => {
      const eventMapping = idMap.get('events', row.event_id);
      const userMapping = idMap.get('users', row.user_id);
      const bookingMapping = idMap.get('bookings', row.booking_id);

      const docData = {
        id: row.id,
        eventId: row.event_id,
        event: eventMapping?.objectId || null,
        userId: row.user_id,
        user: userMapping?.objectId || null,
        bookingId: row.booking_id || null,
        booking: bookingMapping?.objectId || null,
        overallRating: Number(row.overall_rating) || 5,
        speakerRating: row.speaker_rating ? Number(row.speaker_rating) : null,
        venueRating: row.venue_rating ? Number(row.venue_rating) : null,
        foodRating: row.food_rating ? Number(row.food_rating) : null,
        organizationRating: row.organization_rating ? Number(row.organization_rating) : null,
        timeManagementRating: row.time_management_rating ? Number(row.time_management_rating) : null,
        contentQualityRating: row.content_quality_rating ? Number(row.content_quality_rating) : null,
        valueForMoneyRating: row.value_for_money_rating ? Number(row.value_for_money_rating) : null,
        reviewText: row.review_text || null,
        photoUrls: parseArray(row.photo_urls),
        isVerifiedAttendance: Boolean(row.is_verified_attendance),
        moderationStatus: row.moderation_status || 'APPROVED',
        moderationNote: row.moderation_note || null,
        isFakeFlagged: Boolean(row.is_fake_flagged),
        sentiment: row.sentiment || null,
        sentimentScore: row.sentiment_score ? Number(row.sentiment_score) : null,
      };

      if (!options.dryRun) {
        let existing = await EventRating.findOne({ userId: docData.userId, eventId: docData.eventId });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          await idMap.persist('event_ratings', row.id, existing._id, existing.id, false);
          return 'UPDATED';
        }
        const created = await EventRating.create(docData);
        await idMap.persist('event_ratings', row.id, created._id, created.id, false);
        return 'CREATED';
      } else {
        const dummyId = new mongoose.Types.ObjectId();
        idMap.set('event_ratings', row.id, dummyId, row.id);
        return 'CREATED';
      }
    });

    if (!options.dryRun && stats.maxId > 0) {
      await Counter.updateOne({ _id: 'event_ratings' }, { $max: { seq: stats.maxId } }, { upsert: true });
    }
    report.tables.event_ratings = stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. SOCIAL, NETWORKING, GAMIFICATION & CHAT
  // ─────────────────────────────────────────────────────────────────────────────
  if (shouldRun('networking_connections')) {
    console.log('10. Migrating `networking_connections` table...');
    const stats = await streamTable('networking_connections', async (row) => {
      const reqMapping = idMap.get('users', row.requester_id);
      const recMapping = idMap.get('users', row.receiver_id);

      const docData = {
        id: row.id,
        requesterId: row.requester_id,
        requester: reqMapping?.objectId || null,
        receiverId: row.receiver_id,
        receiver: recMapping?.objectId || null,
        status: row.status || 'PENDING',
        matchReason: row.match_reason || null,
        matchScore: row.match_score ? Number(row.match_score) : null,
      };

      if (!options.dryRun) {
        let existing = await NetworkingConnection.findOne({
          requesterId: docData.requesterId,
          receiverId: docData.receiverId,
        });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          return 'UPDATED';
        }
        await NetworkingConnection.create(docData);
        return 'CREATED';
      }
      return 'CREATED';
    });
    report.tables.networking_connections = stats;
  }

  if (shouldRun('direct_messages')) {
    console.log('11. Migrating `direct_messages` table...');
    const stats = await streamTable('direct_messages', async (row) => {
      const senderMapping = idMap.get('users', row.sender_id);
      const receiverMapping = idMap.get('users', row.receiver_id);

      const docData = {
        id: row.id,
        senderId: row.sender_id,
        sender: senderMapping?.objectId || null,
        receiverId: row.receiver_id,
        receiver: receiverMapping?.objectId || null,
        content: row.content,
        voiceUrl: row.voice_url || null,
        voiceDuration: Number(row.voice_duration) || 0,
        isRead: Boolean(row.is_read),
        deletedForSender: Boolean(row.deleted_for_sender),
        unsendForEveryone: Boolean(row.unsend_for_everyone),
        sentAt: parseDate(row.sent_at) || new Date(),
      };

      if (!options.dryRun) {
        let existing = await DirectMessage.findOne({ id: docData.id });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          return 'UPDATED';
        }
        await DirectMessage.create(docData);
        return 'CREATED';
      }
    });
    report.tables.direct_messages = stats;
  }

  if (shouldRun('organizer_scores')) {
    console.log('12. Migrating `organizer_scores` table...');
    const stats = await streamTable('organizer_scores', async (row) => {
      const orgMapping = idMap.get('organizers', row.organizer_id);
      const docData = {
        id: row.id,
        organizerId: row.organizer_id,
        organizer: orgMapping?.objectId || null,
        averageRating: Number(row.average_rating) || 0,
        totalEvents: Number(row.total_events) || 0,
        completedEvents: Number(row.completed_events) || 0,
        totalRegistrations: Number(row.total_registrations) || 0,
        totalAttendance: Number(row.total_attendance) || 0,
        attendanceRate: Number(row.attendance_rate) || 0,
        refundRatio: Number(row.refund_ratio) || 0,
        cancellationRate: Number(row.cancellation_rate) || 0,
        overallScore: Number(row.overall_score) || 0,
        badge: row.badge || 'NONE',
        isFeatured: Boolean(row.is_featured),
      };

      if (!options.dryRun) {
        await OrganizerScore.updateOne({ organizerId: docData.organizerId }, { $set: docData }, { upsert: true });
      }
      return 'CREATED';
    });
    report.tables.organizer_scores = stats;
  }

  if (shouldRun('user_interests')) {
    console.log('13. Migrating `user_interests` table...');
    const stats = await streamTable('user_interests', async (row) => {
      const userMapping = idMap.get('users', row.user_id);
      const docData = {
        id: row.id,
        userId: row.user_id,
        user: userMapping?.objectId || null,
        skills: row.skills || null,
        interests: row.interests || null,
        department: row.department || null,
        college: row.college || null,
        yearOfStudy: row.year_of_study || null,
        favoriteCategories: row.favorite_categories || null,
        preferredEventType: row.preferred_event_type || null,
        careerGoal: row.career_goal || null,
      };

      if (!options.dryRun) {
        await UserInterest.updateOne({ userId: docData.userId }, { $set: docData }, { upsert: true });
      }
      return 'CREATED';
    });
    report.tables.user_interests = stats;
  }

  // Calculate totals
  for (const st of Object.values(report.tables)) {
    report.overallStats.totalSourceRows += st.sourceCount;
    report.overallStats.totalMigrated += st.migratedCount;
    report.overallStats.totalUpdated += st.updatedCount;
    report.overallStats.totalSkipped += st.skippedCount;
    report.overallStats.totalErrors += st.errorCount;
  }

  report.completedAt = new Date().toISOString();
  report.totalDurationMs = Date.now() - startTime;

  // Write JSON report
  fs.mkdirSync(path.dirname(options.reportFile), { recursive: true });
  fs.writeFileSync(options.reportFile, JSON.stringify(report, null, 2), 'utf8');

  // Print Summary
  console.log('\n' + '='.repeat(70));
  console.log(`MIGRATION SUMMARY (${report.mode}): COMPLETED in ${(report.totalDurationMs / 1000).toFixed(2)}s`);
  console.log('='.repeat(70));
  console.log(`Source Records Read: ${report.overallStats.totalSourceRows}`);
  console.log(`Created / Inserted:  ${report.overallStats.totalMigrated}`);
  console.log(`Updated (Upserted):  ${report.overallStats.totalUpdated}`);
  console.log(`Skipped:             ${report.overallStats.totalSkipped}`);
  console.log(`Errors Encountered:  ${report.overallStats.totalErrors}`);
  console.log(`Report Generated:    ${options.reportFile}`);
  console.log('='.repeat(70) + '\n');

  if (mysqlConn) await mysqlConn.end();
  const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  if (isDirectRun && mongoose.connection.readyState === 1 && !options.reconcile) {
    await mongoose.disconnect();
  }

  // If reconcile requested, invoke post-migration validation
  if (options.reconcile) {
    console.log('Running automated post-migration reconciliation...');
    const { runPostMigrationValidation } = await import('./post-migration-validation.js');
    await runPostMigrationValidation();
  }

  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigration()
    .then((res) => {
      process.exit(res.overallStats.totalErrors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal migration error:', err);
      process.exit(1);
    });
}
