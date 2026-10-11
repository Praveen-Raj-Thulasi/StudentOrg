import { logger } from '../utils/logger.js';

class RefreshTokenStore {
  constructor() {
    /** @type {Map<string, number>} jti -> redemption timestamp */
    this.usedTokens = new Map();
    this.ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Periodic cleanup every hour
    this.cleanupTimer = setInterval(() => this.evictExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  /**
   * Mark a refresh token JTI as used.
   * @param {string} jti
   */
  markUsed(jti) {
    this.usedTokens.set(jti, Date.now());
  }

  /**
   * Check whether a refresh token JTI has already been redeemed.
   * @param {string} jti
   * @returns {boolean}
   */
  isUsed(jti) {
    return this.usedTokens.has(jti);
  }

  /**
   * Remove entries older than 7 days.
   */
  evictExpired() {
    const now = Date.now();
    for (const [jti, timestamp] of this.usedTokens.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.usedTokens.delete(jti);
      }
    }
  }

  /**
   * Clear all stored tokens (for testing).
   */
  clear() {
    this.usedTokens.clear();
  }
}

export const refreshTokenStore = new RefreshTokenStore();
export default refreshTokenStore;
