import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler.js';
import { notFoundHandler } from '../middleware/notFoundHandler.js';
import { TokenExpiredError, NotFoundError, ValidationError } from '../utils/errors.js';

describe('Error Handling Middleware', () => {
  function createMockContext() {
    const req = {
      id: 'test-req-id-123',
      originalUrl: '/api/test/resource',
      method: 'GET',
      headers: {},
    };
    const res = {};
    res.statusCode = 200;
    res.headersSent = false;
    res.status = vi.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = vi.fn().mockImplementation((payload) => {
      res.body = payload;
      return res;
    });
    const next = vi.fn();
    return { req, res, next };
  }

  it('should format TokenExpiredError with exact errorCode required by frontend silent refresh', () => {
    const { req, res, next } = createMockContext();
    const tokenErr = new TokenExpiredError('JWT signature has expired');

    errorHandler(tokenErr, req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('TOKEN_EXPIRED');
    expect(res.body.status).toBe(401);
    expect(res.body.message).toBe('JWT signature has expired');
    expect(res.body.path).toBe('/api/test/resource');
    expect(res.body.requestId).toBe('test-req-id-123');
  });

  it('should format ValidationError with field error dictionary', () => {
    const { req, res, next } = createMockContext();
    const valErr = new ValidationError('Validation failed', { title: 'Title is required' });

    errorHandler(valErr, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual({ title: 'Title is required' });
  });

  it('should handle notFoundHandler by passing NotFoundError to next', () => {
    const { req, res, next } = createMockContext();

    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
  });
});
