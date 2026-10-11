import { BookingService } from '../services/booking.service.js';
import { AttendanceService } from '../services/attendance.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class BookingController {
  static async bookTickets(req, res) {
    const booking = await BookingService.bookTickets(req.user.id, req.body);
    return ApiResponse.success(res, booking, 'Booking confirmed!', 201);
  }

  static async myBookings(req, res) {
    const { page, size } = req.query;
    const result = await BookingService.getUserBookings(req.user.id, page, size);
    return ApiResponse.success(res, result);
  }

  static async getBooking(req, res) {
    const booking = await BookingService.getBookingById(req.params.id, req.user.id);
    return ApiResponse.success(res, booking);
  }

  static async getByTicketId(req, res) {
    const booking = await BookingService.getByTicketId(req.params.ticketId, req.user.id);
    return ApiResponse.success(res, booking);
  }

  static async getBookingAttendance(req, res) {
    const attendance = await AttendanceService.getBookingAttendance(req.user.id, req.params.id);
    return ApiResponse.success(res, attendance);
  }

  static async cancelBooking(req, res) {
    const reason = req.query.reason || req.body?.reason || 'User requested cancellation';
    const result = await BookingService.cancelBooking(req.params.id, req.user.id, reason);
    return ApiResponse.success(res, result, 'Booking cancelled');
  }
}

export default BookingController;
