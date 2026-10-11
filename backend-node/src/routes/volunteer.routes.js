import { Router } from 'express';
import { VolunteerController } from '../controllers/volunteer.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createUploader } from '../utils/upload.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();
const receiptUpload = createUploader('reimbursements', { imageOnly: true }).single('receipt');
const handleReceiptUpload = (req, res, next) => receiptUpload(req, res, (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return next(new BadRequestError('Receipt images must be 8 MB or smaller.', 'RECEIPT_TOO_LARGE'));
  }
  if (err) return next(err);
  next();
});

// Volunteer overview and dashboard summary
router.get(
  '/volunteer/overview',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getOverview)
);

// Volunteer profile and availability management
router.get(
  '/volunteer/profile',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getProfile)
);

router.put(
  '/volunteer/profile',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.updateProfile)
);

// Volunteer task retrieval and updates (strictly volunteer-owned)
router.get(
  '/volunteer/tasks',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getMyTasks)
);

router.get(
  '/volunteer/tasks/:id',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getTaskById)
);

router.patch(
  '/volunteer/tasks/:id/status',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.updateTaskStatus)
);

router.post(
  '/volunteer/tasks/:id/status',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.updateTaskStatus)
);

// Opportunities & Applications
router.get(
  '/volunteer/opportunities',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getOpportunities)
);

router.post(
  '/volunteer/opportunities/:eventId/apply',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.applyForOpportunity)
);

router.get(
  '/volunteer/my-applications',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getMyApplications)
);

router.post(
  '/volunteer/applications/:id/withdraw',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.withdrawApplication)
);

// Smart matching recommendations
router.get(
  '/volunteer/smart-matches',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getSmartMatches)
);

// Official verified contributions & attendance
router.get(
  '/volunteer/contributions',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getContributions)
);

// Digital ID & Safe QR pass
router.get(
  '/volunteer/digital-id',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getDigitalId)
);

// Personal expense reimbursements
router.get(
  '/volunteer/reimbursements',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.getReimbursements)
);

router.post(
  '/volunteer/reimbursements/receipt',
  authenticateToken,
  requireRole('VOLUNTEER'),
  handleReceiptUpload,
  asyncHandler(VolunteerController.uploadReimbursementReceipt)
);

router.post(
  '/volunteer/reimbursements',
  authenticateToken,
  requireRole('VOLUNTEER'),
  asyncHandler(VolunteerController.submitReimbursement)
);

// Task assignment (created by Organizers or Executives for volunteers)
router.post(
  '/volunteer/tasks',
  authenticateToken,
  requireRole('ORGANIZER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(VolunteerController.createTask)
);

// Organizer volunteer management routes
router.get(
  '/volunteer/organizer/tasks',
  authenticateToken,
  requireRole('ORGANIZER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(VolunteerController.getOrganizerTasks)
);

router.get(
  '/volunteer/organizer/volunteers',
  authenticateToken,
  requireRole('ORGANIZER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(VolunteerController.getAvailableVolunteers)
);

router.post(
  '/volunteer/organizer/tasks/:id/verify',
  authenticateToken,
  requireRole('ORGANIZER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(VolunteerController.verifyTaskCompletion)
);

router.get(
  '/volunteer/organizer/applications',
  authenticateToken,
  requireRole('ORGANIZER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(VolunteerController.getOrganizerApplications)
);

router.post(
  '/volunteer/organizer/applications/:id/review',
  authenticateToken,
  requireRole('ORGANIZER', 'PRESIDENT', 'ADMIN'),
  asyncHandler(VolunteerController.reviewApplication)
);

export default router;
