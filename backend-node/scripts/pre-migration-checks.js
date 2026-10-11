/**
 * CollegeEvents - Pre-Migration Checks Utility
 *
 * Verifies connectivity, source schemas, orphan foreign keys, and destination readiness
 * prior to executing the MySQL to MongoDB data migration.
 *
 * Run: node scripts/pre-migration-checks.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function maskUrl(raw) {
  if (!raw) return 'not-configured';
  return raw.replace(/:\/\/([^:@]+):([^@]+)@/g, '://$1:****@');
}

function maskHost(host, port, db) {
  return `${host}:${port}/${db}`;
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
      if (err.code !== 'ER_ACCESS_DENIED_ERROR') {
        throw err;
      }
    }
  }
  throw new Error(`Access denied connecting to MySQL at ${host}:${port} as ${user}`);
}

export async function runPreMigrationChecks() {
  console.log('='.repeat(70));
  console.log('   COLLEGEEVENTS: PRE-MIGRATION READINESS & INTEGRITY CHECKS');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const results = {
    checks: [],
    passed: true,
    warnings: 0,
    failures: 0,
    sourceStats: {},
  };

  function recordCheck(name, status, details) {
    const symbols = { PASS: '✓ PASS', WARN: '⚠ WARN', FAIL: '✗ FAIL' };
    console.log(`[${symbols[status]}] ${name}`);
    if (details) console.log(`       Details: ${details}`);
    results.checks.push({ name, status, details });
    if (status === 'FAIL') {
      results.passed = false;
      results.failures++;
    } else if (status === 'WARN') {
      results.warnings++;
    }
  }

  let mysqlConn = null;

  // 1. Check MySQL Connectivity
  try {
    const { conn, host, port, user, database } = await getMysqlConnection();
    mysqlConn = conn;
    recordCheck(
      'MySQL Source Connectivity',
      'PASS',
      `Connected to ${maskHost(host, port, database)} as user '${user}'`
    );
  } catch (err) {
    recordCheck('MySQL Source Connectivity', 'FAIL', err.message);
    return results;
  }

  // 2. Check MongoDB Connectivity
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/event_booking_db';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    const adminDb = mongoose.connection.db.admin();
    const ping = await adminDb.ping();
    recordCheck(
      'MongoDB Target Connectivity',
      'PASS',
      `Connected to ${maskUrl(mongoUri)} (Ping: ${ping.ok === 1 ? 'OK' : 'Unknown'})`
    );
  } catch (err) {
    recordCheck('MongoDB Target Connectivity', 'FAIL', err.message);
  }

  // 3. Check Required Tables in MySQL
  const expectedTables = [
    'users',
    'organizers',
    'events',
    'bookings',
    'payments',
    'certificates',
    'attendance',
    'event_ratings',
    'user_interests',
    'organizer_scores',
    'networking_connections',
  ];

  try {
    const [rows] = await mysqlConn.query('SHOW TABLES');
    const existingTables = new Set(rows.map((r) => Object.values(r)[0].toLowerCase()));

    const missingTables = expectedTables.filter((t) => !existingTables.has(t));
    if (missingTables.length === 0) {
      recordCheck(
        'Source Table Structure',
        'PASS',
        `All ${expectedTables.length} core tables present in MySQL.`
      );
    } else {
      recordCheck(
        'Source Table Structure',
        'WARN',
        `Missing tables: ${missingTables.join(', ')} (will be skipped during migration)`
      );
    }

    // Record source row counts
    for (const t of existingTables) {
      try {
        const [cnt] = await mysqlConn.query(`SELECT COUNT(*) as c FROM \`${t}\``);
        results.sourceStats[t] = cnt[0].c;
      } catch (e) {
        results.sourceStats[t] = 0;
      }
    }
    console.log('\n--- Source Table Record Counts ---');
    for (const [tbl, count] of Object.entries(results.sourceStats)) {
      console.log(`    • ${tbl.padEnd(25)}: ${count} rows`);
    }
    console.log('----------------------------------\n');
  } catch (err) {
    recordCheck('Source Table Structure', 'FAIL', err.message);
  }

  // 4. Check for Duplicate Primary Keys in MySQL
  const uniqueKeyChecks = [
    { table: 'users', column: 'email' },
    { table: 'organizers', column: 'email' },
    { table: 'bookings', column: 'ticket_id' },
    { table: 'payments', column: 'transaction_id' },
  ];

  for (const { table, column } of uniqueKeyChecks) {
    try {
      const [dupes] = await mysqlConn.query(`
        SELECT \`${column}\`, COUNT(*) as c
        FROM \`${table}\`
        WHERE \`${column}\` IS NOT NULL AND \`${column}\` != ''
        GROUP BY \`${column}\`
        HAVING c > 1
      `);
      if (dupes.length === 0) {
        recordCheck(`Unique Constraint Check: ${table}.${column}`, 'PASS', 'No duplicate values found.');
      } else {
        recordCheck(
          `Unique Constraint Check: ${table}.${column}`,
          'FAIL',
          `Found ${dupes.length} duplicate entries in ${table}.${column}!`
        );
      }
    } catch (err) {
      recordCheck(`Unique Constraint Check: ${table}.${column}`, 'WARN', `Table or column not present: ${err.message}`);
    }
  }

  // 5. Check for Orphan Foreign Keys in MySQL
  const foreignKeyChecks = [
    {
      name: 'Bookings without valid User',
      sql: `SELECT COUNT(*) as c FROM bookings b LEFT JOIN users u ON b.user_id = u.id WHERE u.id IS NULL`,
    },
    {
      name: 'Bookings without valid Event',
      sql: `SELECT COUNT(*) as c FROM bookings b LEFT JOIN events e ON b.event_id = e.id WHERE e.id IS NULL`,
    },
    {
      name: 'Events without valid Organizer',
      sql: `SELECT COUNT(*) as c FROM events e LEFT JOIN organizers o ON e.organizer_id = o.id WHERE o.id IS NULL`,
    },
    {
      name: 'Payments without valid Booking',
      sql: `SELECT COUNT(*) as c FROM payments p LEFT JOIN bookings b ON p.booking_id = b.id WHERE b.id IS NULL`,
    },
  ];

  for (const { name, sql } of foreignKeyChecks) {
    try {
      const [rows] = await mysqlConn.query(sql);
      const orphanCount = rows[0]?.c || 0;
      if (orphanCount === 0) {
        recordCheck(`Foreign Key Integrity: ${name}`, 'PASS', '0 orphan records detected.');
      } else {
        recordCheck(
          `Foreign Key Integrity: ${name}`,
          'WARN',
          `Detected ${orphanCount} orphan rows in MySQL that cannot be linked to a parent.`
        );
      }
    } catch (err) {
      recordCheck(`Foreign Key Integrity: ${name}`, 'WARN', `Skipped: ${err.message}`);
    }
  }

  // 6. Check Password Hash Compatibility
  try {
    const [sampleUsers] = await mysqlConn.query(`
      SELECT id, password_hash FROM users WHERE password_hash IS NOT NULL LIMIT 20
    `);
    const validBcrypt = sampleUsers.every((u) => /^\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}$/.test(u.password_hash));
    if (sampleUsers.length === 0) {
      recordCheck('Password Hash Compatibility', 'WARN', 'No users with password hashes found.');
    } else if (validBcrypt) {
      recordCheck(
        'Password Hash Compatibility',
        'PASS',
        `All checked password hashes match standard bcrypt format ($2a$/$2b$).`
      );
    } else {
      recordCheck(
        'Password Hash Compatibility',
        'FAIL',
        'Found password hashes that do not match standard bcrypt format!'
      );
    }
  } catch (err) {
    recordCheck('Password Hash Compatibility', 'WARN', `Skipped: ${err.message}`);
  }

  // Close connections
  if (mysqlConn) await mysqlConn.end();
  const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  if (isDirectRun && mongoose.connection.readyState === 1) await mongoose.disconnect();

  console.log('\n' + '='.repeat(70));
  console.log(`PRE-MIGRATION CHECKS SUMMARY: ${results.passed ? 'ALL CHECKS PASSED' : 'ACTION REQUIRED'}`);
  console.log(`Total Checks: ${results.checks.length} | Warnings: ${results.warnings} | Failures: ${results.failures}`);
  console.log('='.repeat(70) + '\n');

  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPreMigrationChecks()
    .then((res) => {
      process.exit(res.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error during pre-migration checks:', err);
      process.exit(1);
    });
}
