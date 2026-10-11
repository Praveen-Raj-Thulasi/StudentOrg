# 🎓 CollegeEvents – AI-Powered Event Booking System

A full-stack, production-ready platform for discovering, booking, and managing college events with AI-powered features including smart recommendations, travel assistance, community chat, certificates, and real-time analytics.

---

## ✨ Features

### For Students (Users)
- 🔍 **Event Discovery** — Browse, search, and filter events with NLP-powered AI search
- 🎫 **Ticket Booking** — Book tickets with participant details, QR codes, and payment via Razorpay
- 💳 **Payment & Refunds** — Online payment with Razorpay; automatic refund on cancellation
- 📄 **Certificates** — Download verified certificates after event attendance
- 🤝 **Networking** — Connect with peers based on shared events, department, and skills
- 💬 **Community Chat** — Real-time WebSocket chat for registered event participants
- 🗺️ **Travel Assistant** — AI-guided travel info: bus, train, metro, parking, food, accommodation
- 📊 **Portfolio** — Track attended events, certificates, and career achievements
- 🔔 **Notifications** — Real-time SSE push notifications + email alerts

### For Organizers
- 📅 **Event Management** — Create, edit, publish, and cancel events
- 📈 **Analytics Dashboard** — Registrations, revenue, attendance rate, AI predictions
- 🏅 **Certificate Management** — Generate, release, and email certificates to attendees
- 📋 **Attendance Scanning** — QR-based check-in with auto-mark attendance
- 🔗 **External Scanner** — Connect mobile devices as wireless ticket scanners via WebSocket relay
- 🤖 **AI Copilot** — Natural language assistant for event analytics and management

### For Admins
- ✅ **Event Approvals** — Review and approve/reject organizer-submitted events
- 👥 **User Management** — Manage users, organizers, and platform data
- 🛡️ **AI Insights** — Platform-wide fraud detection and behavioral analytics

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend (Active)** | Node.js (LTS), Express 4, Mongoose 8 |
| **Backend (Reference)** | Spring Boot 3.2, Java 21 (original reference implementation preserved in `backend/`) |
| **Primary Database** | MongoDB (Replica Set / Single-node with ACID transaction support) |
| **Historical Source DB** | MySQL 8 (historical source data migrated via `backend-node/scripts/migrate-mysql-to-mongo.js`) |
| **Security** | JWT, BCrypt, Helmet, CORS |
| **Real-time** | Dual-Stack: Native WebSocket (STOMP 1.2 protocol) + Socket.IO (`socket.io`), Server-Sent Events (SSE) |
| **AI Subsystem** | Google Gemini 2.5 Flash via `@google/genai` (EventGPT, Copilot, RAG, Tool Calling) |
| **Payments** | Razorpay SDK & Webhook Signature Verification |
| **Email** | Nodemailer + SMTP (Gmail) |
| **QR Codes & PDFs** | QRCode & PDF-Lib |
| **Frontend** | React 18, Vite 5, Tailwind CSS 3 |
| **State** | React Query (TanStack Query v3) |
| **Forms** | React Hook Form + Yup |
| **Animations** | Framer Motion |
| **Charts** | Recharts |
| **Test Suites** | Vitest, Supertest (163/163 passing backend & e2e integration tests) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                      │
│     Vite (Port 3000) · Tailwind · React Query · Framer  │
└───────────────────────────┬─────────────────────────────┘
                            │ /api, /socket.io, /uploads proxied
┌───────────────────────────▼─────────────────────────────┐
│          Node.js / Express Backend (Port 8080)          │
│                                                         │
│  Controllers → Services → Mongoose Models (35 schemas)  │
│                                                         │
│  Modules:                                               │
│  • auth/          JWT authentication + OTP + Refresh    │
│  • events/        Event lifecycle & discovery           │
│  • bookings/      Ticket booking & QR code generation   │
│  • payments/      Razorpay integration, webhooks & refund│
│  • ai/            Gemini AI provider & EventGPT Copilot │
│  • networking/    Peer connection recommendation engine │
│  • community/     Real-time STOMP & Socket.IO chat      │
│  • attendance/    QR check-in & wireless scanner relay  │
│  • certificates/  PDF generation & verification         │
│  • notifications/ SSE push stream & in-app alerts       │
│  • gamification/  XP, badges, levels & student portfolio│
│  • analytics/     Organizer metrics & public leaderboard│
│  • help/          FAQ & tutorial video knowledge base   │
└───────────────────────────┬─────────────────────────────┘
                            │ Mongoose ODM
                            ▼
                    MongoDB Database
         (Users, Events, Bookings, Tickets, Payments,
          Certificates, Chat, Notifications, Analytics)
