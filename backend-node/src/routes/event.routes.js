import { Router } from 'express';
import { EventController } from '../controllers/event.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateRequest } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createEventSchema,
  updateEventSchema,
  eventAnnouncementSchema,
} from '../validators/event.validator.js';

const router = Router();

// ── Public Discovery Endpoints ──────────────────────────────────────────────
router.get('/events', asyncHandler(EventController.searchEvents));
router.get('/events/featured', asyncHandler(EventController.getFeatured));
router.get('/events/categories', asyncHandler(EventController.getCategories));
router.get('/events/upcoming', asyncHandler(EventController.getUpcoming));
router.get('/events/completed', asyncHandler(EventController.getCompleted));
router.get('/events/expired', asyncHandler(EventController.getExpired));

// ── Organizer Event Management ─────────────────────────────────────────────
router.get(
  '/events/my',
  authenticateToken,
  requireRole('ORGANIZER'),
  asyncHandler(EventController.myEvents)
);

router.post(
  '/events',
  authenticateToken,
  requireRole('ORGANIZER'),
  validateRequest({ body: createEventSchema }),
  asyncHandler(EventController.createEvent)
);

router.put(
  '/events/:id',
  authenticateToken,
  requireRole('ORGANIZER'),
  validateRequest({ body: updateEventSchema }),
  asyncHandler(EventController.updateEvent)
);

router.delete(
  '/events/:id',
  authenticateToken,
  requireRole('ORGANIZER'),
  asyncHandler(EventController.deleteEvent)
);

router.patch(
  '/events/:id/cancel',
  authenticateToken,
  requireRole('ORGANIZER'),
  asyncHandler(EventController.cancelEvent)
);

router.patch(
  '/events/:id/publish',
  authenticateToken,
  requireRole('ORGANIZER'),
  asyncHandler(EventController.publishEvent)
);

router.get(
  '/events/:id/attendance',
  authenticateToken,
  requireRole('ORGANIZER'),
  asyncHandler(EventController.eventAttendance)
);

router.get(
  '/events/:id/attendance/stats',
  authenticateToken,
  requireRole('ORGANIZER'),
  asyncHandler(EventController.attendanceStats)
);

// ── Lifecycle Transitions ─────────────────────────────────────────────────
router.post(
  '/events/:id/complete',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  asyncHandler(EventController.forceComplete)
);

router.post(
  '/events/:id/expire',
  authenticateToken,
  requireRole('ADMIN'),
  asyncHandler(EventController.forceExpire)
);

// ── Event Asset Uploads ───────────────────────────────────────────────────
import { createUploader } from '../utils/upload.js';

const bannerUploader = createUploader('banners');
const documentUploader = createUploader('documents');

router.post(
  '/events/:id/banner',
  authenticateToken,
  requireRole('ORGANIZER'),
  bannerUploader.single('file'),
  asyncHandler(EventController.uploadBanner)
);

router.post(
  '/events/:id/authorized-document',
  authenticateToken,
  requireRole('ORGANIZER'),
  documentUploader.single('file'),
  asyncHandler(EventController.uploadAuthorizedDocument)
);

router.post(
  '/events/:id/announcements',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  validateRequest({ body: eventAnnouncementSchema }),
  asyncHandler(EventController.publishAnnouncement)
);

// ── Public / Viewer-Aware Single Event ─────────────────────────────────────
router.get('/events/:id', asyncHandler(EventController.getEvent));

export default router;
