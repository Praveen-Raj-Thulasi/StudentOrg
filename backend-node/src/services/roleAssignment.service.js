import { User, AuditLog } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export const DELEGABLE_ROLES = ['ORGANIZER', 'TREASURER', 'VOLUNTEER'];
export const ALL_ROLES = ['STUDENT', 'ORGANIZER', 'PRESIDENT', 'TREASURER', 'VOLUNTEER'];

export class RoleAssignmentService {
  /**
   * Controlled administrative provisioning of the initial President.
   * Enforces that only one active President can exist unless explicitly transferred.
   *
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.password
   * @param {string} [params.name]
   * @returns {Promise<{ user: Object, alreadyProvisioned: boolean }>}
   */
  static async provisionPresident({ email: rawEmail, password, name = 'Association President', transfer = false }) {
    if (!rawEmail || !password) {
      throw new AppError('Email and password are required to provision President', 400, 'BAD_REQUEST');
    }

    const email = rawEmail.trim().toLowerCase();

    // Check if an active President already exists
    const existingPresident = await User.findOne({ roles: 'PRESIDENT' });
    if (existingPresident) {
      if (existingPresident.email === email) {
        // Idempotent: update credentials if provided
        if (password) {
          existingPresident.passwordHash = await hashPassword(password);
          existingPresident.accountLocked = false;
          existingPresident.failedLoginAttempts = 0;
          existingPresident.emailVerified = true;
          await existingPresident.save();
        }
        return { user: existingPresident, alreadyProvisioned: true };
      }
      if (!transfer) {
        throw new ConflictError(
          `An active President is already provisioned for this organization (${existingPresident.email}). Multiple active Presidents are prohibited. Use --transfer to reassign the President role.`
        );
      }

      // Explicit administrative transfer requested: demote previous President to STUDENT
      existingPresident.roles = (existingPresident.roles || []).filter((r) => r !== 'PRESIDENT');
      if (!existingPresident.roles.includes('STUDENT')) existingPresident.roles.push('STUDENT');
      existingPresident.role = 'USER';
      await existingPresident.save();

      await AuditLog.create({
        actorId: 0,
        actorType: 'SYSTEM',
        action: 'PRESIDENT_TRANSFERRED',
        targetType: 'USER',
        targetId: String(existingPresident.id),
        details: `President role revoked from ${existingPresident.email} during transfer to ${email}`,
      }).catch(() => {});
    }

    // Check if user account already exists under this email
    let user = await User.findOne({ email });
    const hashedPassword = await hashPassword(password);

    if (user) {
      // Elevate existing account
      const currentRoles = Array.isArray(user.roles) ? user.roles : ['STUDENT'];
      if (!currentRoles.includes('STUDENT')) currentRoles.push('STUDENT');
      if (!currentRoles.includes('PRESIDENT')) currentRoles.push('PRESIDENT');

      user.roles = currentRoles;
      user.role = 'ADMIN'; // backward compatibility
      user.passwordHash = hashedPassword;
      user.emailVerified = true;
      await user.save();
    } else {
      user = new User({
        name: name.trim(),
        email,
        passwordHash: hashedPassword,
        emailVerified: true,
        role: 'ADMIN',
        roles: ['STUDENT', 'PRESIDENT'],
      });
      await user.save();
    }

    await AuditLog.create({
      actorId: user.id,
      actorType: 'SYSTEM',
      action: 'PRESIDENT_PROVISIONED',
      targetType: 'USER',
      targetId: String(user.id),
      details: `President account provisioned for ${email} with Member ID ${user.memberNumber}`,
    }).catch(() => {});

    return { user, alreadyProvisioned: false };
  }

