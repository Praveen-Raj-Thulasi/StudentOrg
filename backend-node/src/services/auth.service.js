import crypto from 'node:crypto';
import { User, Organizer, Notification, AuditLog } from '../models/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  accessExpirationMs,
  getAccessExpirationMs,
} from '../utils/jwt.js';
import { refreshTokenStore } from '../security/refreshTokenStore.js';
import { otpStore } from '../security/otpStore.js';
import { emailService } from './email.service.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../utils/errors.js';

class AuthService {
  /**
   * Helper to format standard AuthResponse payload
   */
  buildAuthResponse(id, email, role, name, picture, verified, roles = null, memberNumber = null) {
    const normalizedRoles = Array.isArray(roles) && roles.length > 0
      ? roles
      : (role === 'ORGANIZER' ? ['ORGANIZER'] : (role === 'ADMIN' || role === 'PRESIDENT') ? ['PRESIDENT', 'STUDENT'] : ['STUDENT']);
    const primaryRole = role || (normalizedRoles.includes('PRESIDENT') ? 'ADMIN' : normalizedRoles[0]);

    const currentAccessExpMs = typeof getAccessExpirationMs === 'function' ? getAccessExpirationMs() : accessExpirationMs;
    const accessToken = generateAccessToken({ id, email, role: primaryRole, roles: normalizedRoles, memberNumber });
    const { token: refreshToken } = generateRefreshToken({ id, email, role: primaryRole, roles: normalizedRoles, memberNumber });
    const expiresAt = Date.now() + currentAccessExpMs;

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: currentAccessExpMs,
      expiresAt,
      user: {
        id,
        name,
        email,
        role: primaryRole,
        roles: normalizedRoles,
        memberNumber: memberNumber || null,
        profilePicture: picture || null,
        emailVerified: Boolean(verified),
      },
    };
  }

  normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  normalizeRole(role) {
    if (!role) return '';
    const r = String(role).trim().toUpperCase();
    if (r === 'USER') return 'STUDENT';
    if (r === 'ADMIN') return 'PRESIDENT';
    return r;
  }

  // ── User Registration & Login ─────────────────────────────────────────────

  async registerUser(data) {
    const email = this.normalizeEmail(data.email);
    const name = (data.name || '').trim() || email.split('@')[0] || 'Student';

    if (email === 'president@skyline.edu' || email.startsWith('president@')) {
      throw new ForbiddenError(
        'Public registration for the President account is prohibited. The President account must be provisioned administratively.'
      );
    }

    // Client-supplied roles are strictly ignored; public registration creates only STUDENT accounts
    // (Roles cannot be escalated via public registration endpoints)

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError(`User Already Exists with email: ${email}`);
    }

    const hashedPassword = await hashPassword(data.password);
    const verificationToken = crypto.randomUUID();

    const location = {
      address: data.address || null,
      street: data.street || null,
      area: data.area || null,
      city: data.city || null,
      district: data.district || null,
      state: data.state || null,
      country: data.country || null,
      pinCode: data.pinCode || null,
      coordinates: {
        latitude: data.latitude || null,
        longitude: data.longitude || null,
      },
    };

    const user = new User({
      name,
      email,
      passwordHash: hashedPassword,
      phone: data.phone || null,
      address: data.address || null,
      pinCode: data.pinCode || null,
      organizationName: data.organizationName || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || null,
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      emailVerified: false,
      verificationToken,
      role: 'USER',
      roles: ['STUDENT'],
      location,
    });

    await user.save();

    // Send in-app notification & audit log asynchronously
    Notification.create({
      recipientId: user.id,
      recipientType: 'USER',
      notificationType: 'REGISTRATION_SUCCESS',
      title: 'Welcome to Skyline Student Association Hub!',
      message: 'Your account has been created. Please verify your email.',
    }).catch(() => {});

    AuditLog.create({
      actorId: user.id,
      actorType: 'USER',
      action: 'REGISTRATION',
      targetType: 'USER',
      targetId: String(user.id),
      details: 'User registered with default STUDENT role and memberNumber ' + user.memberNumber,
    }).catch(() => {});

    return this.buildAuthResponse(
      user.id,
      user.email,
      user.role,
      user.name,
      user.profilePicture,
      user.emailVerified,
      user.roles,
      user.memberNumber
    );
  }

  async loginUser({ email: rawEmail, password, portal }) {
    const email = this.normalizeEmail(rawEmail);
    let user = await User.findOne({ email });
    let isOrganizerAccount = false;

    // If not found in User, check Organizer collection for potential organizer portal login
    if (!user) {
      const org = await Organizer.findOne({ email });
      if (org) {
        user = org;
        isOrganizerAccount = true;
      }
    }

    if (!user) {
      throw new AppError('Invalid Credentials', 400, 'INVALID_CREDENTIALS');
    }

    if (user.accountLocked) {
      throw new AppError('Account is locked. Please contact support.', 403, 'ACCOUNT_LOCKED');
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      if (!isOrganizerAccount) {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= 5) {
          user.accountLocked = true;
          await user.save();
          throw new AppError('Account locked after too many failed attempts.', 403, 'ACCOUNT_LOCKED');
        }
        await user.save();
      }
      throw new AppError('Invalid Credentials', 400, 'INVALID_CREDENTIALS');
    }

    // Reset failed login attempts upon successful authentication
    if (!isOrganizerAccount && user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      await user.save();
    }

    // Authoritative role resolution
    let authoritativeRoles = [];
    if (isOrganizerAccount) {
      authoritativeRoles = ['ORGANIZER'];
    } else {
      authoritativeRoles = Array.isArray(user.roles) && user.roles.length > 0
        ? [...user.roles]
        : [user.role || 'STUDENT'];
    }

    // Canonical role mapping with aliases
    const normalizedRoles = new Set(
      authoritativeRoles.map((r) => this.normalizeRole(r))
    );
    if (normalizedRoles.has('STUDENT')) normalizedRoles.add('USER');
    if (normalizedRoles.has('USER'))    normalizedRoles.add('STUDENT');
    if (normalizedRoles.has('PRESIDENT')) normalizedRoles.add('ADMIN');
    if (normalizedRoles.has('ADMIN'))     normalizedRoles.add('PRESIDENT');

    // Portal authorization validation
    if (portal) {
      const canonicalPortal = this.normalizeRole(portal);
      if (!normalizedRoles.has(canonicalPortal)) {
        throw new AppError(
          `Account is not authorized for the requested ${portal.toUpperCase()} portal.`,
          403,
          'FORBIDDEN_PORTAL_ACCESS'
        );
      }
    }

    // Determine primary display role for legacy token/response compatibility
    let primaryRole = isOrganizerAccount ? 'ORGANIZER' : user.role || 'USER';
    if (portal) {
      const pUpper = portal.toUpperCase();
      if (pUpper === 'PRESIDENT' || pUpper === 'ADMIN') primaryRole = 'ADMIN';
      else if (pUpper === 'ORGANIZER') primaryRole = 'ORGANIZER';
      else if (pUpper === 'STUDENT' || pUpper === 'USER') primaryRole = 'USER';
      else if (pUpper === 'TREASURER') primaryRole = 'TREASURER';
      else if (pUpper === 'VOLUNTEER') primaryRole = 'VOLUNTEER';
    }

    AuditLog.create({
      actorId: user.id,
      actorType: isOrganizerAccount ? 'ORGANIZER' : 'USER',
      action: 'LOGIN',
      targetType: isOrganizerAccount ? 'ORGANIZER' : 'USER',
      targetId: String(user.id),
      details: `User login for portal: ${portal || 'DEFAULT'}`,
    }).catch(() => {});

    if (isOrganizerAccount) {
      return this.buildAuthResponse(
        user.id,
        user.email,
        primaryRole,
        user.organizerName,
        user.organizationLogo,
        user.emailVerified,
        ['ORGANIZER']
      );
    }

    return this.buildAuthResponse(
      user.id,
      user.email,
      primaryRole,
      user.name,
      user.profilePicture,
      user.emailVerified,
      authoritativeRoles,
      user.memberNumber
    );
  }

  // ── Organizer Registration & Login ────────────────────────────────────────

  async registerOrganizer(data) {
    const email = this.normalizeEmail(data.email);
    const existingOrg = await Organizer.findOne({ email });
    if (existingOrg) {
      throw new ConflictError(`Organizer Already Exists with email: ${email}`);
    }

    const hashedPassword = await hashPassword(data.password);
    const verificationToken = crypto.randomUUID();

    const location = {
      address: data.address || null,
      street: data.street || null,
      area: data.area || null,
      city: data.city || null,
      district: data.district || null,
      state: data.state || null,
      country: data.country || null,
      pinCode: data.pinCode || null,
      coordinates: {
        latitude: data.latitude || null,
        longitude: data.longitude || null,
      },
    };

    const organizer = new Organizer({
      organizerName: (data.organizerName || '').trim(),
      organizationName: (data.organizationName || '').trim(),
      email,
      passwordHash: hashedPassword,
      phone: data.phone || null,
      address: data.address || null,
      pinCode: data.pinCode || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || null,
      website: data.website || null,
      description: data.description || null,
      emailVerified: false,
      verificationToken,
      isApproved: true,
      role: 'ORGANIZER',
      location,
    });

    await organizer.save();

    AuditLog.create({
      actorId: organizer.id,
      actorType: 'ORGANIZER',
      action: 'REGISTRATION',
      targetType: 'ORGANIZER',
      targetId: String(organizer.id),
      details: 'Organizer registered',
    }).catch(() => {});

    return this.buildAuthResponse(
      organizer.id,
      organizer.email,
      organizer.role,
      organizer.organizerName,
      organizer.organizationLogo,
      organizer.emailVerified,
      ['ORGANIZER']
    );
  }

  async loginOrganizer({ email: rawEmail, password, portal }) {
    const email = this.normalizeEmail(rawEmail);
    let organizer = await Organizer.findOne({ email });
    let isUserWithOrgRole = false;

    if (!organizer) {
      const user = await User.findOne({ email });
      if (user) {
        const uRoles = Array.isArray(user.roles) ? user.roles : [user.role];
        const hasOrgRole = uRoles.some((r) => String(r).toUpperCase() === 'ORGANIZER');
        if (hasOrgRole) {
          organizer = user;
          isUserWithOrgRole = true;
        }
      }
    }

    if (!organizer) {
      throw new AppError('Invalid Credentials', 400, 'INVALID_CREDENTIALS');
    }

    const isMatch = await verifyPassword(password, organizer.passwordHash);
    if (!isMatch) {
      throw new AppError('Invalid Credentials', 400, 'INVALID_CREDENTIALS');
    }

    // Portal authorization validation
    if (portal) {
      const canonicalPortal = this.normalizeRole(portal);
      if (canonicalPortal !== 'ORGANIZER') {
        throw new AppError(
          `Account is not authorized for the requested ${portal.toUpperCase()} portal.`,
          403,
          'FORBIDDEN_PORTAL_ACCESS'
        );
      }
    }

    AuditLog.create({
      actorId: organizer.id,
      actorType: isUserWithOrgRole ? 'USER' : 'ORGANIZER',
      action: 'LOGIN',
      targetType: isUserWithOrgRole ? 'USER' : 'ORGANIZER',
      targetId: String(organizer.id),
      details: 'Organizer login',
    }).catch(() => {});

    if (isUserWithOrgRole) {
      return this.buildAuthResponse(
        organizer.id,
        organizer.email,
        'ORGANIZER',
        organizer.name,
        organizer.profilePicture,
        organizer.emailVerified,
        organizer.roles,
        organizer.memberNumber
      );
    }

    return this.buildAuthResponse(
      organizer.id,
      organizer.email,
      organizer.role,
      organizer.organizerName,
      organizer.organizationLogo,
      organizer.emailVerified,
      ['ORGANIZER']
    );
  }

  // ── Verification & Recovery ───────────────────────────────────────────────

  async verifyEmail(token, role = 'USER') {
    if (role.toUpperCase() === 'ORGANIZER') {
      const org = await Organizer.findOne({ verificationToken: token });
      if (!org) {
        throw new NotFoundError('Invalid or expired verification token');
      }
      org.emailVerified = true;
      org.verificationToken = null;
      await org.save();
    } else {
      const user = await User.findOne({ verificationToken: token });
      if (!user) {
        throw new NotFoundError('Invalid or expired verification token');
      }
      user.emailVerified = true;
      user.verificationToken = null;
      await user.save();
    }
  }

  async markEmailVerifiedByOtp(email, role = 'USER') {
    const normalized = this.normalizeEmail(email);
    if (role.toUpperCase() === 'ORGANIZER') {
      const org = await Organizer.findOne({ email: normalized });
      if (!org) throw new NotFoundError('Organizer not found');
      org.emailVerified = true;
      org.verificationToken = null;
      await org.save();
    } else {
      const user = await User.findOne({ email: normalized });
      if (!user) throw new NotFoundError('User not found');
      user.emailVerified = true;
      user.verificationToken = null;
      await user.save();
    }
  }

  async forgotPassword({ email: rawEmail, role = 'USER' }) {
    const email = this.normalizeEmail(rawEmail);
    const resetToken = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    if (role.toUpperCase() === 'ORGANIZER') {
      const org = await Organizer.findOne({ email });
      if (!org) throw new NotFoundError('No account found with that email');
      org.resetPasswordToken = resetToken;
      org.resetTokenExpiry = expiry;
      await org.save();
      await emailService.sendPasswordResetEmail(org.email, org.organizerName, resetToken);
    } else {
      const user = await User.findOne({ email });
      if (!user) throw new NotFoundError('No account found with that email');
      user.resetPasswordToken = resetToken;
      user.resetTokenExpiry = expiry;
      await user.save();
      await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);
    }
  }

  async resetPassword({ token, role = 'USER', newPassword }) {
    const hashedPassword = await hashPassword(newPassword);

    if (role.toUpperCase() === 'ORGANIZER') {
      const org = await Organizer.findOne({ resetPasswordToken: token });
      if (!org) throw new NotFoundError('Invalid or expired reset token');
      if (org.resetTokenExpiry && org.resetTokenExpiry < new Date()) {
        throw new AppError('Password reset token has expired', 400, 'TOKEN_EXPIRED');
      }
      org.passwordHash = hashedPassword;
      org.resetPasswordToken = null;
      org.resetTokenExpiry = null;
      await org.save();
    } else {
      const user = await User.findOne({ resetPasswordToken: token });
      if (!user) throw new NotFoundError('Invalid or expired reset token');
      if (user.resetTokenExpiry && user.resetTokenExpiry < new Date()) {
        throw new AppError('Password reset token has expired', 400, 'TOKEN_EXPIRED');
      }
      user.passwordHash = hashedPassword;
      user.resetPasswordToken = null;
      user.resetTokenExpiry = null;
      await user.save();
    }
  }

  async resetPasswordWithOtp({ email: rawEmail, role = 'USER', otp, newPassword }) {
    const email = this.normalizeEmail(rawEmail);
    const isValid = otpStore.verify(email, otp);
    if (!isValid) {
      throw new AppError('Invalid or expired OTP. Please request a new one.', 400, 'INVALID_CREDENTIALS');
    }

    const hashedPassword = await hashPassword(newPassword);

    if (role.toUpperCase() === 'ORGANIZER') {
      const org = await Organizer.findOne({ email });
      if (!org) throw new NotFoundError('No account found with that email');
      org.passwordHash = hashedPassword;
      org.resetPasswordToken = null;
      org.resetTokenExpiry = null;
      await org.save();
    } else {
      const user = await User.findOne({ email });
      if (!user) throw new NotFoundError('No account found with that email');
      user.passwordHash = hashedPassword;
      user.resetPasswordToken = null;
      user.resetTokenExpiry = null;
      await user.save();
    }
  }

  // ── Refresh Token Rotation ────────────────────────────────────────────────

  async refreshToken(refreshToken) {
    const claims = verifyToken(refreshToken, true);
    const jti = claims.jti;

    if (!jti || refreshTokenStore.isUsed(jti)) {
      throw new UnauthorizedError('TOKEN_ALREADY_USED');
    }

    // Mark JTI as used immediately to enforce single-use rotation
    refreshTokenStore.markUsed(jti);

    const id = claims.id;
    const email = claims.sub;
    const role = claims.role;

    // Fetch user or organizer to ensure account is still active and valid
    let name = '';
    let picture = null;
    let verified = false;
    let userRoles = null;
    let memberNumber = null;

    if (role === 'ORGANIZER') {
      const org = await Organizer.findOne({ id });
      if (org) {
        name = org.organizerName;
        picture = org.organizationLogo;
        verified = org.emailVerified;
        userRoles = ['ORGANIZER', 'STUDENT'];
      }
    } else {
      const user = await User.findOne({ id });
      if (user) {
        name = user.name;
        picture = user.profilePicture;
        verified = user.emailVerified;
        userRoles = user.roles;
        memberNumber = user.memberNumber;
      }
    }

    return this.buildAuthResponse(id, email, role, name, picture, verified, userRoles, memberNumber);
  }
}

export const authService = new AuthService();
export default authService;
