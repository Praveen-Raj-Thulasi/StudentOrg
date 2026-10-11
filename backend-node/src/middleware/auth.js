import { verifyToken, decodeToken } from '../utils/jwt.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { TokenExpiredError } from '../utils/errors.js';

/**
 * Mandatory JWT Authentication Middleware.
 * Validates Bearer token, enforces expiration rules, and injects X-Token-Expiry header.
 */
export function authenticateToken(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return ApiResponse.error(res, {
      message: 'Authentication required: No token provided',
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
      path: req.originalUrl,
      requestId: req.id,
    });
  }

  try {
    const payload = verifyToken(token);

    // Set authenticated user context
    req.user = {
      id: payload.id,
      email: payload.sub,
      role: payload.role,
      roles: Array.isArray(payload.roles) && payload.roles.length > 0
        ? payload.roles
        : (payload.role === 'ORGANIZER' ? ['ORGANIZER', 'STUDENT'] : (payload.role === 'ADMIN' || payload.role === 'PRESIDENT') ? ['PRESIDENT', 'STUDENT'] : ['STUDENT']),
      memberNumber: payload.memberNumber || null,
    };

    // Inject X-Token-Expiry epoch timestamp header
    if (payload.exp) {
      const expiryMs = payload.exp * 1000;
      res.setHeader('X-Token-Expiry', String(expiryMs));
    }

    next();
  } catch (err) {
    if (err instanceof TokenExpiredError || err.errorCode === 'TOKEN_EXPIRED') {
      return ApiResponse.error(res, {
        message: 'Access token expired',
        statusCode: 401,
        errorCode: 'TOKEN_EXPIRED',
        path: req.originalUrl,
        requestId: req.id,
      });
    }

    return ApiResponse.error(res, {
      message: err.message || 'Invalid token',
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
      path: req.originalUrl,
      requestId: req.id,
    });
  }
}

/**
 * Optional JWT Authentication Middleware.
 * Decodes user context if a valid token is present; proceeds without blocking if absent.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    try {
      const payload = verifyToken(token);
      req.user = {
        id: payload.id,
        email: payload.sub,
        role: payload.role,
        roles: Array.isArray(payload.roles) && payload.roles.length > 0
          ? payload.roles
          : (payload.role === 'ORGANIZER' ? ['ORGANIZER', 'STUDENT'] : (payload.role === 'ADMIN' || payload.role === 'PRESIDENT') ? ['PRESIDENT', 'STUDENT'] : ['STUDENT']),
        memberNumber: payload.memberNumber || null,
      };
      if (payload.exp) {
        res.setHeader('X-Token-Expiry', String(payload.exp * 1000));
      }
    } catch {
      // Ignored for optional routes
    }
  }
  next();
}

export default authenticateToken;
