import crypto from 'node:crypto';

/**
 * Middleware that assigns or preserves a unique X-Request-Id for every incoming HTTP request.
 */
export function requestIdMiddleware(req, res, next) {
  const existingId = req.header('x-request-id');
  const requestId = existingId || crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export default requestIdMiddleware;
