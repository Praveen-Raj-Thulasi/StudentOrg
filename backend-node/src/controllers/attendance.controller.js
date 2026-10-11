import { AttendanceService } from '../services/attendance.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';

export class AttendanceController {
  static async scan(req, res, next) {
    try {
      const result = await AttendanceService.scanTicket(req.user.id, req.body);
      if (result.alreadyRecorded) {
        return ApiResponse.success(res, result.data, 'Attendance already recorded.', 409);
      }
      return ApiResponse.success(res, result.data, 'Attendance recorded successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async markPresentManually(req, res) {
    const result = await AttendanceService.markPresentManually(
      req.user.id,
      req.params.eventId,
      req.params.bookingId
    );
    if (result.alreadyRecorded) {
      return ApiResponse.success(res, result.data, 'Attendance already recorded.', 409);
    }
    return ApiResponse.success(
      res,
      result.data,
      'Participant marked present. Feedback and certificate are now enabled.'
    );
  }

  static async scanLegacy(req, res) {
    const eventId = Number(req.query.eventId);
    if (!eventId) throw new BadRequestError('eventId query parameter is required');
    const result = await AttendanceService.scanTicket(req.user.id, {
      eventId,
      ticketId: req.params.ticketId,
    });
    if (result.alreadyRecorded) {
      return ApiResponse.success(res, result.data, 'Attendance already recorded.', 409);
    }
    return ApiResponse.success(res, result.data, 'Attendance recorded successfully.');
  }

  static async eventAttendance(req, res) {
    const result = await AttendanceService.getEventAttendance(req.user.id, req.params.eventId);
    return ApiResponse.success(res, result);
  }

  static async stats(req, res) {
    const result = await AttendanceService.getEventAttendanceStats(req.user.id, req.params.eventId);
    return ApiResponse.success(res, result);
  }

  static async bookingAttendance(req, res) {
    const result = await AttendanceService.getBookingAttendance(req.user.id, req.params.bookingId);
    return ApiResponse.success(res, result);
  }

  static async relay(req, res) {
    const { eventId, sessionId } = req.params;
    const { ticketId, device } = req.body || {};
    if (!ticketId || !ticketId.trim()) {
      throw new BadRequestError('ticketId is required');
    }
    if (!sessionId || !sessionId.trim()) {
      throw new BadRequestError('sessionId is required');
    }

    const numEventId = Number(eventId);
    if (!numEventId) {
      throw new BadRequestError('Valid eventId is required');
    }

    // Validate event exists and check organizer ownership
    const { Event } = await import('../models/index.js');
    const event = await Event.findOne({ id: numEventId });
    if (!event) {
      throw new BadRequestError('Event not found');
    }

    if (req.user.role !== 'ADMIN') {
      const orgId = event.organizerId;
      if (Number(orgId) !== Number(req.user.id)) {
        throw new ForbiddenError('Unauthorized: Only the event organizer can relay scans for this event');
      }
    }

    // Broadcast across both Socket.IO and STOMP
    const { realtimeBroker } = await import('../sockets/realtimeBroker.js');
    realtimeBroker.broadcastScannerRelay(numEventId, sessionId.trim(), {
      ticketId: ticketId.trim(),
      device: device || 'External Scanner',
      eventId: numEventId,
    });

    return ApiResponse.success(res, null);
  }
}

export default AttendanceController;
