import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { User, Counter } from '../models/index.js';
import { formatMemberNumber } from '../utils/sequenceHelper.js';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run' || arg === '-d') {
      args.dryRun = true;
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  }
  return args;
}

/**
 * Idempotent migration script to safely backfill missing `memberNumber` and `roles` fields
 * for all existing user accounts in MongoDB.
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<Object>} Migration summary
 */
export async function runMemberNumberMigration(options = {}) {
  const isCli = process.argv[1]?.endsWith('migrate-member-numbers.js');
  const cliArgs = parseArgs();
  const dryRun = options.dryRun ?? cliArgs.dryRun ?? false;

  console.log('======================================================================');
  console.log(`Skyline Student Association Hub — Member Number & Roles Migration`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (PREVIEW ONLY)' : 'LIVE EXECUTION'}`);
  console.log('======================================================================');

  if (mongoose.connection.readyState === 0) {
    await connectDB();
  }

  const report = {
    totalUsers: 0,
    alreadyValid: 0,
    migrated: 0,
    skipped: 0,
    conflicts: [],
    dryRun,
    highestAllocatedSeq: 0,
    counterInitializedTo: 0,
  };

  try {
    const allUsers = await User.find({}).sort({ id: 1, createdAt: 1 });
    report.totalUsers = allUsers.length;
    console.log(`[INFO] Found ${report.totalUsers} total user records in collection 'users'.`);

    // 1. Audit existing member numbers for validity and uniqueness
    const seenMemberNumbers = new Map();
    let maxExistingSeq = 0;

    for (const u of allUsers) {
      if (u.memberNumber) {
        const memNum = String(u.memberNumber).trim();
        const match = memNum.match(/^MEM(\d{4,})$/);
        if (!match) {
          report.conflicts.push({
            userId: u.id,
            email: u.email,
            issue: `Malformed memberNumber format: '${memNum}'. Expected 'MEMxxxx'`,
          });
        } else {
          const numVal = parseInt(match[1], 10);
          if (numVal > maxExistingSeq) maxExistingSeq = numVal;
        }

        if (seenMemberNumbers.has(memNum)) {
          report.conflicts.push({
            userId: u.id,
            email: u.email,
            issue: `Duplicate memberNumber detected: '${memNum}', already held by user ${seenMemberNumbers.get(memNum)}`,
          });
        } else {
          seenMemberNumbers.set(memNum, u.id);
        }
      }
    }

    if (report.conflicts.length > 0) {
      console.error(`[CRITICAL] Migration halted! Found ${report.conflicts.length} identifier conflict(s):`);
      report.conflicts.forEach((c) => console.error(` - User ${c.userId} (${c.email}): ${c.issue}`));
      throw new Error(`Migration aborted due to existing memberNumber conflicts: ${JSON.stringify(report.conflicts)}`);
    }

    // 2. Determine initial sequence counter
    const currentCounter = await Counter.findById('memberNumbers');
    let currentSeq = Math.max(maxExistingSeq, currentCounter?.seq || 0);
    report.highestAllocatedSeq = maxExistingSeq;

    console.log(`[INFO] Highest existing numeric member sequence found: ${maxExistingSeq}`);
    console.log(`[INFO] Current counter sequence in DB: ${currentCounter?.seq || 0}`);

    // 3. Process users needing migration
    const pendingUpdates = [];

    for (const u of allUsers) {
      const needsMemberNumber = !u.memberNumber;
      const needsRoles = !Array.isArray(u.roles) || u.roles.length === 0;

      if (!needsMemberNumber && !needsRoles) {
        report.alreadyValid++;
        continue;
      }

      let assignedMemberNumber = u.memberNumber;
      if (needsMemberNumber) {
        currentSeq++;
        assignedMemberNumber = formatMemberNumber(currentSeq);
      }

      let assignedRoles = Array.isArray(u.roles) && u.roles.length > 0 ? [...u.roles] : [];
      if (needsRoles) {
        if (u.role === 'ADMIN') {
          assignedRoles = ['STUDENT', 'PRESIDENT'];
        } else {
          assignedRoles = ['STUDENT'];
        }
      }

      pendingUpdates.push({
        user: u,
        newMemberNumber: assignedMemberNumber,
        newRoles: assignedRoles,
        allocatedSeq: currentSeq,
      });
    }

    console.log(`[INFO] Records needing updates: ${pendingUpdates.length} (Already valid: ${report.alreadyValid})`);

    // 4. Execute updates if not dry-run
    if (dryRun) {
      for (const item of pendingUpdates) {
        console.log(
          `  [PREVIEW] User ID: ${item.user.id} | Email: ${item.user.email} -> MemberNumber: ${item.newMemberNumber} | Roles: [${item.newRoles.join(', ')}] | Existing userCode preserved: ${item.user.userCode}`
        );
      }
      report.migrated = pendingUpdates.length;
      report.counterInitializedTo = currentSeq;
    } else {
      for (const item of pendingUpdates) {
        item.user.memberNumber = item.newMemberNumber;
        item.user.roles = item.newRoles;
        // Preserve existing userCode
        await item.user.save();
        report.migrated++;
      }

      // Synchronize sequence counter atomically above highest allocated
      await Counter.findByIdAndUpdate(
        'memberNumbers',
        { $set: { seq: currentSeq } },
        { upsert: true, new: true }
      );
      report.counterInitializedTo = currentSeq;

      // 5. Build unique index on memberNumber
      try {
        await User.collection.createIndex({ memberNumber: 1 }, { unique: true, sparse: true });
        console.log(`[INFO] Unique sparse index on 'memberNumber' successfully confirmed.`);
      } catch (idxErr) {
        console.warn(`[WARN] Index creation warning: ${idxErr.message}`);
      }
    }

    console.log('======================================================================');
    console.log(`MIGRATION SUMMARY:`);
    console.log(`Total Records:       ${report.totalUsers}`);
    console.log(`Already Valid:       ${report.alreadyValid}`);
    console.log(`Migrated:            ${report.migrated}`);
    console.log(`Conflicts:           ${report.conflicts.length}`);
    console.log(`Sequence Counter:    ${report.counterInitializedTo}`);
    console.log('======================================================================');

    return report;
  } finally {
    if (mongoose.connection.readyState !== 0 && process.env.NODE_ENV !== 'test' && isCli) {
      await disconnectDB();
    }
  }
}

if (process.argv[1]?.endsWith('migrate-member-numbers.js')) {
  runMemberNumberMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default runMemberNumberMigration;
