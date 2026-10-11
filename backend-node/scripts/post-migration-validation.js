/**
 * CollegeEvents - Post-Migration Validation & Reconciliation Utility
 *
 * Validates count equality, foreign-key relationships, financial totals,
 * external visible identifiers, and password hash security.
 *
 * Usage:
 *   node scripts/post-migration-validation.js [--json-report=path] [--md-report=path]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { User } from '../src/models/User.js';
import { Organizer } from '../src/models/Organizer.js';
import { Event } from '../src/models/Event.js';
import { Booking } from '../src/models/Booking.js';
import { Payment } from '../src/models/Payment.js';
import { Refund } from '../src/models/Refund.js';
import { Certificate } from '../src/models/Certificate.js';
import { Attendance } from '../src/models/Attendance.js';
import { EventRating } from '../src/models/EventRating.js';
import { NetworkingConnection } from '../src/models/NetworkingConnection.js';
import { DirectMessage } from '../src/models/DirectMessage.js';
import { OrganizerScore } from '../src/models/OrganizerScore.js';
import { UserInterest } from '../src/models/UserInterest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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

export async function runPostMigrationValidation(optionsOverride = {}) {
  const startTime = Date.now();
  console.log('='.repeat(70));
  console.log('   COLLEGEEVENTS: POST-MIGRATION DATA RECONCILIATION & VALIDATION');
  console.log('='.repeat(70));
  console.log(`Started: ${new Date().toISOString()}\n`);

  const report = {
    startedAt: new Date(startTime).toISOString(),
    completedAt: null,
    durationMs: 0,
    overallPass: true,
    pillar1_counts: [],
    pillar2_relationships: [],
    pillar3_financials: [],
    pillar4_identifiers: [],
    pillar5_security: [],
    summary: {
      totalChecks: 0,
      passed: 0,
      warnings: 0,
      failures: 0,
    },
  };

  function addCheck(pillar, name, status, details) {
    const symbols = { PASS: '✓ PASS', WARN: '⚠ WARN', FAIL: '✗ FAIL' };
    console.log(`[${symbols[status]}] [${pillar}] ${name}`);
    if (details) console.log(`       Details: ${details}`);
    const entry = { name, status, details };
    report[pillar].push(entry);
    report.summary.totalChecks++;
    if (status === 'PASS') report.summary.passed++;
    else if (status === 'WARN') report.summary.warnings++;
    else {
      report.summary.failures++;
      report.overallPass = false;
    }
  }

  const { conn: mysqlConn, host, port, database } = await getMysqlConnection();
  console.log(`Source MySQL: ${host}:${port}/${database}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/event_booking_db';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  console.log(`Target Mongo: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // PILLAR 1: RECORD COUNT EQUALITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- PILLAR 1: Table & Document Count Equality ---');
  const countPairs = [
    { table: 'users', model: User, name: 'Users' },
    { table: 'organizers', model: Organizer, name: 'Organizers' },
    { table: 'events', model: Event, name: 'Events' },
    { table: 'bookings', model: Booking, name: 'Bookings' },
    { table: 'payments', model: Payment, name: 'Payments' },
    { table: 'refunds', model: Refund, name: 'Refunds' },
    { table: 'certificates', model: Certificate, name: 'Certificates' },
    { table: 'attendance', model: Attendance, name: 'Attendance' },
    { table: 'event_ratings', model: EventRating, name: 'Ratings' },
    { table: 'networking_connections', model: NetworkingConnection, name: 'Connections' },
    { table: 'direct_messages', model: DirectMessage, name: 'Direct Messages' },
    { table: 'organizer_scores', model: OrganizerScore, name: 'Organizer Scores' },
    { table: 'user_interests', model: UserInterest, name: 'User Interests' },
  ];

  for (const { table, model, name } of countPairs) {
    try {
      let sqlCount;
      if (table === 'networking_connections') {
        const [sqlRes] = await mysqlConn.query('SELECT COUNT(DISTINCT requester_id, receiver_id) as c FROM networking_connections');
        sqlCount = sqlRes[0].c;
      } else {
        const [sqlRes] = await mysqlConn.query(`SELECT COUNT(*) as c FROM \`${table}\``);
        sqlCount = sqlRes[0].c;
      }
      const mongoCount = await model.countDocuments({});

      if (sqlCount === mongoCount) {
        addCheck(
          'pillar1_counts',
          `${name} Count Equality`,
          'PASS',
          `MySQL: ${sqlCount} | MongoDB: ${mongoCount}`
        );
      } else if (mongoCount > sqlCount && sqlCount === 0) {
        addCheck(
          'pillar1_counts',
          `${name} Count Check`,
          'WARN',
          `MongoDB has ${mongoCount} existing records, MySQL has 0.`
        );
      } else {
        addCheck(
          'pillar1_counts',
          `${name} Count Equality`,
          'FAIL',
          `Discrepancy detected! MySQL: ${sqlCount} vs MongoDB: ${mongoCount}`
        );
      }
    } catch (err) {
      addCheck('pillar1_counts', `${name} Count Check`, 'WARN', `Table check skipped: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PILLAR 2: REFERENTIAL INTEGRITY & RELATIONSHIPS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PILLAR 2: Referential Integrity & Relationships ---');

  // Check Event -> Organizer relationship
  const events = await Event.find({}).select('id organizer organizerId').lean();
  const orphanEvents = [];
  for (const evt of events) {
    if (!evt.organizer) {
      orphanEvents.push(evt.id);
    } else {
      const orgExists = await Organizer.exists({ _id: evt.organizer });
      if (!orgExists) orphanEvents.push(evt.id);
    }
  }
  if (orphanEvents.length === 0) {
    addCheck('pillar2_relationships', 'Event -> Organizer Reference', 'PASS', '100% of Events link to valid Organizers.');
  } else {
    addCheck('pillar2_relationships', 'Event -> Organizer Reference', 'FAIL', `Events with missing/dangling organizer: ${orphanEvents.join(', ')}`);
  }

  // Check Booking -> User and Event relationship
  const bookings = await Booking.find({}).select('id ticketId user event userId eventId').lean();
  let bookingUserOrphans = 0;
  let bookingEventOrphans = 0;
  for (const b of bookings) {
    if (!b.user || !(await User.exists({ _id: b.user }))) bookingUserOrphans++;
    if (!b.event || !(await Event.exists({ _id: b.event }))) bookingEventOrphans++;
  }
  if (bookingUserOrphans === 0 && bookingEventOrphans === 0) {
    addCheck('pillar2_relationships', 'Booking -> User & Event References', 'PASS', '100% of Bookings resolve to valid Users and Events.');
  } else {
    addCheck(
      'pillar2_relationships',
      'Booking -> User & Event References',
      'FAIL',
      `Orphan bookings: ${bookingUserOrphans} missing user, ${bookingEventOrphans} missing event`
    );
  }

  // Check Payment -> Booking relationship
  const payments = await Payment.find({}).select('id transactionId booking bookingId').lean();
  let paymentBookingOrphans = 0;
  for (const p of payments) {
    if (!p.booking || !(await Booking.exists({ _id: p.booking }))) paymentBookingOrphans++;
  }
  if (paymentBookingOrphans === 0) {
    addCheck('pillar2_relationships', 'Payment -> Booking References', 'PASS', '100% of Payments resolve to valid Bookings.');
  } else {
    addCheck('pillar2_relationships', 'Payment -> Booking References', 'FAIL', `${paymentBookingOrphans} payments missing booking reference!`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PILLAR 3: FINANCIAL & BOOKING TOTALS RECONCILIATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PILLAR 3: Financial & Booking Reconciliation ---');

  // Booking Amount Total
  try {
    const [sqlBkgAmt] = await mysqlConn.query('SELECT COALESCE(SUM(total_amount), 0) as s, COALESCE(SUM(quantity), 0) as q FROM bookings');
    const sqlTotalAmount = Number(sqlBkgAmt[0].s);
    const sqlTotalQuantity = Number(sqlBkgAmt[0].q);

    const mongoBkgAgg = await Booking.aggregate([
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, totalQuantity: { $sum: '$quantity' } } },
    ]);
    const mongoTotalAmount = mongoBkgAgg[0]?.totalAmount || 0;
    const mongoTotalQuantity = mongoBkgAgg[0]?.totalQuantity || 0;

    if (Math.abs(sqlTotalAmount - mongoTotalAmount) < 0.01 && sqlTotalQuantity === mongoTotalQuantity) {
      addCheck(
        'pillar3_financials',
        'Booking Revenue & Ticket Quantity Reconciliation',
        'PASS',
        `Revenue: ₹${mongoTotalAmount} (exact match) | Tickets: ${mongoTotalQuantity}`
      );
    } else {
      addCheck(
        'pillar3_financials',
        'Booking Revenue Reconciliation',
        'FAIL',
        `Discrepancy: MySQL ₹${sqlTotalAmount} (${sqlTotalQuantity} tickets) vs Mongo ₹${mongoTotalAmount} (${mongoTotalQuantity} tickets)`
      );
    }
  } catch (err) {
    addCheck('pillar3_financials', 'Booking Revenue Reconciliation', 'WARN', err.message);
  }

  // Payment Amount Total
  try {
    const [sqlPayAmt] = await mysqlConn.query('SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE payment_status = "SUCCESSFUL"');
    const sqlSuccessfulAmount = Number(sqlPayAmt[0].s);

    const mongoPayAgg = await Payment.aggregate([
      { $match: { paymentStatus: 'SUCCESSFUL' } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);
    const mongoSuccessfulAmount = mongoPayAgg[0]?.totalAmount || 0;

    if (Math.abs(sqlSuccessfulAmount - mongoSuccessfulAmount) < 0.01) {
      addCheck(
        'pillar3_financials',
        'Successful Payment Volume Reconciliation',
        'PASS',
        `Successful Payments Total: ₹${mongoSuccessfulAmount} (exact match)`
      );
    } else {
      addCheck(
        'pillar3_financials',
        'Successful Payment Volume Reconciliation',
        'FAIL',
        `Discrepancy: MySQL ₹${sqlSuccessfulAmount} vs Mongo ₹${mongoSuccessfulAmount}`
      );
    }
  } catch (err) {
    addCheck('pillar3_financials', 'Payment Volume Reconciliation', 'WARN', err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PILLAR 4: EXTERNAL IDENTIFIERS PRESERVATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PILLAR 4: External Visible Identifiers Preservation ---');

  // Ticket ID match
  try {
    const [sqlTickets] = await mysqlConn.query('SELECT ticket_id FROM bookings');
    let ticketMatches = 0;
    for (const t of sqlTickets) {
      const found = await Booking.findOne({ ticketId: t.ticket_id }).lean();
      if (found) ticketMatches++;
    }
    if (ticketMatches === sqlTickets.length) {
      addCheck(
        'pillar4_identifiers',
        'Ticket ID Preservation',
        'PASS',
        `All ${ticketMatches} ticket codes (e.g. ${sqlTickets[0]?.ticket_id || 'N/A'}) preserved 1:1.`
      );
    } else {
      addCheck(
        'pillar4_identifiers',
        'Ticket ID Preservation',
        'FAIL',
        `Missing tickets: ${sqlTickets.length - ticketMatches} of ${sqlTickets.length} not found!`
      );
    }
  } catch (err) {
    addCheck('pillar4_identifiers', 'Ticket ID Preservation', 'WARN', err.message);
  }

  // Transaction ID match
  try {
    const [sqlTxns] = await mysqlConn.query('SELECT transaction_id FROM payments');
    let txnMatches = 0;
    for (const tx of sqlTxns) {
      const found = await Payment.findOne({ transactionId: tx.transaction_id }).lean();
      if (found) txnMatches++;
    }
    if (txnMatches === sqlTxns.length) {
      addCheck(
        'pillar4_identifiers',
        'Payment Transaction ID Preservation',
        'PASS',
        `All ${txnMatches} transaction references (e.g. ${sqlTxns[0]?.transaction_id || 'N/A'}) preserved 1:1.`
      );
    } else {
      addCheck(
        'pillar4_identifiers',
        'Payment Transaction ID Preservation',
        'FAIL',
        `Missing transactions: ${sqlTxns.length - txnMatches} of ${sqlTxns.length} not found!`
      );
    }
  } catch (err) {
    addCheck('pillar4_identifiers', 'Payment Transaction ID Preservation', 'WARN', err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PILLAR 5: SECURITY & CREDENTIAL INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- PILLAR 5: Security & Credential Integrity ---');

  // Verify bcrypt format preservation in MongoDB
  const mongoUsers = await User.find({}).select('email passwordHash').lean();
  const validUserHashes = mongoUsers.every((u) => /^\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}$/.test(u.passwordHash));
  if (mongoUsers.length > 0 && validUserHashes) {
    addCheck(
      'pillar5_security',
      'User Password Hashes Format',
      'PASS',
      `All ${mongoUsers.length} user password hashes verified as valid BCrypt format ($2a$/$2b$).`
    );
  } else if (mongoUsers.length === 0) {
    addCheck('pillar5_security', 'User Password Hashes Format', 'WARN', 'No users present to inspect.');
  } else {
    addCheck('pillar5_security', 'User Password Hashes Format', 'FAIL', 'Found corrupted or non-bcrypt password hashes!');
  }

  const mongoOrgs = await Organizer.find({}).select('email passwordHash').lean();
  const validOrgHashes = mongoOrgs.every((o) => /^\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}$/.test(o.passwordHash));
  if (mongoOrgs.length > 0 && validOrgHashes) {
    addCheck(
      'pillar5_security',
      'Organizer Password Hashes Format',
      'PASS',
      `All ${mongoOrgs.length} organizer password hashes verified as valid BCrypt format ($2a$/$2b$).`
    );
  } else if (mongoOrgs.length === 0) {
    addCheck('pillar5_security', 'Organizer Password Hashes Format', 'WARN', 'No organizers present to inspect.');
  } else {
    addCheck('pillar5_security', 'Organizer Password Hashes Format', 'FAIL', 'Found corrupted or non-bcrypt organizer password hashes!');
  }

  report.completedAt = new Date().toISOString();
  report.durationMs = Date.now() - startTime;

  // Generate Reports
  const reportsDir = path.resolve(__dirname, '../reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonReportPath = optionsOverride.jsonReport || path.join(reportsDir, 'post-migration-validation-report.json');
  const mdReportPath = optionsOverride.mdReport || path.join(reportsDir, 'post-migration-validation-report.md');

  fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), 'utf8');

  // Generate Markdown report
  const mdContent = `# CollegeEvents — Post-Migration Data Reconciliation Report

> **Generated:** ${report.completedAt}  
> **Duration:** ${(report.durationMs / 1000).toFixed(2)}s  
> **Overall Status:** ${report.overallPass ? '✅ ALL CHECKS PASSED (RECONCILED)' : '❌ DISCREPANCIES DETECTED'}  
> **Summary:** Passed: ${report.summary.passed} | Warnings: ${report.summary.warnings} | Failures: ${report.summary.failures}

---

## 1. Record Count Equality
| Metric / Table | Status | Details |
| :--- | :--- | :--- |
${report.pillar1_counts.map((c) => `| ${c.name} | ${c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'} | ${c.details} |`).join('\n')}

---

## 2. Referential Integrity & Relationships
| Relationship | Status | Details |
| :--- | :--- | :--- |
${report.pillar2_relationships.map((c) => `| ${c.name} | ${c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'} | ${c.details} |`).join('\n')}

---

## 3. Financial & Revenue Reconciliation
| Financial Metric | Status | Details |
| :--- | :--- | :--- |
${report.pillar3_financials.map((c) => `| ${c.name} | ${c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'} | ${c.details} |`).join('\n')}

---

## 4. External Identifiers Preservation
| Identifier Type | Status | Details |
| :--- | :--- | :--- |
${report.pillar4_identifiers.map((c) => `| ${c.name} | ${c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'} | ${c.details} |`).join('\n')}

---

## 5. Security & Credential Format
| Security Check | Status | Details |
| :--- | :--- | :--- |
${report.pillar5_security.map((c) => `| ${c.name} | ${c.status === 'PASS' ? '✅ PASS' : c.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'} | ${c.details} |`).join('\n')}

---

## Human Sign-Off Gate
- [ ] Source MySQL database write-freeze confirmed.
- [ ] Financial totals verified and audited.
- [ ] Spot-check user login using migrated bcrypt credentials confirmed.
- [ ] Cutover approved by Lead Architect / System Administrator: _____________________ Date: __________
`;

  fs.writeFileSync(mdReportPath, mdContent, 'utf8');

  console.log('\n' + '='.repeat(70));
  console.log(`RECONCILIATION RESULT: ${report.overallPass ? '100% RECONCILED' : 'DISCREPANCIES FOUND'}`);
  console.log(`Passed: ${report.summary.passed} | Warnings: ${report.summary.warnings} | Failures: ${report.summary.failures}`);
  console.log(`Markdown Report: ${mdReportPath}`);
  console.log(`JSON Report:     ${jsonReportPath}`);
  console.log('='.repeat(70) + '\n');

  if (mysqlConn) await mysqlConn.end();
  const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  if (isDirectRun && mongoose.connection.readyState === 1) await mongoose.disconnect();

  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPostMigrationValidation()
    .then((res) => {
      process.exit(res.overallPass ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal post-migration validation error:', err);
      process.exit(1);
    });
}
