import { ApiResponse } from '../utils/apiResponse.js';

class MemoryRateLimiter {
  constructor() {
    /** @type {Map<string, { count: number, resetAt: number }>} */
    this.hits = new Map();

    // Periodic sweep every 5 minutes
    this.sweepTimer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweepTimer.unref();
  }

  isAllowed(key, max, windowMs) {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      this.hits.set(key, record);
      return { allowed: true, remaining: max - 1, resetAt: record.resetAt };
    }

    if (record.count >= max) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count += 1;
    return { allowed: true, remaining: max - record.count, resetAt: record.resetAt };
  }

  sweep() {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now > record.resetAt) {
        this.hits.delete(key);
      }
    }
  }

  reset() {
    this.hits.clear();
  }
}

export const memoryRateLimiter = new MemoryRateLimiter();

/**
 * Creates an Express rate-limiting middleware.
 * @param {Object} options
 * @param {(req: import('express').Request) => string} options.keyGenerator Key function
 * @param {number} options.max Maximum allowed requests
 * @param {number} options.windowMs Time window in milliseconds
 * @param {string} options.message Error message returned upon exceeding limit
 * @returns {import('express').RequestHandler}
 */
export function rateLimit({
  keyGenerator = (req) => req.ip || req.connection.remoteAddress || 'global',
  max = 60,
  windowMs = 60 * 1000,
  message = 'Too many requests. Please try again later.',
} = {}) {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const { allowed, remaining, resetAt } = memoryRateLimiter.isAllowed(key, max, windowMs);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (!allowed) {
      return ApiResponse.error(res, {
        message,
        statusCode: 429,
        errorCode: 'TOO_MANY_REQUESTS',
        path: req.originalUrl,
        requestId: req.id,
      });
    }

    next();
  };
}

export default rateLimit;
