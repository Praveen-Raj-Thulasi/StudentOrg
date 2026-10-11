import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { httpLogger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';
import { HealthController } from './controllers/health.controller.js';

export const app = express();

// 1. Security Headers via Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS Configuration
const allowedOrigins = [
  ...env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['Authorization', 'X-Token-Expiry', 'X-Request-Id'],
  })
);

// 3. Request Tracing & Structured Logging
app.use(requestIdMiddleware);
app.use(httpLogger);

// 4. Request Body Parsers (with rawBody capture for webhook signature verification)
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Root Liveness & Readiness Probes (for Docker/K8s container health checks)
app.get('/health', HealthController.getLiveness);
app.get('/ready', HealthController.getReadiness);

// 5.1 Static file serving for uploads
import('./utils/upload.js').then(({ UPLOAD_DIR }) => {
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use('/api/uploads', express.static(UPLOAD_DIR));
});

// 6. Master API Router mounted under /api
app.use('/api', apiRouter);

// 7. 404 Catch-All Handler
app.use(notFoundHandler);

// 8. Centralized Exception Handling Middleware
app.use(errorHandler);

export default app;