  /**
   * Checks whether a given user holds the authoritative PRESIDENT role.
   *
   * @param {number|string} userId
   * @returns {Promise<boolean>}
   */
  static async isPresident(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) return false;
    const roles = Array.isArray(user.roles) ? user.roles : [user.role];
    return roles.includes('PRESIDENT') || user.role === 'ADMIN';
  }

  /**
   * President assigns an authorized role (ORGANIZER, TREASURER, VOLUNTEER) to a user.
   *
   * @param {Object} params
   * @param {number} params.actorId ID of requesting user (must be President)
   * @param {number} params.targetUserId ID of member being assigned role
   * @param {string} params.role Role to assign
   * @returns {Promise<Object>} Updated target user
   */
  static async assignRole({ actorId, targetUserId, role }) {
    if (Number(actorId) === Number(targetUserId)) {
      throw new ForbiddenError('Users cannot assign or revoke roles from themselves.');
    }

    const normalizedRole = (role || '').trim().toUpperCase();

    if (!DELEGABLE_ROLES.includes(normalizedRole)) {
      throw new AppError(
        `Cannot assign role '${role}'. Only [${DELEGABLE_ROLES.join(', ')}] can be assigned through role delegation.`,
        400,
        'INVALID_ROLE_ASSIGNMENT'
      );
    }

    const presidentAllowed = await this.isPresident(actorId);
    if (!presidentAllowed) {
      throw new ForbiddenError('Only the President can assign organization roles.');
    }


    const targetUser = await User.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new NotFoundError(`Target user ID ${targetUserId} not found.`);
    }

    const currentRoles = Array.isArray(targetUser.roles) && targetUser.roles.length > 0
      ? [...targetUser.roles]
      : ['STUDENT'];

    if (!currentRoles.includes('STUDENT')) {
      currentRoles.push('STUDENT');
    }

    if (!currentRoles.includes(normalizedRole)) {
      currentRoles.push(normalizedRole);
      targetUser.roles = currentRoles;
      await targetUser.save();

      await AuditLog.create({
        actorId,
        actorType: 'PRESIDENT',
        action: 'ROLE_ASSIGNED',
        targetType: 'USER',
        targetId: String(targetUser.id),
        details: `President ${actorId} assigned role ${normalizedRole} to user ${targetUser.id} (${targetUser.email})`,
      }).catch(() => {});
    }

    return targetUser;
  }

  /**
   * President revokes an assigned role (ORGANIZER, TREASURER, VOLUNTEER) from a user.
   * STUDENT role can never be revoked.
   *
   * @param {Object} params
   * @param {number} params.actorId ID of requesting user (must be President)
   * @param {number} params.targetUserId ID of member having role revoked
   * @param {string} params.role Role to revoke
   * @returns {Promise<Object>} Updated target user
   */
  static async revokeRole({ actorId, targetUserId, role }) {
    if (Number(actorId) === Number(targetUserId)) {
      throw new ForbiddenError('Users cannot assign or revoke roles from themselves.');
    }

    const normalizedRole = (role || '').trim().toUpperCase();

    if (normalizedRole === 'STUDENT') {
      throw new AppError('The STUDENT access role cannot be revoked from a registered account.', 400, 'CANNOT_REVOKE_STUDENT');
    }

    if (normalizedRole === 'PRESIDENT') {
      throw new AppError('President access cannot be revoked via delegation endpoints.', 400, 'CANNOT_REVOKE_PRESIDENT');
    }

    const presidentAllowed = await this.isPresident(actorId);
    if (!presidentAllowed) {
      throw new ForbiddenError('Only the President can revoke organization roles.');
    }

    const targetUser = await User.findOne({ id: targetUserId });
    if (!targetUser) {
      throw new NotFoundError(`Target user ID ${targetUserId} not found.`);
    }

    let currentRoles = Array.isArray(targetUser.roles) ? [...targetUser.roles] : ['STUDENT'];

    if (currentRoles.includes(normalizedRole)) {
      currentRoles = currentRoles.filter((r) => r !== normalizedRole);
      if (!currentRoles.includes('STUDENT')) {
        currentRoles.push('STUDENT');
      }
      targetUser.roles = currentRoles;
      await targetUser.save();

      await AuditLog.create({
        actorId,
        actorType: 'PRESIDENT',
        action: 'ROLE_REVOKED',
        targetType: 'USER',
        targetId: String(targetUser.id),
        details: `President ${actorId} revoked role ${normalizedRole} from user ${targetUser.id} (${targetUser.email})`,
      }).catch(() => {});
    }

    return targetUser;
  }

  /**
   * Retrieves authoritative active roles for a user.
   *
   * @param {number} userId
   * @returns {Promise<string[]>}
   */
  static async getUserRoles(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) return ['STUDENT'];
    return Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : ['STUDENT'];
  }
}

export default RoleAssignmentService;
