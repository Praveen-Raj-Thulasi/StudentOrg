import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().default(0),
  size: z.coerce.number().int().positive().max(100).default(10),
  sort: z.string().optional(),
  direction: z.enum(['asc', 'desc']).default('asc'),
});

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('must be a well-formed email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must not exceed 100 characters');

export default {
  idParamSchema,
  paginationQuerySchema,
  emailSchema,
  passwordSchema,
};
