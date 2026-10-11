import { RoleAssignmentService } from '../services/roleAssignment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class RoleController {
  static async assignRole(req, res) {
    const targetUserId = req.body.targetUserId || req.body.userId;
    const { role } = req.body;
    const actorId = req.user.id;

    const updatedUser = await RoleAssignmentService.assignRole({
      actorId,
      targetUserId: Number(targetUserId),
      role,
    });


    return ApiResponse.success(
      res,
      {
        userId: updatedUser.id,
        memberNumber: updatedUser.memberNumber,
        roles: updatedUser.roles,
      },
      `Role ${role} successfully assigned to user ${targetUserId}`
    );
  }

  static async revokeRole(req, res) {
    const targetUserId = req.body.targetUserId || req.body.userId;
    const { role } = req.body;
    const actorId = req.user.id;

    const updatedUser = await RoleAssignmentService.revokeRole({
      actorId,
      targetUserId: Number(targetUserId),
      role,
    });

    return ApiResponse.success(
      res,
      {
        userId: updatedUser.id,
        memberNumber: updatedUser.memberNumber,
        roles: updatedUser.roles,
      },
      `Role ${role} successfully revoked from user ${targetUserId}`
    );
  }

  static async getUserRoles(req, res) {
    const { userId } = req.params;
    const roles = await RoleAssignmentService.getUserRoles(Number(userId));
    return ApiResponse.success(res, { userId: Number(userId), roles }, 'User roles retrieved');
  }

  static async getMyRoles(req, res) {
    const roles = await RoleAssignmentService.getUserRoles(req.user.id);
    return ApiResponse.success(res, { userId: req.user.id, roles }, 'My roles retrieved');
  }
}

export default RoleController;
