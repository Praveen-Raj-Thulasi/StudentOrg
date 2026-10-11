/**
 * Automated Test Suite for Data Migration Utility
 * Tests pre-migration checks, dry-run mode, live migration, foreign key resolution,
 * and post-migration reconciliation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { runPreMigrationChecks } from '../../scripts/pre-migration-checks.js';
import { runMigration } from '../../scripts/migrate-mysql-to-mongo.js';
import { runPostMigrationValidation } from '../../scripts/post-migration-validation.js';

import { User } from '../models/User.js';
import { Organizer } from '../models/Organizer.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { DirectMessage } from '../models/DirectMessage.js';

describe('Data Migration Integration Tests (MySQL to MongoDB)', () => {
  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/event_booking_db';
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  it('1. Pre-Migration Checks: should pass connectivity, schema, and constraint validations', async () => {
    const checkResult = await runPreMigrationChecks();
    expect(checkResult.passed).toBe(true);
    expect(checkResult.failures).toBe(0);
    expect(checkResult.checks.length).toBeGreaterThan(5);

    const mysqlConnCheck = checkResult.checks.find((c) => c.name.includes('MySQL Source Connectivity'));
    expect(mysqlConnCheck?.status).toBe('PASS');

    const mongoConnCheck = checkResult.checks.find((c) => c.name.includes('MongoDB Target Connectivity'));
    expect(mongoConnCheck?.status).toBe('PASS');
  });

  it('2. Dry-Run Mode: should simulate migration without modifying records', async () => {
    const dryRunReport = await runMigration({ dryRun: true });
    expect(dryRunReport.mode).toBe('DRY_RUN');
    expect(dryRunReport.overallStats.totalErrors).toBe(0);
    expect(dryRunReport.overallStats.totalSourceRows).toBeGreaterThan(0);
  });

  it('3. Live Migration: should export, transform, and persist records with relational integrity', async () => {
    const liveReport = await runMigration({ dryRun: false });
    expect(liveReport.mode).toBe('LIVE');
    expect(liveReport.overallStats.totalErrors).toBe(0);
    expect(liveReport.overallStats.totalSourceRows).toBeGreaterThan(0);

    // Verify User record
    const user = await User.findOne({ email: 'arun@student.edu' });
    expect(user).toBeDefined();
    expect(user.userCode).toBe('USR0001');
    expect(user.name).toBe('Arun Kumar');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.role).toBe('USER');

    // Verify Organizer record
    const org = await Organizer.findOne({ email: 'techevents@novatech.edu' });
    expect(org).toBeDefined();
    expect(org.organizerCode).toBe('ORG0001');
    expect(org.isApproved).toBe(true);

    // Verify Event record & foreign key resolution
    const event = await Event.findOne({ id: 1 });
    expect(event).toBeDefined();
    expect(event.eventName).toBe('CodeStorm Hackathon 2026');
    expect(event.organizer).toBeDefined();
    expect(event.ticketPrice).toBe(499);
    expect(event.availableSeats).toBe(120);

    // Verify Booking & embedded participants
    const booking = await Booking.findOne({ ticketId: 'TKT-ARUN-001' });
    expect(booking).toBeDefined();
    expect(booking.user).toBeDefined();
    expect(booking.event).toBeDefined();
    expect(booking.quantity).toBe(2);
    expect(booking.totalAmount).toBe(998);
    expect(booking.bookingStatus).toBe('CONFIRMED');

    // Verify Payment & transaction ID
    const payment = await Payment.findOne({ transactionId: 'TXN-001-ARUN' });
    expect(payment).toBeDefined();
    expect(payment.booking).toBeDefined();
    expect(payment.amount).toBe(998);
    expect(payment.paymentStatus).toBe('SUCCESSFUL');
  });

  it('4. Rerun Idempotency: should safely upsert records without duplicate key errors', async () => {
    const rerunReport = await runMigration({ dryRun: false });
    expect(rerunReport.overallStats.totalErrors).toBe(0);
    expect(rerunReport.overallStats.totalUpdated).toBeGreaterThan(0);

    // Confirm count stability
    const userCount = await User.countDocuments({});
    expect(userCount).toBe(10);

    const bookingCount = await Booking.countDocuments({});
    expect(bookingCount).toBe(6);
  });

  it('5. Post-Migration Validation: should achieve 100% reconciliation across all 5 pillars', async () => {
    const valReport = await runPostMigrationValidation();
    expect(valReport.overallPass).toBe(true);
    expect(valReport.summary.failures).toBe(0);
    expect(valReport.summary.passed).toBeGreaterThanOrEqual(20);

    // Check financial reconciliation
    const bkgCheck = valReport.pillar3_financials.find((c) =>
      c.name.includes('Booking Revenue & Ticket Quantity Reconciliation')
    );
    expect(bkgCheck?.status).toBe('PASS');

    // Check ticket code preservation
    const ticketCheck = valReport.pillar4_identifiers.find((c) => c.name.includes('Ticket ID Preservation'));
    expect(ticketCheck?.status).toBe('PASS');
  });
});
