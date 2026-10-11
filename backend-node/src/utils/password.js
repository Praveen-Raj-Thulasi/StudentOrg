import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using BCrypt.
 * Compatible with Spring Security's BCryptPasswordEncoder ($2a$).
 * @param {string} password Plaintext password
 * @returns {Promise<string>} BCrypt hash
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored BCrypt hash.
 * @param {string} password Plaintext password
 * @param {string} hash Stored BCrypt hash
 * @returns {Promise<boolean>} True if match
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export default { hashPassword, verifyPassword };
