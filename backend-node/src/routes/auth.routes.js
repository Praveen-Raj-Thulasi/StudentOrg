import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  userRegisterSchema,
  organizerRegisterSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetPasswordOtpSchema,
  refreshTokenSchema,
  otpSendSchema,
  otpVerifySchema,
} from '../validators/auth.validator.js';

const router = Router();

// Rate limiters for sensitive endpoints
const loginRateLimiter = rateLimit({
  max: 10,
  windowMs: 60 * 1000,
  message: 'Too many login attempts. Please try again in a minute.',
});

const otpRateLimiter = rateLimit({
  max: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Too many OTP requests from this IP. Please try again later.',
});

// ── User Authentication ───────────────────────────────────────────────────
router.post(
  '/auth/user/register',
  validateRequest({ body: userRegisterSchema }),
  asyncHandler(AuthController.registerUser)
);

router.post(
  '/auth/user/login',
  loginRateLimiter,
  validateRequest({ body: loginSchema }),
  asyncHandler(AuthController.loginUser)
);

// ── Organizer Authentication ──────────────────────────────────────────────
router.post(
  '/auth/organizer/register',
  validateRequest({ body: organizerRegisterSchema }),
  asyncHandler(AuthController.registerOrganizer)
);

router.post(
  '/auth/organizer/login',
  loginRateLimiter,
  validateRequest({ body: loginSchema }),
  asyncHandler(AuthController.loginOrganizer)
);

// ── Email Verification ────────────────────────────────────────────────────
router.get('/auth/verify-email', asyncHandler(AuthController.verifyEmail));

// ── Password Recovery ─────────────────────────────────────────────────────
router.post(
  '/auth/forgot-password',
  validateRequest({ body: forgotPasswordSchema }),
  asyncHandler(AuthController.forgotPassword)
);

router.post(
  '/auth/reset-password',
  validateRequest({ body: resetPasswordSchema }),
  asyncHandler(AuthController.resetPassword)
);

router.post(
  '/auth/reset-password/otp',
  validateRequest({ body: resetPasswordOtpSchema }),
  asyncHandler(AuthController.resetPasswordWithOtp)
);

// ── Session & Tokens ──────────────────────────────────────────────────────
router.get('/auth/session-status', asyncHandler(AuthController.sessionStatus));

router.post(
  '/auth/refresh-token',
  validateRequest({ body: refreshTokenSchema }),
  asyncHandler(AuthController.refreshToken)
);

// ── OTP Services ──────────────────────────────────────────────────────────
router.post(
  '/auth/otp/send',
  otpRateLimiter,
  validateRequest({ body: otpSendSchema }),
  asyncHandler(AuthController.sendOtp)
);

router.post(
  '/auth/otp/verify',
  validateRequest({ body: otpVerifySchema }),
  asyncHandler(AuthController.verifyOtp)
);

export default router;
