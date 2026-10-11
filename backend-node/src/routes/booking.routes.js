import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createBookingSchema,
  cancelBookingSchema,
} from '../validators/booking.validator.js';

const router = Router();

// All booking routes require user authentication
router.use('/bookings', authenticateToken, requireRole('USER', 'ADMIN'));

router.post(
  '/bookings',
  validateRequest({ body: createBookingSchema }),
  asyncHandler(BookingController.bookTickets)
);

router.get('/bookings', asyncHandler(BookingController.myBookings));

router.get('/bookings/ticket/:ticketId', asyncHandler(BookingController.getByTicketId));

router.get('/bookings/:id/attendance', asyncHandler(BookingController.getBookingAttendance));

router.get('/bookings/:id', asyncHandler(BookingController.getBooking));

router.patch(
  '/bookings/:id/cancel',
  validateRequest({ body: cancelBookingSchema.optional() }),
  asyncHandler(BookingController.cancelBooking)
);

export default router;
