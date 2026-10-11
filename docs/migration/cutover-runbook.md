# CollegeEvents — Production Database Cutover Runbook

> **Target Systems:** MySQL 8 (`event_booking_db`) ➔ MongoDB 7 (`event_booking_db`)  
> **Backend Architecture:** Node.js 20+ / Express (`backend-node`)  
> **Policy:** Zero automated traffic switching. Explicit human sign-off required prior to production cutover.  
> **Reversibility:** Full instant rollback supported throughout migration window.

---

## 1. Overview & Migration Architecture

This runbook specifies the step-by-step operational procedure for migrating production data from the legacy MySQL 8 database to MongoDB 7, validating data integrity, and conducting a controlled application traffic cutover.

### Migration Utility Toolchain
The migration toolchain consists of three production utilities located under `backend-node/scripts/`:

| Utility | Command | Purpose |
| :--- | :--- | :--- |
| **Pre-Migration Checks** | `npm run migrate:check` | Validates connectivity, table schemas, orphan foreign keys, unique constraint compliance, and password hash security. |
| **Dry-Run Simulation** | `npm run migrate:dry-run` | Executes complete extraction, transformation, and Mongoose schema validation without writing to MongoDB. |
| **Migration Execution** | `npm run migrate` | Dependency-aware batch extraction, relational foreign-key resolution, persistent ID mapping, and controlled upserts. |
| **Post-Migration Validation** | `npm run migrate:validate` | 5-Pillar reconciliation: record counts, referential integrity, financial volume, external IDs, and password format. |
| **Full Run + Reconciliation**| `npm run migrate:reconcile`| Executes live migration immediately followed by deep automated reconciliation. |

---

## 2. Phase 1: Pre-Migration & Backup Procedure

Prior to initiating any write operations, comprehensive snapshot backups of both source and target databases must be completed and cryptographically verified.

### 2.1 MySQL Source Database Backup
Execute a consistent transaction snapshot dump with foreign key checks preserved:

```bash
# 1. Create timestamped backup directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p ./backups/mysql_${TIMESTAMP}

# 2. Execute consistent snapshot dump
mysqldump \
  --host="${DB_HOST:-127.0.0.1}" \
  --port="${DB_PORT:-3306}" \
  --user="${DB_USERNAME:-root}" \
  -p \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --databases event_booking_db > ./backups/mysql_${TIMESTAMP}/event_booking_db_full.sql

# 3. Compute SHA256 checksum
sha256sum ./backups/mysql_${TIMESTAMP}/event_booking_db_full.sql > ./backups/mysql_${TIMESTAMP}/checksum.sha256
echo "MySQL Backup completed with checksum verification."
```

### 2.2 MongoDB Target Database Backup
Capture an archive snapshot of the existing MongoDB state:

```bash
mkdir -p ./backups/mongo_${TIMESTAMP}

mongodump \
  --uri="${MONGODB_URI:-mongodb://localhost:27017/event_booking_db}" \
  --archive="./backups/mongo_${TIMESTAMP}/event_booking_db_pre_migration.archive" \
  --gzip

sha256sum ./backups/mongo_${TIMESTAMP}/event_booking_db_pre_migration.archive > ./backups/mongo_${TIMESTAMP}/checksum.sha256
echo "MongoDB Archive completed."
```

---

## 3. Phase 2: Final-Write-Freeze Window

To prevent split-brain states and race conditions during migration, the application is placed into a strict read-only maintenance window.

1. **Display Maintenance Notice:**
   - Configure reverse proxy (Nginx / Cloudflare / AWS ALB) to return HTTP 503 Maintenance page for user mutation endpoints (`POST /api/bookings/*`, `POST /api/payments/*`, `POST /api/events/*`).
   - Allow read traffic (`GET /api/events/*`, `GET /api/events/search`) if desired, or freeze all inbound API mutations.
2. **Halt Legacy Background Schedulers:**
   - Stop Spring Boot scheduled workers (`BookingTimeoutJob`, `AutoApprovalJob`, `CertificateIssuanceJob`) to eliminate background table modifications.
3. **Verify MySQL Activity Freeze:**
   ```sql
   -- Confirm zero active write transactions
   SHOW PROCESSLIST;
   ```
4. **Record Source Baseline Counts:**
   ```bash
   cd backend-node
   npm run migrate:check
   ```

---

## 4. Phase 3: Migration Execution

### Step 1: Execute Dry-Run Validation
Run the migration in dry-run mode to verify schemas, foreign key mappings, and data transformations without writing any records:

```bash
cd backend-node
npm run migrate:dry-run
```
*Expected Result:* `Source Records Read: N | Created: N | Errors Encountered: 0`.

### Step 2: Execute Live Migration
Execute live migration with persistent ID mapping and controlled upserts:

```bash
cd backend-node
npm run migrate:reconcile
```

