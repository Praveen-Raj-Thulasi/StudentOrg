import { certificateService } from '../services/certificate.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { generateSelectedSchema, revokeCertificateSchema } from '../validators/certificate.validator.js';

export class CertificateController {
  /**
   * GET /api/certificates/my
   */
  static async myCertificates(req, res, next) {
    try {
      const page = req.query.page || 0;
      const size = req.query.size || 10;
      const q = req.query.q || null;
      const data = await certificateService.getUserCertificates(req.user.id, page, size, q);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/certificates/verify/:certificateId (public)
   */
  static async verify(req, res, next) {
    try {
      const { certificateId } = req.params;
      const data = await certificateService.getCertificateById(certificateId);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/certificates/download/:certificateId
   */
  static async download(req, res, next) {
    try {
      const { certificateId } = req.params;
      const isPrivileged = req.user.role === 'ADMIN' || req.user.role === 'ORGANIZER';
      const pdfBytes = await certificateService.downloadCertificatePdf(
        certificateId,
        req.user.id,
        isPrivileged
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="certificate-${certificateId}.pdf"`
      );
      res.setHeader('Content-Length', pdfBytes.length);
      return res.status(200).send(pdfBytes);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/certificates/events/:eventId
   */
  static async eventCertificates(req, res, next) {
    try {
      const { eventId } = req.params;
      const data = await certificateService.getEventCertificates(eventId, req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/certificates/events/:eventId/participants
   */
  static async participants(req, res, next) {
    try {
      const { eventId } = req.params;
      const { q, department, college } = req.query;
      const data = await certificateService.getEventParticipants(
        eventId,
        req.user.id,
        q,
        department,
        college
      );
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/certificates/events/:eventId/generate
   */
  static async generate(req, res, next) {
    try {
      const { eventId } = req.params;
      const data = await certificateService.generateCertificatesForEvent(eventId, req.user.id);
      return ApiResponse.success(res, data, 'Certificate generation completed');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/certificates/events/:eventId/generate-missing
   */
  static async generateMissing(req, res, next) {
    try {
      const { eventId } = req.params;
      const data = await certificateService.generateCertificatesForEvent(eventId, req.user.id);
      return ApiResponse.success(res, data, 'Missing certificates generated');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/certificates/events/:eventId/generate-selected
   */
  static async generateSelected(req, res, next) {
    try {
      const { eventId } = req.params;
      const validated = generateSelectedSchema.parse(req.body);
      const data = await certificateService.generateCertificatesForEvent(
        eventId,
        req.user.id,
        validated.userIds
      );
      return ApiResponse.success(res, data, 'Selected certificate generation completed');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/certificates/events/:eventId/release
   */
  static async release(req, res, next) {
    try {
      const { eventId } = req.params;
      const data = await certificateService.releaseCertificates(eventId, req.user.id);
      return ApiResponse.success(res, data, 'Certificates released');
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/certificates/:certificateId/revoke
   */
  static async revoke(req, res, next) {
    try {
      const { certificateId } = req.params;
      const validated = revokeCertificateSchema.parse(req.body || {});
      const data = await certificateService.revokeCertificate(
        certificateId,
        req.user.id,
        validated.reason
      );
      return ApiResponse.success(res, data, 'Certificate revoked');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/certificates/:certificateId/email
   */
  static async resendEmail(req, res, next) {
    try {
      const { certificateId } = req.params;
      const data = await certificateService.resendEmail(certificateId, req.user.id);
      return ApiResponse.success(res, data, 'Certificate email queued');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/certificates/admin
   */
  static async adminSearch(req, res, next) {
    try {
      const { q, page = 0, size = 20 } = req.query;
      const data = await certificateService.adminSearch(q, page, size);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/certificates/admin/stats
   */
  static async adminStats(req, res, next) {
    try {
      const data = await certificateService.adminStats();
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/certificates/admin/:certificateId
   */
  static async adminDelete(req, res, next) {
    try {
      const { certificateId } = req.params;
      await certificateService.adminDeleteInvalid(certificateId);
      return ApiResponse.success(res, 'OK', 'Certificate revoked');
    } catch (err) {
      next(err);
    }
  }

  static async uploadTemplate(req, res, next) {
    try {
      if (!req.file) {
        return ApiResponse.error(res, { message: 'No file uploaded', statusCode: 400 });
      }
      const templateUrl = `/uploads/templates/${req.file.filename}`;
      const result = await certificateService.uploadCertificateTemplate(
        req.params.eventId,
        req.user.id,
        templateUrl,
        req.query.signatureName
      );
      return ApiResponse.success(res, result, 'Certificate template uploaded');
    } catch (err) {
      next(err);
    }
  }

  static async uploadSignature(req, res, next) {
    try {
      if (!req.file) {
        return ApiResponse.error(res, { message: 'No file uploaded', statusCode: 400 });
      }
      const signatureUrl = `/uploads/signatures/${req.file.filename}`;
      const result = await certificateService.uploadOrganizerSignature(
        req.params.eventId,
        req.user.id,
        signatureUrl
      );
      return ApiResponse.success(res, result, 'Signature uploaded');
    } catch (err) {
      next(err);
    }
  }
}

export default CertificateController;
