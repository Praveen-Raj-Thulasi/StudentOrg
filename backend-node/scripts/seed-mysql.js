/**
 * Local Development Helper: Seed MySQL
 * Executes schema.sql, eventgpt_additive_schema.sql, and mock-data.sql against MySQL
 * for local development and migration testing.
 */
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function connectWithFallback() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USERNAME || 'root';
  const passwordsToTry = [
    process.env.MYSQL_PASSWORD,
    process.env.DB_PASSWORD,
    'root123',
    'root',
    '',
  ].filter((p) => p !== undefined);

  for (const password of passwordsToTry) {
    try {
      const conn = await mysql.createConnection({ host, port, user, password });
      return conn;
    } catch (err) {
      if (err.code !== 'ER_ACCESS_DENIED_ERROR') {
        throw err;
      }
    }
  }
  throw new Error(`Unable to authenticate with MySQL at ${host}:${port} as ${user}.`);
}

async function executeSqlFile(conn, filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  // MySQL 8 compatibility normalization
  content = content.replace(/ALTER\s+TABLE\s+([`\w]+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi, 'ALTER TABLE $1 ADD COLUMN');
  content = content.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi, 'ADD COLUMN');
  content = content.replace(/ADD\s+INDEX\s+IF\s+NOT\s+EXISTS/gi, 'ADD INDEX');
  content = content.replace(/ALTER\s+TABLE\s+([`\w]+)\s+ADD\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS/gi, 'ALTER TABLE $1 ADD UNIQUE INDEX');

  // Split into statements
  const lines = content.split('\n');
  const stmts = [];
  let currentStmt = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed.startsWith('/*')) continue;
    currentStmt += ' ' + line;
    if (trimmed.endsWith(';')) {
      stmts.push(currentStmt.trim());
      currentStmt = '';
    }
  }
  if (currentStmt.trim()) stmts.push(currentStmt.trim());

  for (const stmt of stmts) {
    if (!stmt) continue;
    try {
      await conn.query(stmt);
    } catch (err) {
      const ignorable = [
        'ER_DUP_FIELDNAME',
        'ER_DUP_KEYNAME',
        'ER_TABLE_EXISTS_ERROR',
        'ER_CANT_DROP_FIELD_OR_KEY',
        'ER_DUP_ENTRY',
      ];
      if (!ignorable.includes(err.code)) {
        // Log non-ignorable errors
        console.warn(`[Warn] ${err.code}: ${err.message.substring(0, 80)}`);
      }
    }
  }
}

async function main() {
  console.log('Connecting to MySQL...');
  const conn = await connectWithFallback();
  console.log('Connected to MySQL successfully.');
  await conn.query('CREATE DATABASE IF NOT EXISTS event_booking_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.query('USE event_booking_db');

  const baseDir = path.resolve(__dirname, '../../backend/sql');
  console.log('1. Executing schema.sql...');
  await executeSqlFile(conn, path.join(baseDir, 'schema.sql'));

  console.log('2. Executing eventgpt_additive_schema.sql...');
  await executeSqlFile(conn, path.join(baseDir, 'eventgpt_additive_schema.sql'));

  console.log('3. Executing id_code_migration.sql...');
  await executeSqlFile(conn, path.join(baseDir, 'id_code_migration.sql'));

  // Ensure missing columns/tables in mock-data exist
  try {
    await conn.query('ALTER TABLE events ADD COLUMN food_provided BOOLEAN NOT NULL DEFAULT FALSE');
  } catch (e) {}
  try {
    await conn.query('ALTER TABLE events ADD COLUMN accommodation_provided BOOLEAN NOT NULL DEFAULT FALSE');
  } catch (e) {}
  try {
    await conn.query('ALTER TABLE events ADD COLUMN version INT NOT NULL DEFAULT 0');
  } catch (e) {}
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS direct_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      sender_id BIGINT NOT NULL,
      receiver_id BIGINT NOT NULL,
      content TEXT NOT NULL,
      voice_url VARCHAR(300),
      voice_duration INT DEFAULT 0,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_for_sender BOOLEAN NOT NULL DEFAULT FALSE,
      unsend_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
      sent_at DATETIME,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  } catch (e) {}

  console.log('4. Executing mock-data.sql...');
  await executeSqlFile(conn, path.join(baseDir, 'mock-data.sql'));

  const [tables] = await conn.query('SHOW TABLES');
  console.log(`\nSuccessfully populated MySQL database with ${tables.length} tables:`);
  for (const row of tables) {
    const table = Object.values(row)[0];
    const [cnt] = await conn.query(`SELECT COUNT(*) as c FROM \`${table}\``);
    console.log(` - ${table}: ${cnt[0].c} records`);
  }

  await conn.end();
  console.log('\nMySQL seeding completed successfully.');
}

main().catch((err) => {
  console.error('Fatal error seeding MySQL:', err);
  process.exit(1);
});
