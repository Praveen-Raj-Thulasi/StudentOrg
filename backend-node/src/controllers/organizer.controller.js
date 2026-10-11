import { organizerService } from '../services/organizer.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class OrganizerController {
  static async getProfile(req, res) {
    const profile = await organizerService.getProfile(req.user.id);
    return ApiResponse.success(res, profile, 'Organizer profile retrieved');
  }

  static async updateProfile(req, res) {
    const profile = await organizerService.updateProfile(req.user.id, req.body);
    return ApiResponse.success(res, profile, 'Profile updated');
  }

  static async getLocation(req, res) {
    const location = await organizerService.getLocation(req.user.id);
    return ApiResponse.success(res, location, 'Organizer location retrieved');
  }

  static async updateLocation(req, res) {
    const location = await organizerService.updateLocation(req.user.id, req.body);
    return ApiResponse.success(res, location, 'Location updated');
  }

  static async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    await organizerService.changePassword(req.user.id, currentPassword, newPassword);
    return ApiResponse.success(res, null, 'Password changed successfully');
  }

  static async uploadLogo(req, res) {
    if (!req.file) {
      return ApiResponse.error(res, { message: 'No file uploaded', statusCode: 400 });
    }
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    const result = await organizerService.uploadLogo(req.user.id, logoUrl);
    return ApiResponse.success(res, result, 'Logo updated');
  }
}

export default OrganizerController;
