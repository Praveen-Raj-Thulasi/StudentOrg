# Deploying EventBookingSystem to Zoho Catalyst AppSail

## Overview

This backend is a long-running Spring Boot application (REST APIs + WebSocket + scheduled jobs).
It is deployed to **Zoho Catalyst AppSail** — the correct Catalyst component for persistent servers.

> **Do NOT use Catalyst Functions (Basic I/O or Advanced I/O) for this project.**
> Those are for short-lived serverless functions. AppSail is required.

---

## 1. Prerequisites

Install these on your local Windows machine before deploying:

```powershell
# 1. Node.js (required for Catalyst CLI)
# Download from https://nodejs.org (LTS version)

# 2. Zoho Catalyst CLI
npm install -g @zohotools/catalyst-cli

# 3. Java 21
# Download from https://adoptium.net

# 4. Maven 3.9+
# Download from https://maven.apache.org/download.cgi
# Add to PATH

# Verify installations
node --version
catalyst --version
java --version
mvn --version
```

---

## 2. Catalyst Project Setup

### 2a. Login to Catalyst
```powershell
catalyst login
# Opens browser — log in with your Zoho account
```

### 2b. Initialize Catalyst project (first time only)
```powershell
cd C:\Users\naveetha\OneDrive\Desktop\EventBookingSystem
catalyst init
# Select your Zoho project (or create a new one)
# This creates a .catalyst folder — do NOT commit secrets inside it
```

### 2c. Add AppSail service for backend
```powershell
catalyst add appsail
# When prompted:
#   - Service name:    event-booking-backend
#   - Runtime type:    Catalyst-Managed Runtime  (OR Docker Image)
#   - Stack:           Java
#   - App directory:   backend
#   - Startup command: java -jar target/event-booking-system-1.0.0.jar
```

---

## 3. Required Environment Variables

Set ALL of these in the Catalyst Console:
**Catalyst Console → Your Project → AppSail → event-booking-backend → Configurations → Environment Variables**

| Variable | Description | Example |
|---|---|---|
| `DB_HOST` | MySQL host (Catalyst Data Store or external RDS) | `your-db.example.com` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_NAME` | Database name | `event_booking_db` |
| `DB_USERNAME` | DB username | `eventuser` |
| `DB_PASSWORD` | DB password | `yourpassword` |
| `JWT_SECRET` | At least 32 random characters | `some-long-random-string-here` |
| `MAIL_USERNAME` | Gmail address | `naveetha2703@gmail.com` |
| `MAIL_PASSWORD` | Google App Password (16 chars, no spaces) | `xxxxxxxxxxxxxxxx` |
| `RAZORPAY_KEY_ID` | Razorpay key ID | `rzp_live_xxxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret | `xxxxxxxxxxxxxxxx` |
| `RAZORPAY_CURRENCY` | Currency code | `INR` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `GEMINI_MODEL` | Model name | `gemini-2.5-flash` |
| `APP_BASE_URL` | Backend public URL (fill after first deploy) | `https://yourapp-xxx.zohocatalyst.com` |
| `FRONTEND_URL` | Frontend public URL | `https://your-frontend.zohocatalyst.com` |
| `MONGODB_ENABLED` | Set `false` unless you have MongoDB | `false` |
| `AI_PROVIDER` | AI provider | `gemini` |
| `VECTOR_DB_PROVIDER` | Vector DB provider | `mysql` |

> **NEVER put real credentials in source code, Dockerfile, or .env.example**

> **X_ZOHO_CATALYST_LISTEN_PORT** is injected automatically by Catalyst — do NOT set it manually.

---

## 4. Database Setup

Catalyst AppSail does **not** include a built-in MySQL server.
You need an external MySQL database. Options:

### Option A — External MySQL (recommended for production)
Use **PlanetScale**, **AWS RDS**, **Railway MySQL**, or **Aiven MySQL**.
1. Create a database named `event_booking_db`
2. Run the schema:
   ```powershell
   # From your local machine with MySQL client installed:
   mysql -h YOUR_DB_HOST -u YOUR_USER -p event_booking_db < backend\sql\schema.sql
   ```
3. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` in Catalyst env vars

### Option B — Zoho Catalyst Data Store
Catalyst Data Store is a NoSQL store — it cannot replace MySQL for this project.
Use Option A.

### IMPORTANT — DDL mode
`spring.jpa.hibernate.ddl-auto=update` is already set.
On first startup against a fresh database, Hibernate will create all tables automatically.
Do NOT change this to `create` (it drops existing data).

---

## 5. Gmail App Password Setup

1. Go to https://myaccount.google.com/apppasswords
2. Make sure 2-Step Verification is ON for your Gmail account
3. Click **Create a new app password** → name it `EventBooking`
4. Copy the 16-character password — **remove all spaces**
5. Set `MAIL_PASSWORD=xxxxxxxxxxxxxxxx` in Catalyst environment variables

---

## 6. Razorpay Configuration

1. Log in to https://dashboard.razorpay.com
2. Go to **Settings → API Keys**
3. For production: use Live keys (`rzp_live_...`)
4. For testing: use Test keys (`rzp_test_...`)
5. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Catalyst env vars

---

## 7. Build Command

Run this locally to verify the build before deploying:

```powershell
cd C:\Users\naveetha\OneDrive\Desktop\EventBookingSystem\backend
mvn clean package -DskipTests
# Output JAR: target\event-booking-system-1.0.0.jar
```

---

## 8. Deployment Commands

### Deploy everything (first time)
```powershell
cd C:\Users\naveetha\OneDrive\Desktop\EventBookingSystem
catalyst deploy
```

### Deploy only the backend AppSail service
```powershell
catalyst deploy --appsail event-booking-backend
```

### Check deployment status
```powershell
catalyst status
```

---

## 9. Get the Backend URL

After deployment, Catalyst displays your AppSail URL:
```
AppSail deployed: https://event-booking-backend-xxxxx.zohocatalyst.com
```

Update `APP_BASE_URL` in Catalyst env vars to this URL.

---

## 10. Test API Endpoints

Replace `YOUR_BACKEND_URL` with your actual Catalyst AppSail URL:

```powershell
# Health check
Invoke-WebRequest -Uri "https://YOUR_BACKEND_URL/api/actuator/health" -Method GET

# Test OTP send
Invoke-WebRequest -Uri "https://YOUR_BACKEND_URL/api/auth/otp/send" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","role":"USER"}'

