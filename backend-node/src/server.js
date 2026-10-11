import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './utils/logger.js';
import { initSocketIO, initStompServer } from './sockets/index.js';

import { startSchedulers, stopSchedulers } from './schedulers/index.js';

const server = http.createServer(app);

// Initialize real-time Socket.IO and STOMP engines
const io = initSocketIO(server);
const wss = initStompServer();

// Route WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? request.url.split('?')[0] : '';
  if (pathname.startsWith('/api/ws-native') || pathname.startsWith('/ws-native')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

let isShuttingDown = false;

/**
 * Graceful termination handler.
 * @param {string} signal
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  // Stop background cron jobs
  stopSchedulers();

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed. Releasing database connections...');

    try {
      await disconnectDB();
      logger.info('Graceful shutdown completed successfully.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during database disconnection in shutdown');
      process.exit(1);
    }
  });

  // Force shutdown after timeout if hanging connections exist
  setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

// Process lifecycle event listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection at Promise');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, `Uncaught Exception thrown: ${err.message}`);
  gracefulShutdown('uncaughtException');
});

/**
 * Boots the server and establishes database connectivity.
 */
async function startServer() {
  try {
    logger.info(`Starting CollegeEvents backend in ${env.NODE_ENV} mode...`);

    // Connect to MongoDB
    try {
      await connectDB();

      // Ensure initial President account is provisioned if not existing
      try {
        const { RoleAssignmentService } = await import('./services/roleAssignment.service.js');
        const { User } = await import('./models/index.js');
        const existingPresident = await User.findOne({ roles: 'PRESIDENT' });
        const presidentEmail = process.env.PRESIDENT_EMAIL;
        const presidentPassword = process.env.PRESIDENT_PASSWORD;
        if (!existingPresident && presidentEmail && presidentPassword) {
          await RoleAssignmentService.provisionPresident({
            email: presidentEmail,
            password: presidentPassword,
            name: process.env.PRESIDENT_NAME || 'Association President',
          });
          logger.info('Auto-provisioned initial President account from configured credentials');
        } else if (!existingPresident) {
          logger.warn('No President account exists; set PRESIDENT_EMAIL and PRESIDENT_PASSWORD to provision one');
        }
      } catch (provErr) {
        logger.warn({ err: provErr.message }, 'President auto-provisioning check skipped or failed');
      }
    } catch (dbErr) {
      logger.warn(
        { err: dbErr.message },
        'Initial MongoDB connection failed. Server will start in degraded mode (readiness probe will report NOT_READY).'
      );
    }

    server.listen(env.PORT, () => {
      logger.info({
        port: env.PORT,
        env: env.NODE_ENV,
        healthCheck: `http://localhost:${env.PORT}/api/health`,
        readinessCheck: `http://localhost:${env.PORT}/api/ready`,
      }, `CollegeEvents backend server listening on port ${env.PORT}`);

      // Boot background schedulers
      startSchedulers();
    });
  } catch (err) {
    logger.fatal({ err }, `Fatal server startup failure: ${err.message}`);
    process.exit(1);
  }
}

// Start server if this file is executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { server, startServer, gracefulShutdown };