#### What this accomplishes:
- **Dependency-Aware Ordering:** Migrates `users` and `organizers` first (embedding `profile_locations`), followed by `events` (embedding `certificate_settings`), `bookings` (embedding `participants`), `payments`, `refunds`, `certificates`, `attendance`, `event_ratings`, `networking_connections`, and `direct_messages`.
- **Persistent ID Mapping:** Stores `(sourceTable, sourceId) ➔ (targetObjectId, targetId)` in `migration_id_mappings` collection, ensuring that reruns resolve exact identical references.
- **Auto-Increment Sequence Update:** Updates the `counters` collection for `users`, `organizers`, `events`, `bookings`, `payments`, etc., to the maximum migrated `id`, ensuring subsequent application operations continue sequence numbering monotonically.
- **Rerun Idempotency:** Uses stable business keys (`userCode`, `email`, `ticketId`, `transactionId`, `certificateId`, or `id`) with `$set` upserts, preventing duplication or primary key collisions.
- **Security:** Preserves existing bcrypt password hashes (`$2a$` / `$2b$`) verbatim without logging. Redacts all sensitive credentials in logs and reports.

---

## 5. Phase 4: Post-Migration Validation & Reconciliation

Validate the 5 core reconciliation pillars:

```bash
cd backend-node
npm run migrate:validate
```

### The 5 Pillars of Reconciliation:
1. **Pillar 1: Record Count Equality:**
   - Verifies 100% document count match across all 13 core collections against MySQL row counts.
2. **Pillar 2: Referential Integrity & Relationships:**
   - Verifies zero orphan bookings, events, payments, or certificates. 100% of ObjectIds resolve to valid documents.
3. **Pillar 3: Financial & Booking Volume:**
   - Verifies total booking gross revenue (`totalAmount`) matches MySQL `total_amount` sum to 2 decimal places.
   - Verifies total successful payment amount matches MySQL `amount` sum.
   - Verifies total booked ticket quantities match.
4. **Pillar 4: External Visible Identifiers:**
   - Verifies all customer-facing `ticketId` (`TKT-...`), `transactionId` (`TXN-...`), and certificate identifiers are preserved identically.
5. **Pillar 5: Security & Password Format:**
   - Verifies 100% of user and organizer password hashes retain valid BCrypt prefixes.

Inspect the generated reconciliation reports:
- Markdown report: `backend-node/reports/post-migration-validation-report.md`
- JSON report: `backend-node/reports/post-migration-validation-report.json`

---

## 6. Phase 5: Mandatory Human Sign-Off Gate

> ⚠️ **CRITICAL POLICY:** Traffic cutover MUST NOT proceed automatically. The following checklist requires explicit verification and human sign-off:

| Verification Item | Verified By | Status |
| :--- | :--- | :--- |
| MySQL consistent backup completed & SHA256 verified | Database Administrator | [ ] Confirmed |
| Final write-freeze confirmed (zero active writes during migration) | Lead DevOps Engineer | [ ] Confirmed |
| Dry-run completed with 0 schema or transformation errors | Lead Backend Architect | [ ] Confirmed |
| Live migration completed with 0 errors | Lead Backend Architect | [ ] Confirmed |
| Post-migration reconciliation report shows 100% PASS | QA / Data Engineer | [ ] Confirmed |
| Financial totals (Revenue & Successful Payments) reconciled | Finance / Business Analyst | [ ] Confirmed |
| Spot-check user login using migrated student & organizer credentials | QA Lead | [ ] Confirmed |
| Ticket QR verification & download spot-check confirmed | Operations Lead | [ ] Confirmed |

**Lead Architect Sign-Off:**  
Name: _______________________________ Signature: _______________________________ Date: _______________

---

## 7. Phase 6: Traffic Cutover Procedure

Upon obtaining authorized sign-off, transition production traffic from the legacy Java backend to the new Node.js Express backend:

1. **Start Target Node.js Service:**
   ```bash
   cd backend-node
   NODE_ENV=production npm start
   ```
2. **Validate Readiness & Health:**
   ```bash
   curl -I http://localhost:8080/api/health
   # Expected: HTTP 200 OK {"status":"UP","services":{"database":{"status":"UP"}}}
   ```
3. **Switch Reverse Proxy Upstream:**
   Update Nginx / Reverse Proxy configuration to point `/api` to Node.js backend:
   ```nginx
   upstream backend_service {
       server 127.0.0.1:8080; # Node.js Express Target
       # server 127.0.0.1:8081; # Java Spring Boot Legacy (Disabled)
   }
   ```
4. **Reload Proxy:**
   ```bash
   sudo nginx -s reload
   ```
5. **Remove Maintenance Notice:**
   - Deactivate HTTP 503 maintenance mode. Inbound user traffic now hits the Node.js backend.

---

## 8. Phase 7: Emergency Rollback Procedure

In the event of an unexpected regression or critical discrepancy discovered post-cutover:

1. **Re-engage Maintenance Notice:**
   - Return reverse proxy to HTTP 503 maintenance mode.
2. **Revert Proxy Upstream to Java Backend:**
   ```nginx
   upstream backend_service {
       server 127.0.0.1:8081; # Java Spring Boot Legacy
   }
   ```
3. **Reload Proxy:**
   ```bash
   sudo nginx -s reload
   ```
4. **Assess Delta Changes in MongoDB:**
   - If user mutations occurred during the window, extract delta bookings/payments from MongoDB before rollback:
     ```bash
     mongodump --uri="${MONGODB_URI}" --query='{"createdAt":{"$gt":{"$date":"<CutoverTimestamp>"}}}' ...
     ```
5. **Resume Java Background Jobs:**
   - Restart Spring Boot background schedulers.
6. **Deactivate Maintenance Notice:**
   - Restore application traffic on legacy MySQL stack.
