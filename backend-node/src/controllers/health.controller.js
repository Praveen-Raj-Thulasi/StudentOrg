import { getConnectionStatus } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Health controller providing liveness and readiness probe handlers.
 */
export class HealthController {
  /**
   * Liveness probe — checks if the HTTP server is alive and responding.
   */
  static getLiveness(req, res) {
    return ApiResponse.success(
      res,
      {
        status: 'UP',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
      },
      'Application is healthy and running'
    );
  }

  /**
   * Readiness probe — checks if all critical dependencies (MongoDB) are ready.
   */
  static getReadiness(req, res) {
    const dbStatus = getConnectionStatus();
    const isReady = dbStatus.isReady;

    const payload = {
      status: isReady ? 'READY' : 'NOT_READY',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: {
          type: 'MongoDB',
          status: dbStatus.state,
          host: dbStatus.host,
          database: dbStatus.dbName,
        },
      },
      system: {
        nodeVersion: process.version,
        memoryUsageMb: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      },
    };

    if (!isReady) {
      return ApiResponse.error(res, {
        message: 'Application is not ready to serve traffic: database disconnected',
        statusCode: 503,
        errorCode: 'SERVICE_UNAVAILABLE',
        errors: payload,
        path: req.originalUrl,
      });
    }

    return ApiResponse.success(res, payload, 'Application is ready to serve traffic');
  }
}

export default HealthController;
