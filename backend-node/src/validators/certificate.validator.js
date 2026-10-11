import { z } from 'zod';

export const generateSelectedSchema = z.object({
  userIds: z.array(z.number()).min(1, 'userIds array must not be empty'),
});

export const revokeCertificateSchema = z.object({
  reason: z.string().optional(),
});
