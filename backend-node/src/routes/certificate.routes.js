import { Router } from 'express';
import { CertificateController } from '../controllers/certificate.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const router = Router();

// 1. Public certificate verification
router.get('/certificates/verify/:certificateId', CertificateController.verify);

// 2. Authenticated download (owner / organizer / admin)
router.get(
  '/certificates/download/:certificateId',
  authenticateToken,
  requireRole(['USER', 'ORGANIZER', 'ADMIN']),
  CertificateController.download
);

// 3. User certificates
router.get('/certificates/my', authenticateToken, requireRole('USER'), CertificateController.myCertificates);

// 4. Organizer endpoints
router.get(
  '/certificates/events/:eventId',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.eventCertificates
);
router.get(
  '/certificates/events/:eventId/participants',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.participants
);
router.post(
  '/certificates/events/:eventId/generate',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.generate
);
router.post(
  '/certificates/events/:eventId/generate-missing',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.generateMissing
);
router.post(
  '/certificates/events/:eventId/generate-selected',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.generateSelected
);
router.post(
  '/certificates/events/:eventId/release',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.release
);
router.patch(
  '/certificates/:certificateId/revoke',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.revoke
);
router.post(
  '/certificates/:certificateId/email',
  authenticateToken,
  requireRole('ORGANIZER'),
  CertificateController.resendEmail
);

import { createUploader } from '../utils/upload.js';
const templateUploader = createUploader('templates');
const signatureUploader = createUploader('signatures');

router.post(
  '/certificates/events/:eventId/template',
  authenticateToken,
  requireRole('ORGANIZER'),
  templateUploader.single('file'),
  CertificateController.uploadTemplate
);

router.post(
  '/certificates/events/:eventId/signature',
  authenticateToken,
  requireRole('ORGANIZER'),
  signatureUploader.single('file'),
  CertificateController.uploadSignature
);

// 5. Admin endpoints
router.get('/certificates/admin', authenticateToken, requireRole('ADMIN'), CertificateController.adminSearch);
router.get('/certificates/admin/stats', authenticateToken, requireRole('ADMIN'), CertificateController.adminStats);
router.delete(
  '/certificates/admin/:certificateId',
  authenticateToken,
  requireRole('ADMIN'),
  CertificateController.adminDelete
);

export default router;
