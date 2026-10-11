import { Counter } from '../models/Counter.js';

/**
 * Atomically increments and retrieves the next sequential integer ID for a given collection sequence.
 * Preserves frontend compatibility with legacy integer IDs.
 *
 * @param {string} sequenceName e.g. 'users', 'events', 'bookings'
 * @returns {Promise<number>}
 */
export async function getNextSequenceValue(sequenceName) {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return counter.seq;
}

/**
 * Formats a sequential number into the mandatory Skyline member number format:
 * MEM0001, MEM0002, MEM0099, MEM0100, MEM1000, MEM10000...
 *
 * @param {number} seq
 * @returns {string}
 */
export function formatMemberNumber(seq) {
  return `MEM${String(seq).padStart(4, '0')}`;
}

/**
 * Atomically allocates the next unique member number in the sequence.
 * Concurrency-safe with retry handling for transient database failures.
 *
 * @param {number} [maxRetries=3]
 * @returns {Promise<string>}
 */
export async function getNextMemberNumber(maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const seq = await getNextSequenceValue('memberNumbers');
      return formatMemberNumber(seq);
    } catch (err) {
      attempts++;
      if (attempts >= maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
    }
  }
}

export default getNextSequenceValue;
