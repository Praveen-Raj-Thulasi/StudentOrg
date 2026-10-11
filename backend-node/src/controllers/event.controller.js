import { EventService } from '../services/event.service.js';
import { AttendanceService } from '../services/attendance.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const EVENT_CATEGORIES = [
  'HACKATHON',
  'TECHNICAL_SYMPOSIUM',
  'CODING_COMPETITION',
  'WORKSHOP',
  'SEMINAR',
  'PROJECT_EXHIBITION',
  'PLACEMENT_PREP',
  'TECHNICAL_TRAINING',
  'CULTURAL',
  'SPORTS',
  'CLUB_ACTIVITY',
  'DEPARTMENT_FUNCTION',
  'INTER_COLLEGE',
  'INTRA_COLLEGE',
  'OTHER',
];

export class EventController {
  static async searchEvents(req, res) {
    const result = await EventService.searchEvents(req.query);
    return ApiResponse.success(res, result);
  }

  static async getFeatured(req, res) {
    const result = await EventService.getFeaturedEvents();
    return ApiResponse.success(res, result);
  }

  static async getCategories(req, res) {
    return ApiResponse.success(res, EVENT_CATEGORIES);
  }

  static async getUpcoming(req, res) {
    const result = await EventService.searchEvents({
      ...req.query,
      sortBy: 'date_asc',
    });
    return ApiResponse.success(res, result);
  }

  static async getCompleted(req, res) {
    const result = await EventService.getEventsByStatus(['COMPLETED']);
    return ApiResponse.success(res, result);
  }

  static async getExpired(req, res) {
    const result = await EventService.getEventsByStatus(['EXPIRED']);
    return ApiResponse.success(res, result);
  }

  static async getEvent(req, res) {
    const viewerId = req.user?.id || null;
    const role = req.user?.role || null;
    const result = await EventService.getEventForViewer(req.params.id, viewerId, role);
    return ApiResponse.success(res, result);
  }

  static async createEvent(req, res) {
    const result = await EventService.createEvent(req.user.id, req.body);
    return ApiResponse.success(res, result, 'Event created successfully', 201);
  }

  static async updateEvent(req, res) {
    const result = await EventService.updateEvent(req.params.id, req.user.id, req.body);
    return ApiResponse.success(res, result, 'Event updated');
  }

  static async deleteEvent(req, res) {
    await EventService.deleteEvent(req.params.id, req.user.id);
    return ApiResponse.success(res, null, 'Event deleted');
  }

  static async cancelEvent(req, res) {
    const result = await EventService.cancelEvent(req.params.id, req.user.id);
    return ApiResponse.success(res, result, 'Event cancelled');
  }

  static async publishEvent(req, res) {
    const result = await EventService.publishEvent(req.params.id, req.user.id);
    return ApiResponse.success(res, result, 'Event published');
  }

  static async myEvents(req, res) {
    const { status, page, size } = req.query;
    const result = await EventService.getOrganizerEvents(req.user.id, status, page, size);
    return ApiResponse.success(res, result);
  }

  static async forceExpire(req, res) {
    const result = await EventService.forceExpireEvent(req.params.id, req.user.id);
    return ApiResponse.success(res, result, 'Event expired');
  }

  static async forceComplete(req, res) {
    const result = await EventService.forceCompleteEvent(req.params.id, req.user.id);
    return ApiResponse.success(res, result, 'Event completed');
  }

  static async eventAttendance(req, res) {
    const result = await AttendanceService.getEventAttendance(req.user.id, req.params.id);
    return ApiResponse.success(res, result);
  }

  static async attendanceStats(req, res) {
    const result = await AttendanceService.getEventAttendanceStats(req.user.id, req.params.id);
    return ApiResponse.success(res, result);
  }

  static async uploadBanner(req, res) {
    if (!req.file) {
      return ApiResponse.error(res, { message: 'No file uploaded', statusCode: 400 });
    }
    const bannerUrl = `/uploads/banners/${req.file.filename}`;
    const result = await EventService.uploadBanner(req.params.id, req.user.id, bannerUrl);
    return ApiResponse.success(res, result, 'Banner uploaded');
  }

  static async uploadAuthorizedDocument(req, res) {
    if (!req.file) {
      return ApiResponse.error(res, { message: 'No file uploaded', statusCode: 400 });
    }
    const docUrl = `/uploads/documents/${req.file.filename}`;
    const result = await EventService.uploadAuthorizedDocument(req.params.id, req.user.id, docUrl);
    return ApiResponse.success(res, result, 'Document uploaded');
  }

  static async publishAnnouncement(req, res) {
    const result = await EventService.publishAnnouncement(req.params.id, req.user.id, req.body);
    return ApiResponse.success(res, result, 'Announcement published and broadcast successfully');
  }
}

export default EventController;
