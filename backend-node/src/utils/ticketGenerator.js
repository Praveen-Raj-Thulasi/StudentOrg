import crypto from 'crypto';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generates human-readable unique ticket IDs.
 * Format: EVT-YYYYMMDD-XXXXXXXX (e.g., EVT-20261010-A3F9B2C1)
 * Exactly mirrors com.eventbooking.util.TicketIdGenerator in Java.
 *
 * @returns {string} Unique formatted ticket ID
 */
export function generateTicketId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const randomBytes = crypto.randomBytes(8);
  let segment = '';
  for (let i = 0; i < 8; i++) {
    segment += CHARS[randomBytes[i] % CHARS.length];
  }

  return `EVT-${dateStr}-${segment}`;
}

export default generateTicketId;
