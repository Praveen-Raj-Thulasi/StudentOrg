import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Creates an Express middleware that validates request params, query, and/or body using Zod schemas.
 * Formats errors into a key-value map matching the existing Spring Boot validation response structure.
 *
 * @param {Object} schemas
 * @param {z.ZodTypeAny} [schemas.params] Schema for req.params
 * @param {z.ZodTypeAny} [schemas.query] Schema for req.query
 * @param {z.ZodTypeAny} [schemas.body] Schema for req.body
 * @returns {import('express').RequestHandler}
 */
export function validateRequest(schemas = {}) {
  return async (req, res, next) => {
    try {
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.') || 'request';
          fieldErrors[path] = issue.message;
        }
        return next(new ValidationError('Validation failed', fieldErrors));
      }
      next(err);
    }
  };
}

export default validateRequest;
