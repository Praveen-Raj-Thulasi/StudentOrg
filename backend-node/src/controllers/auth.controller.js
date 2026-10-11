import { authService } from '../services/auth.service.js';
import { emailService } from '../services/email.service.js';
import { otpStore } from '../security/otpStore.js';
import { verifyToken, decodeToken, accessExpirationMs, getAccessExpirationMs } from '../utils/jwt.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { User, Organizer } from '../models/index.js';

export class AuthController {
  static async registerUser(req, res) {
    const auth = await authService.registerUser(req.body);
    return ApiResponse.success(
      res,
      auth,
      'Registration successful! Please verify your email.',
      201
    );
  }

  static async loginUser(req, res) {
    const auth = await authService.loginUser(req.body);
    return ApiResponse.success(res, auth, 'Login successful');
  }

  static async registerOrganizer(req, res) {
    const auth = await authService.registerOrganizer(req.body);
    return ApiResponse.success(
      res,
      auth,
      'Organizer registration successful! Please verify your email.',
      201
    );
  }

  static async loginOrganizer(req, res) {
    const auth = await authService.loginOrganizer(req.body);
    return ApiResponse.success(res, auth, 'Login successful');
  }

  static async verifyEmail(req, res) {
    const { token, role = 'USER' } = req.query;
    if (!token) {
      return ApiResponse.error(res, {
        message: 'Verification token is required',
        statusCode: 400,
        path: req.originalUrl,
      });
    }

    await authService.verifyEmail(token, role);
    return ApiResponse.success(res, null, 'Email verified successfully!');
  }

  static async forgotPassword(req, res) {
    await authService.forgotPassword(req.body);
    return ApiResponse.success(res, null, 'Password reset link sent to your email.');
  }

  static async resetPassword(req, res) {
    await authService.resetPassword(req.body);
    return ApiResponse.success(res, null, 'Password reset successfully.');
  }

  static async resetPasswordWithOtp(req, res) {
    const { email, role, otp, newPassword } = req.body;
    await authService.resetPasswordWithOtp({ email, role, otp, newPassword });
    return ApiResponse.success(res, null, 'Password reset successfully.');
  }

  static async sessionStatus(req, res) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(res, {
        message: 'No token provided',
        statusCode: 401,
        path: req.originalUrl,
      });
    }

    const token = authHeader.substring(7).trim();
    try {
      const claims = verifyToken(token);
      const expiryMs = (claims.exp || 0) * 1000;
      const remainingMs = Math.max(0, expiryMs - Date.now());

      return ApiResponse.success(
        res,
        {
          active: true,
          expiresAt: expiryMs,
          remainingMs,
          expiresIn: typeof getAccessExpirationMs === 'function' ? getAccessExpirationMs() : accessExpirationMs,
          role: claims.role,
          userId: claims.id,
        },
        'Session active'
      );
    } catch {
      return ApiResponse.error(res, {
        message: 'TOKEN_EXPIRED',
        statusCode: 401,
        errorCode: 'TOKEN_EXPIRED',
        path: req.originalUrl,
      });
    }
  }

  static async refreshToken(req, res) {
    const { refreshToken } = req.body;
    const auth = await authService.refreshToken(refreshToken);
    return ApiResponse.success(res, auth, 'Token refreshed successfully');
  }

  static async sendOtp(req, res) {
    const { email: rawEmail, role = 'USER', name: fallbackName } = req.body;
    const email = (rawEmail || '').trim().toLowerCase();

    // President account does not require OTP
    if (email === 'president@skyline.edu') {
      return ApiResponse.success(
        res,
        { emailSent: false, notRequired: true },
        'OTP verification is not required for President account'
      );
    }

    // Check if an unexpired OTP is already pending
    if (otpStore.hasPending(email)) {
      return ApiResponse.success(
        res,
        { emailSent: false, pending: true },
        'An OTP is already pending. Please check your inbox.'
      );
    }

    const otp = otpStore.generate(email);

    // Resolve user or organizer display name
    let displayName = fallbackName || 'User';
    try {
      if (role.toUpperCase() === 'ORGANIZER') {
        const org = await Organizer.findOne({ email });
        if (org) displayName = org.organizerName;
        else {
          const user = await User.findOne({ email });
          if (user) displayName = user.name;
        }
      } else {
        const user = await User.findOne({ email });
        if (user) displayName = user.name;
        else {
          const org = await Organizer.findOne({ email });
          if (org) displayName = org.organizerName;
        }
      }
    } catch {}

    const delivered = await emailService.sendOtpEmail(email, displayName, otp);

    if (!delivered) {
      otpStore.invalidate(email);
      return ApiResponse.error(res, {
        message: 'Could not send OTP email. Please verify SMTP settings and try again.',
        statusCode: 503,
        path: req.originalUrl,
      });
    }

    return ApiResponse.success(res, { emailSent: true }, `OTP sent to ${email}`);
  }

  static async verifyOtp(req, res) {
    const { email: rawEmail, otp, role = 'USER' } = req.body;
    const email = (rawEmail || '').trim().toLowerCase();

    const isValid = otpStore.verify(email, otp);
    if (!isValid) {
      return ApiResponse.error(res, {
        message: 'Invalid or expired OTP. Please request a new one.',
        statusCode: 400,
        errorCode: 'INVALID_CREDENTIALS',
        path: req.originalUrl,
      });
    }

    await authService.markEmailVerifiedByOtp(email, role);

    return ApiResponse.success(
      res,
      { verified: true, emailVerified: true },
      'Email verified successfully'
    );
  }
}

export default AuthController;
