import { NotFoundError } from '../utils/errors.js';

/**
 * 404 Not Found middleware for unmatched routes.
 */
export function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`));
}

export default notFoundHandler;
