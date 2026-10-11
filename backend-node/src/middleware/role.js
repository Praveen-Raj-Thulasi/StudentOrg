import { ApiResponse } from '../utils/apiResponse.js';
import { User, Organizer } from '../models/index.js';

/**
 * Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses at least one of the allowed roles.
 * Authoritative: checks backend DB state for timely enforcement of role revocations.
 *
 * Supported Roles:
 * - STUDENT (aliases legacy USER)
 * - ORGANIZER
 * - PRESIDENT (aliases legacy ADMIN)
 * - TREASURER
 * - VOLUNTEER
 *
 * @param {...(string|string[])} allowedRoles Roles permitted to access the endpoint
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.flat().map((r) => String(r).toUpperCase());

  return async (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, {
        message: 'Authentication required',
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        path: req.originalUrl,
        requestId: req.id,
      });
    }

    let userRole = (req.user.role || '').toUpperCase();
    let userRoles = Array.isArray(req.user.roles)
      ? req.user.roles.map((r) => String(r).toUpperCase())
      : [];

    if (userRole && !userRoles.includes(userRole)) {
      userRoles.push(userRole);
    }

    // Authoritative check against persistent DB to enforce prompt revocation
    if (req.user.id) {
      try {
        if (userRole === 'ORGANIZER') {
          const dbOrg = await Organizer.findOne({ id: req.user.id }).select('role isApproved');
          if (dbOrg) {
            if (dbOrg.isApproved === false) {
              return ApiResponse.error(res, {
                message: 'Organizer account is pending approval',
                statusCode: 403,
                errorCode: 'FORBIDDEN',
                path: req.originalUrl,
                requestId: req.id,
              });
            }
            userRole = 'ORGANIZER';
            userRoles = ['ORGANIZER'];
            req.user.role = 'ORGANIZER';
            req.user.roles = ['ORGANIZER'];
          }
        } else {
          const dbUser = await User.findOne({ id: req.user.id }).select('role roles accountLocked');
          if (dbUser) {
            if (dbUser.accountLocked) {
              return ApiResponse.error(res, {
                message: 'Account is locked',
                statusCode: 403,
                errorCode: 'ACCOUNT_LOCKED',
                path: req.originalUrl,
                requestId: req.id,
              });
            }
            userRole = (dbUser.role || userRole).toUpperCase();
            userRoles = Array.isArray(dbUser.roles) && dbUser.roles.length > 0
              ? dbUser.roles.map((r) => String(r).toUpperCase())
              : [userRole];
            if (userRole && !userRoles.includes(userRole)) {
              userRoles.push(userRole);
            }
            req.user.role = userRole;
            req.user.roles = userRoles;
          }
        }
      } catch {
        // Fall back to token claims if DB query encounters transient issue
      }
    }

    // Expand role aliases for seamless backward compatibility
    const effectiveRoles = new Set(userRoles);
    if (userRole) effectiveRoles.add(userRole);

    if (effectiveRoles.has('STUDENT')) effectiveRoles.add('USER');
    if (effectiveRoles.has('USER'))    effectiveRoles.add('STUDENT');
    if (effectiveRoles.has('PRESIDENT')) effectiveRoles.add('ADMIN');
    if (effectiveRoles.has('ADMIN'))     effectiveRoles.add('PRESIDENT');

    const hasPermission = normalizedAllowed.some((role) => effectiveRoles.has(role));

    if (!hasPermission) {
      return ApiResponse.error(res, {
        message: 'Access denied: Insufficient role permissions',
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        path: req.originalUrl,
        requestId: req.id,
      });
    }

    next();
  };
}

export default requireRole;