# Test events listing
Invoke-WebRequest -Uri "https://YOUR_BACKEND_URL/api/events" -Method GET
```

---

## 11. Health Check

The actuator health endpoint is publicly accessible:
```
GET https://YOUR_BACKEND_URL/api/actuator/health
```
Expected response:
```json
{"status": "UP"}
```

If status is `DOWN`, check:
- Database connectivity (DB_HOST, DB_PASSWORD correct?)
- Environment variables set correctly in Catalyst console

---

## 12. Frontend Configuration

The frontend uses a relative API base URL (`/api`) via Vite dev proxy locally.

For production, you need to configure the frontend to point to the Catalyst backend URL.

**Option A — Environment variable (recommended)**

Create `frontend/.env.production`:
```
VITE_API_BASE_URL=https://YOUR_BACKEND_URL/api
```

Then update `frontend/src/services/api.js`:
```js
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  ...
});
```

**Option B — Deploy frontend and backend on the same domain**

If your frontend is also deployed on Catalyst (Static Site or AppSail),
configure a reverse proxy so `/api` routes to the backend — no code change needed.

> Local development is unaffected — the Vite proxy still handles `/api` → `localhost:8080`.

---

## 13. Known Catalyst AppSail Limitations

### ⚠️ File Uploads — IMPORTANT
Catalyst AppSail **restricts write permissions** in the working directory.
The current `StorageService` writes files to `./uploads/` which **will NOT work** in production.

**Impact:** Event banner uploads, certificate templates, profile pictures, QR codes will fail.

**Fix options (not implemented — requires manual decision):**
- Use **Catalyst File Store** (Catalyst's built-in object storage)
- Use **Amazon S3** or **Google Cloud Storage**
- Use **Cloudinary** for image uploads

Until this is addressed, file upload endpoints will return errors in production.
All other functionality (auth, booking, payment, events, OTP, etc.) works normally.

### ⚠️ WebSocket / STOMP
Catalyst AppSail supports long-running connections but WebSocket behavior depends on the
load balancer configuration. If sticky sessions are not enabled, STOMP connections may drop.
Test WebSocket connectivity after deployment.

### ⚠️ Scheduled Tasks
If Catalyst scales AppSail to multiple instances, scheduled tasks (`@Scheduled`) will run
on all instances simultaneously. For this project this means:
- `BookingScheduler` — could release the same reservation twice (idempotent, acceptable)
- `EventScheduler` — lifecycle transitions could run twice per event (idempotent due to
  status checks, acceptable)

No code change required for single-instance deployment.

### ⚠️ MongoDB
MongoDB is disabled by default (`MONGODB_ENABLED=false`). Catalyst has no built-in MongoDB.
If you need MongoDB features, provision an external MongoDB Atlas instance and set
`MONGODB_ENABLED=true` and `MONGODB_URI` in Catalyst env vars.

---

## 14. Common Deployment Errors

| Error | Cause | Fix |
|---|---|---|
| `Connection refused` on DB | DB_HOST wrong or DB not reachable | Check DB_HOST, firewall, DB is running |
| `535 Authentication Failed` | Wrong MAIL_PASSWORD | Regenerate Google App Password |
| `JWT signature invalid` | JWT_SECRET different between restarts | Set a fixed JWT_SECRET env var |
| `Port already in use` | Startup command port mismatch | Use `${X_ZOHO_CATALYST_LISTEN_PORT:8080}` — already set |
| Upload returning 500 | Filesystem write not allowed | See File Uploads limitation above |
| Health check DOWN | App failed to start | Check Catalyst AppSail logs |

---

## 15. Rollback Procedure

```powershell
# List previous deployments
catalyst deployments list --appsail event-booking-backend

# Roll back to a previous version (Catalyst console)
# Catalyst Console → AppSail → event-booking-backend → Deployments → select version → Redeploy
```

For immediate rollback, the previous Git commit can be redeployed:
```powershell
git log --oneline -5
# note the commit hash you want to revert to

# Redeploy from that commit (DO NOT force push to main without team review)
git checkout <previous-commit-hash> -- backend/
mvn clean package -DskipTests
catalyst deploy --appsail event-booking-backend
```

---

## 16. Deploying the Node.js / Express Backend (`backend-node`)

The system now provides a modern, high-performance Node.js / Express backend in `backend-node/`.

### AppSail Configuration for Node.js
In `catalyst.json`:
```json
{
  "appsail": [
    {
      "source": "backend-node",
      "name": "event-booking-node-backend",
      "stack": "node20",
      "command": "npm start"
    }
  ],
  "client": {
    "source": "frontend"
  }
}
```

### Required Environment Variables for `backend-node`
Set these in Catalyst Console / AppSail Configuration:
- `PORT` or `X_ZOHO_CATALYST_LISTEN_PORT`: Catalyst injects this automatically.
- `MONGODB_URI`: External MongoDB Atlas connection URI (e.g. `mongodb+srv://...`).
- `JWT_SECRET`: Secret key (min 32 chars).
- `GEMINI_API_KEY`: API key for EventGPT / AI copilot.
- `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`: Razorpay credentials.
- `MAIL_USERNAME` & `MAIL_PASSWORD`: SMTP email credentials.
- `FRONTEND_URL`: Public URL of the frontend for CORS.

---

## 17. Local Development Workflow

Run the Node.js backend and React frontend locally:

```powershell
# 1. Start MongoDB (ensure service is active on localhost:27017)

# 2. Start Express Backend (Port 8080)
cd backend-node
npm install
npm run dev

# 3. Start React Frontend (Port 3000, proxies /api, /uploads, /socket.io, and /api/ws-native)
cd ../frontend
npm install
npm run dev
```

The React frontend automatically connects to the Node.js backend via Vite proxy on `http://localhost:8080`.
Original Java source code in `backend/` remains intact for historical reference.

