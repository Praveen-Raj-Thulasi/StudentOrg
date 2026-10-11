import { OrganizationAnnouncementService } from '../services/organizationAnnouncement.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class OrganizationAnnouncementController {
  static async list(req, res, next) {
    try {
      return ApiResponse.success(res, await OrganizationAnnouncementService.list(req.query));
    } catch (err) {
      next(err);
    }
  }

  static async publish(req, res, next) {
    try {
      const announcement = await OrganizationAnnouncementService.publish(req.user.id, req.body || {});
      return ApiResponse.created(res, announcement, `Announcement delivered to ${announcement.recipientCount} active members`);
    } catch (err) {
      next(err);
    }
  }
}

export default OrganizationAnnouncementController;
