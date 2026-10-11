import { userService } from '../services/user.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class UserController {
  static async getProfile(req, res) {
    const profile = await userService.getProfile(req.user.id);
    return ApiResponse.success(res, profile, 'User profile retrieved');
  }

  static async updateProfile(req, res) {
    const profile = await userService.updateProfile(req.user.id, req.body);
    return ApiResponse.success(res, profile, 'Profile updated');
  }

  static async getLocation(req, res) {
    const location = await userService.getLocation(req.user.id);
    return ApiResponse.success(res, location, 'User location retrieved');
  }

  static async updateLocation(req, res) {
    const location = await userService.updateLocation(req.user.id, req.body);
    return ApiResponse.success(res, location, 'Location updated');
  }

  static async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    await userService.changePassword(req.user.id, currentPassword, newPassword);
    return ApiResponse.success(res, null, 'Password changed successfully');
  }

  static async uploadPicture(req, res) {
    if (!req.file) {
      return ApiResponse.error(res, { message: 'No file uploaded', statusCode: 400 });
    }
    const pictureUrl = `/uploads/profiles/${req.file.filename}`;
    const result = await userService.uploadPicture(req.user.id, pictureUrl);
    return ApiResponse.success(res, result, 'Profile picture updated');
  }
}

export default UserController;
