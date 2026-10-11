import { z } from 'zod';
import { emailSchema, passwordSchema } from './common.validator.js';

export const userRegisterSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  pinCode: z.string().trim().optional().nullable(),
  organizationName: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  street: z.string().trim().optional().nullable(),
  area: z.string().trim().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
  roles: z.any().optional(),
  role: z.any().optional(),
});

export const organizerRegisterSchema = z.object({
  organizerName: z.string().trim().min(1, 'Organizer name is required').max(120),
  organizationName: z.string().trim().min(1, 'Organization name is required').max(160),
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  pinCode: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  street: z.string().trim().optional().nullable(),
  area: z.string().trim().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  portal: z.string().trim().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  role: z.enum(['USER', 'ORGANIZER']).default('USER'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['USER', 'ORGANIZER']).default('USER'),
});

export const resetPasswordOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().min(1, 'OTP is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['USER', 'ORGANIZER']).default('USER'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const otpSendSchema = z.object({
  email: emailSchema,
  role: z.enum(['USER', 'ORGANIZER']).default('USER'),
  name: z.string().optional(),
});

export const otpVerifySchema = z.object({
  email: emailSchema,
  otp: z.string().min(1, 'OTP is required'),
  role: z.enum(['USER', 'ORGANIZER']).default('USER'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
