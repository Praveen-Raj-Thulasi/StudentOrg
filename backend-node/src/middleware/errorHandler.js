import { z } from 'zod';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Centralized error-handling middleware.
 */
export function errorHandler(err, req, res, next) {
  // If response has already started streaming, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.id || req.headers['x-request-id'] || '';
  const path = req.originalUrl || req.url;

  // 1. Specific Token Expired handling (vital for frontend silent refresh)
  if (err.errorCode === 'TOKEN_EXPIRED' || err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, {
      message: err.message || 'Access token expired',
      statusCode: 401,
      errorCode: 'TOKEN_EXPIRED',
      path,
      requestId,
    });
  }

  // 2. Operational AppError instances
  if (err instanceof AppError) {
    return ApiResponse.error(res, {
      message: err.message,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      errors: err.errors,
      path,
      requestId,
    });
  }

  // 3. Zod validation errors
  if (err instanceof z.ZodError) {
    const fieldErrors = {};
    for (const issue of err.issues) {
      const fieldPath = issue.path.join('.') || 'request';
      fieldErrors[fieldPath] = issue.message;
    }
    return ApiResponse.error(res, {
      message: 'Validation failed',
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      errors: fieldErrors,
      path,
      requestId,
    });
  }

  // 4. Mongoose validation errors
  if (err.name === 'ValidationError') {
    const fieldErrors = {};
    for (const [key, value] of Object.entries(err.errors || {})) {
      fieldErrors[key] = value.message;
    }
    return ApiResponse.error(res, {
      message: 'Database validation failed',
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      errors: fieldErrors,
      path,
      requestId,
    });
  }

  // 5. Mongoose CastError (e.g. invalid ObjectId or number casting)
  if (err.name === 'CastError') {
    return ApiResponse.error(res, {
      message: `Invalid value for parameter: ${err.path}`,
      statusCode: 400,
      errorCode: 'INVALID_PARAMETER',
      path,
      requestId,
    });
  }

  // 6. MongoDB duplicate key error (E11000)
  if (err.code === 11000) {
    const duplicateKey = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'record';
    return ApiResponse.error(res, {
      message: `A record with this ${duplicateKey} already exists`,
      statusCode: 409,
      errorCode: 'DUPLICATE_KEY',
      path,
      requestId,
    });
  }

  // 7. Express malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return ApiResponse.error(res, {
      message: 'Malformed JSON payload in request body',
      statusCode: 400,
      errorCode: 'MALFORMED_JSON',
      path,
      requestId,
    });
  }

  // 8. Unhandled internal server errors
  logger.error({
    err,
    requestId,
    path,
    method: req.method,
  }, `Unhandled error occurred: ${err.message}`);

  const message = env.NODE_ENV === 'production'
    ? 'An internal server error occurred'
    : err.message || 'Internal server error';

  return ApiResponse.error(res, {
    message,
    statusCode: 500,
    errorCode: 'INTERNAL_SERVER_ERROR',
    path,
    requestId,
  });
}

export default errorHandler;