```

---

### Running the System

#### 1. Start MongoDB
Ensure MongoDB is running locally on port 27017 or provide `MONGODB_URI` in `.env`:
```bash
# Example with Docker
docker run -d --name mongodb -p 27017:27017 mongo:7
```

#### 2. Run Data Migration (if migrating existing MySQL database)
```bash
cd backend-node
npm run migrate:check    # Verify connectivity and schema readiness
npm run migrate          # Execute full batch migration with 1:1 relational mapping
npm run migrate:validate # Run 5-pillar validation audit
```

#### 3. Run Backend (Node.js/Express on Port 8080)
```bash
cd backend-node
npm install
npm start        # or npm run dev (hot reload)
npm test         # Run complete 163-test automated test suite
```

The API starts at **http://localhost:8080/api**  
Health check: http://localhost:8080/health  
Readiness check: http://localhost:8080/ready  

#### 4. Run Frontend (React/Vite on Port 3000)
```bash
cd frontend
npm install
npm run dev
```

The app opens at **http://localhost:3000**.  
All requests to `/api`, `/uploads`, and WebSocket connections (`/api/ws-native`, `/socket.io`) are proxied automatically to the Express backend on port 8080 without CORS issues or breaking changes.
├── mapper/          # Entity ↔ DTO converters
├── notification/    # SSE emitters + notification service
├── payment/         # Razorpay + refund service
├── repository/      # Spring Data JPA + MongoDB repositories
│   └── mongo/
├── scheduler/       # Event lifecycle + booking expiry schedulers
├── security/        # JWT filter, token provider, OTP store
├── service/         # Business logic services
├── util/            # QR generator, ticket ID generator
└── validation/      # Custom Bean Validation annotations
```

---

## 📁 Project Structure

```
EventBookingSystem/
├── backend/              # Spring Boot application
│   ├── src/              # Java source code
│   ├── sql/              # Database schema and migration scripts
│   ├── pom.xml           # Maven build file
│   └── README.md         # Backend-specific notes
├── frontend/             # React + Vite application
│   ├── src/              # React source code
│   ├── public/           # Static assets
│   ├── package.json      # Node dependencies
│   └── vite.config.js    # Vite configuration
├── docs/                 # Additional documentation
│   ├── EVENTGPT_API.md   # AI / Copilot API reference
│   ├── EVENTGPT_ROADMAP.md # AI feature roadmap
│   └── REFACTOR_REPORT.md  # Refactoring history
├── docker-compose.yml    # MySQL + MongoDB + pgvector services
├── .env.example          # Environment variable template
├── .gitignore
└── README.md
```

---

## 🚀 Installation Guide

### Prerequisites

| Tool | Version |
|---|---|
| Java (JDK) | 21+ |
| Maven | 3.9+ |
| Node.js | 18+ |
| MySQL | 8.0+ |
| Git | any |

MongoDB is **optional** — the app runs without it (notifications use SSE only).

---

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/EventBookingSystem.git
cd EventBookingSystem
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DB_PASSWORD` — your MySQL root password
- `JWT_SECRET` — any random string of 32+ characters
- `MAIL_USERNAME` / `MAIL_PASSWORD` — Gmail account + App Password
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — from Razorpay dashboard
- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 3. Create MySQL database

```sql
CREATE DATABASE event_booking_db;
```

The schema is created automatically by Spring Boot (`ddl-auto: update`).

---

### Running the Backend

```bash
cd backend
mvn spring-boot:run
```

The API starts at **http://localhost:8080/api**

Health check: http://localhost:8080/api/actuator/health

### Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app opens at **http://localhost:3000**

---

### Running with Docker

```bash
# Start MySQL, MongoDB, and pgvector
docker-compose up -d

