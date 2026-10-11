import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate.js';
import { ValidationError } from '../utils/errors.js';

describe('validateRequest Middleware', () => {
  const schema = {
    body: z.object({
      email: z.string().email('Invalid email address'),
      age: z.number().min(18, 'Must be at least 18'),
    }),
  };

  it('should pass valid request to next without error', async () => {
    const middleware = validateRequest(schema);
    const req = { body: { email: 'test@example.com', age: 20 } };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with ValidationError and mapped field errors when validation fails', async () => {
    const middleware = validateRequest(schema);
    const req = { body: { email: 'invalid-email', age: 16 } };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.errors).toEqual({
      email: 'Invalid email address',
      age: 'Must be at least 18',
    });
  });
});
