import { Router } from 'express';
import { AttendanceController } from '../controllers/attendance.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  attendanceScanSchema,
  scannerRelaySchema,
} from '../validators/attendance.validator.js';

const router = Router();

// ── User Check-in Status ───────────────────────────────────────────────────
router.get(
  '/attendance/bookings/:bookingId',
  authenticateToken,
  requireRole('USER', 'ADMIN'),
  asyncHandler(AttendanceController.bookingAttendance)
);

// ── Organizer Attendance Operations ─────────────────────────────────────────
router.post(
  '/attendance/scan',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  validateRequest({ body: attendanceScanSchema }),
  asyncHandler(AttendanceController.scan)
);

router.post(
  '/attendance/scan/:ticketId',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(AttendanceController.scanLegacy)
);

router.patch(
  '/attendance/events/:eventId/bookings/:bookingId/present',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(AttendanceController.markPresentManually)
);

router.get(
  '/attendance/events/:eventId',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(AttendanceController.eventAttendance)
);

router.get(
  '/attendance/events/:eventId/stats',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(AttendanceController.stats)
);

router.post(
  '/attendance/relay/:eventId/:sessionId',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  validateRequest({ body: scannerRelaySchema }),
  asyncHandler(AttendanceController.relay)
);

export default router;