# Then run backend and frontend as above
```

---

## 🔐 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DB_USERNAME` | Yes | MySQL username |
| `DB_PASSWORD` | Yes | MySQL password |
| `JWT_SECRET` | Yes | JWT signing secret (32+ chars) |
| `MAIL_USERNAME` | Yes | Gmail address for sending emails |
| `MAIL_PASSWORD` | Yes | Gmail App Password (16 chars) |
| `RAZORPAY_KEY_ID` | Yes | Razorpay test/live key ID |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay key secret |
| `GEMINI_API_KEY` | Yes | Google Gemini AI API key |
| `GEMINI_MODEL` | No | Model name (default: `gemini-2.5-flash`) |
| `MONGODB_ENABLED` | No | Enable MongoDB persistence (default: `false`) |
| `MONGODB_URI` | No | MongoDB connection string |
| `APP_BASE_URL` | No | Backend base URL (default: `http://localhost:8080`) |
| `FRONTEND_URL` | No | Frontend URL for email links (default: `http://localhost:3000`) |

---

## 🚢 Deployment Guide

### Production Checklist

- [ ] Set a strong `JWT_SECRET` (use `openssl rand -hex 32`)
- [ ] Use a production MySQL database with restricted user permissions
- [ ] Configure Gmail App Password (never use your account password)
- [ ] Set `RAZORPAY_KEY_ID` to a live key (`rzp_live_*`) for production payments
- [ ] Set `APP_BASE_URL` and `FRONTEND_URL` to your actual domain
- [ ] Enable HTTPS (use nginx reverse proxy or cloud load balancer)
- [ ] Set `spring.jpa.hibernate.ddl-auto=validate` in production

### Frontend Build

```bash
cd frontend
npm run build
# Output is in frontend/dist/ — serve with nginx or a CDN
```

### Backend JAR

```bash
cd backend
mvn clean package -DskipTests
java -jar target/event-booking-system-*.jar
```

---

## 👥 Roles

| Role | Capabilities |
|---|---|
| **USER** | Browse events, book tickets, payments, refunds, profile, networking, AI chat |
| **ORGANIZER** | Create/manage events, attendance scanner, analytics, certificates, AI copilot |
| **ADMIN** | Approve events, manage platform, AI insights, fraud detection |

---

## 🔑 Key API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/user/register` | Register user | Public |
| POST | `/auth/user/login` | User login | Public |
| POST | `/auth/organizer/login` | Organizer login | Public |
| GET | `/events` | Search/filter events | Public |
| GET | `/events/{id}` | Event details | Public |
| POST | `/bookings` | Book tickets | USER |
| POST | `/payments/bookings/{id}/razorpay/order` | Create payment order | USER |
| POST | `/payments/bookings/{id}/razorpay/verify` | Verify payment | USER |
| GET | `/notifications` | User notifications | USER/ORGANIZER |
| GET | `/notifications/stream` | SSE real-time stream | USER/ORGANIZER |
| POST | `/ai/chat` | AI chatbot | Any |
| GET | `/ai/events/{id}/travel` | Travel assistant | Authenticated |
| POST | `/ai/eventgpt/events/{id}/qa` | Event Q&A | Authenticated |
| GET | `/organizer/analytics` | Organizer dashboard | ORGANIZER |
| GET | `/admin/dashboard` | Admin stats | ADMIN |
| POST | `/certificates/events/{id}/generate` | Generate certificates | ORGANIZER |

Full AI/Copilot API reference: [docs/EVENTGPT_API.md](docs/EVENTGPT_API.md)

---

## 🔮 Future Enhancements

- [ ] Mobile app (React Native)
- [ ] Email reminders and event-day push notifications
- [ ] Multi-language support (i18n)
- [ ] Payment gateway alternatives (UPI, Paytm)
- [ ] Event livestreaming integration
- [ ] Advanced analytics with cohort analysis
- [ ] AI-powered duplicate event detection
- [ ] Sponsor and exhibitor management

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is for educational purposes.

---

## 👤 Author

Built by **Naveetha** — AI-Powered Event Booking System for college communities.
