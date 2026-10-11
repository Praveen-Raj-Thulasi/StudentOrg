import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { TokenExpiredError, UnauthorizedError } from './errors.js';

const JWT_ISSUER = 'event-booking-system';
const DEFAULT_ACCESS_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes (1,800,000 ms)

/**
 * Parses duration string (e.g. '30m', '24h', '7d') or returns milliseconds.
 */
export function parseDurationMs(duration) {
  if (!duration) return DEFAULT_ACCESS_EXPIRATION_MS;
  if (typeof duration === 'number') return duration;
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return DEFAULT_ACCESS_EXPIRATION_MS;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return DEFAULT_ACCESS_EXPIRATION_MS;
  }
}

export function getAccessExpirationMs() {
  return parseDurationMs(env.JWT_EXPIRES_IN);
}

export const accessExpirationMs = parseDurationMs(env.JWT_EXPIRES_IN);

/**
 * Generates a signed JWT access token.
 * @param {Object} payload
 * @param {number} payload.id
 * @param {string} payload.email
 * @param {string} payload.role
 * @returns {string} Signed JWT
 */
export function generateAccessToken({ id, email, sub, role, roles, memberNumber }) {
  const subject = email || sub || String(id);
  const normalizedRoles = Array.isArray(roles) && roles.length > 0
    ? roles
    : (role === 'ORGANIZER' ? ['ORGANIZER'] : (role === 'ADMIN' || role === 'PRESIDENT') ? ['PRESIDENT', 'STUDENT'] : ['STUDENT']);
  const primaryRole = role || (normalizedRoles.includes('PRESIDENT') ? 'ADMIN' : normalizedRoles[0]);

  const payload = {
    id,
    role: primaryRole,
    roles: normalizedRoles,
  };
  if (memberNumber) payload.memberNumber = memberNumber;

  const currentAccessExpirationMs = getAccessExpirationMs();

  return jwt.sign(
    payload,
    env.JWT_SECRET,
    {
      subject,
      issuer: JWT_ISSUER,
      expiresIn: Math.floor(currentAccessExpirationMs / 1000), // in seconds
    }
  );
}

export const generateToken = generateAccessToken;

/**
 * Generates a signed refresh token with a unique single-use jti claim.
 * @param {Object} payload
 * @param {number} payload.id
 * @param {string} payload.email
 * @param {string} [payload.sub]
 * @param {string} payload.role
 * @param {string[]} [payload.roles]
 * @param {string} [payload.memberNumber]
 * @returns {{ token: string, jti: string }}
 */
export function generateRefreshToken({ id, email, sub, role, roles, memberNumber }) {
  const subject = email || sub || String(id);
  const jti = crypto.randomUUID();
  const normalizedRoles = Array.isArray(roles) && roles.length > 0
    ? roles
    : (role === 'ORGANIZER' ? ['ORGANIZER'] : (role === 'ADMIN' || role === 'PRESIDENT') ? ['PRESIDENT', 'STUDENT'] : ['STUDENT']);
  const primaryRole = role || (normalizedRoles.includes('PRESIDENT') ? 'ADMIN' : normalizedRoles[0]);

  const payload = {
    id,
    role: primaryRole,
    roles: normalizedRoles,
  };
  if (memberNumber) payload.memberNumber = memberNumber;

  const token = jwt.sign(
    payload,
    env.JWT_REFRESH_SECRET || env.JWT_SECRET,
    {
      subject,
      issuer: JWT_ISSUER,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN || '7d',
      jwtid: jti,
    }
  );

  return { token, jti };
}

/**
 * Verifies and decodes a JWT token.
 * @param {string} token
 * @param {boolean} [isRefresh=false]
 * @returns {jwt.JwtPayload}
 */
export function verifyToken(token, isRefresh = false) {
  const secret = isRefresh ? (env.JWT_REFRESH_SECRET || env.JWT_SECRET) : env.JWT_SECRET;

  try {
    const decoded = jwt.verify(token, secret, { issuer: JWT_ISSUER });
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError('Access token expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError(err.message || 'Invalid token');
    }
    throw err;
  }
}

/**
 * Inspects a token's claims without verifying signature.
 * @param {string} token
 * @returns {jwt.JwtPayload|null}
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  parseDurationMs,
  getAccessExpirationMs,
  accessExpirationMs,
};
