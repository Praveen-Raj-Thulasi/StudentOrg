import pinoHttp from 'pino-http';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * HTTP request logging middleware using pino-http.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id || req.headers['x-request-id'],
  autoLogging: {
    ignore: (req) => {
      // Avoid log flooding for frequent readiness checks in production
      return req.url === '/health' || req.url === '/ready' || req.url === '/api/health';
    },
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} completed with status ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} failed with status ${res.statusCode}: ${err.message}`,
  quietReqLogger: true,
});

export default httpLogger;
