import crypto from 'node:crypto';

class OtpStore {
  constructor() {
    /** @type {Map<string, { otp: string, expiresAt: number, attempts: number }>} */
    this.store = new Map();
    this.ttlMs = 10 * 60 * 1000; // 10 minutes
    this.maxAttempts = 5;

    // Periodic cleanup every hour
    this.cleanupTimer = setInterval(() => this.evictExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  /**
   * Generates a 6-digit numeric OTP and stores it for the given email.
   * @param {string} email
   * @returns {string} 6-digit OTP
   */
  generate(email) {
    const key = email.toLowerCase().trim();
    // Cryptographically secure 6-digit number between 100000 and 999999
    const otp = String(crypto.randomInt(100000, 1000000));
    this.store.set(key, {
      otp,
      expiresAt: Date.now() + this.ttlMs,
      attempts: 0,
    });
    return otp;
  }

  /**
   * Verifies the OTP for the given email.
   * @param {string} email
   * @param {string} otp
   * @returns {boolean}
   */
  verify(email, otp) {
    const key = email.toLowerCase().trim();
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    if (entry.attempts >= this.maxAttempts) {
      this.store.delete(key);
      return false;
    }

    if (entry.otp === otp) {
      this.store.delete(key); // One-time use
      return true;
    }

    entry.attempts += 1;
    return false;
  }

  /**
   * Returns true if a valid, unexpired OTP already exists for the email.
   * @param {string} email
   * @returns {boolean}
   */
  hasPending(email) {
    const key = email.toLowerCase().trim();
    const entry = this.store.get(key);
    return Boolean(entry && Date.now() <= entry.expiresAt);
  }

  /**
   * Invalidates any pending OTP (e.g. if delivery failed).
   * @param {string} email
   */
  invalidate(email) {
    const key = email.toLowerCase().trim();
    this.store.delete(key);
  }

  /**
   * Clean up expired entries.
   */
  evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all stored OTPs (for testing).
   */
  clear() {
    this.store.clear();
  }
}

export const otpStore = new OtpStore();
export default otpStore;
