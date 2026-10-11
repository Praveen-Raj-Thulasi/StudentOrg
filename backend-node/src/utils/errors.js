/**
 * Base Application Error class for operational errors.
 */
export class AppError extends Error {
  /**
   * @param {string} message Human-readable error message
   * @param {number} [statusCode=500] HTTP status code
   * @param {string} [errorCode='INTERNAL_SERVER_ERROR'] Machine-readable error code
   * @param {Object|Array} [errors=null] Granular field-level errors
   */
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', errors = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', errorCode = 'NOT_FOUND') {
    super(message, 404, errorCode);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = null, errorCode = 'VALIDATION_ERROR') {
    super(message, 400, errorCode, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', errorCode = 'UNAUTHORIZED') {
    super(message, 401, errorCode);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message = 'Access token expired', errorCode = 'TOKEN_EXPIRED') {
    super(message, 401, errorCode);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', errorCode = 'FORBIDDEN') {
    super(message, 403, errorCode);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', errorCode = 'CONFLICT') {
    super(message, 409, errorCode);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', errorCode = 'BAD_REQUEST', errors = null) {
    super(message, 400, errorCode, errors);
  }
}
