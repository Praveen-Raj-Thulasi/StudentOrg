import { z } from 'zod';

export const participantSchema = z.object({
  name: z.string().trim().min(1, 'Participant name is required').max(120),
  email: z.string().trim().email('Invalid participant email').max(160),
  department: z.string().trim().optional().nullable(),
  college: z.string().trim().optional().nullable(),
});

export const createBookingSchema = z.object({
  eventId: z.number().int().positive('Event ID must be a positive integer'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Maximum 10 tickets per booking'),
  participants: z.array(participantSchema).optional().default([]),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(1).default('User requested cancellation').optional(),
});
