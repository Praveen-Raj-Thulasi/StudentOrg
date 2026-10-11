/**
 * Higher-order wrapper for Express async route handlers.
 * Catches rejected promises and forwards errors to next(err) for centralized error handling.
 *
 * @param {Function} fn Async route handler function (req, res, next)
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
