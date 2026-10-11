import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Certificate } from '../models/Certificate.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { Attendance } from '../models/Attendance.js';
import { Payment } from '../models/Payment.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { generateQrCode, generateQrCodeBuffer } from '../utils/qrGenerator.js';
import { emailService } from './email.service.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';

class CertificateService {
  /**
   * Check eligibility of a booking for certificate generation.
   */
  async checkEligibility(event, booking) {
    if (booking.bookingStatus !== 'CONFIRMED') {
      return { eligible: false, reason: 'Registration is not completed' };
    }
    if (booking.ticketStatus === 'CANCELLED') {
      return { eligible: false, reason: 'Ticket is cancelled' };
    }
    if (event.status === 'CANCELLED') {
      return { eligible: false, reason: 'Event is cancelled' };
    }
    if (!this.isEventCompleted(event)) {
      return { eligible: false, reason: 'Event is not completed' };
    }

    // Check attendance status
    const isPresentOnBooking = booking.attendanceStatus === 'PRESENT';
    const attendanceRecord = await Attendance.findOne({
      bookingId: booking.id,
      status: 'PRESENT',
    });

    if (!isPresentOnBooking && !attendanceRecord) {
      return { eligible: false, reason: 'You were not marked present for this event.' };
    }

    // Paid check for non-free events
    if (event.ticketPrice && event.ticketPrice > 0) {
      const payment = await Payment.findOne({
        bookingId: booking.id,
        paymentStatus: 'SUCCESSFUL',
      });
      if (!payment) {
        return { eligible: false, reason: 'Payment is not successful' };
      }
    }

    return { eligible: true, reason: 'Eligible' };
  }

  isEventCompleted(event) {
    if (event.status === 'COMPLETED' || event.status === 'EXPIRED') return true;
    const end = event.endDate || event.eventDate;
    if (!end) return false;
    const eventEndDate = new Date(end);
    return eventEndDate.getTime() <= Date.now();
  }

  /**
   * Generate certificates for all eligible attendees of an event.
   */
  async generateCertificatesForEvent(eventId, organizerId, userIds = null) {
    const event = await this.getOwnedEvent(eventId, organizerId);
    if (event.status === 'CANCELLED') {
      throw new BadRequestError('Cancelled events cannot issue certificates');
    }
    if (!this.isEventCompleted(event)) {
      throw new BadRequestError('Certificates can be generated only after event completion');
    }

    const bookings = await Booking.find({
      eventId: Number(eventId),
      bookingStatus: 'CONFIRMED',
    }).populate('user');

    let generated = 0;
    const skipped = [];

    for (const booking of bookings) {
      const userId = booking.userId;
      if (userIds && !userIds.includes(userId)) continue;

      // Skip if already generated
      const existing = await Certificate.findOne({ eventId: Number(eventId), userId });
      if (existing) continue;

      const eligibility = await this.checkEligibility(event, booking);
      if (!eligibility.eligible) {
        skipped.push({ userId, reason: eligibility.reason });
        continue;
      }

      await this.createCertificateRecord(event, booking);
      generated++;
    }

    return { generated, skipped };
  }

  /**
   * Internal helper to create and save a new Certificate document.
   */
  async createCertificateRecord(event, booking) {
    const user = booking.user || {};
    const participant = (booking.participants && booking.participants.length > 0)
      ? booking.participants[0]
      : null;

    const certId = await this.generateCertificateId();
    const recipientName = (participant && participant.name && participant.name.trim())
      ? participant.name.trim()
      : (user.name || 'Participant');

    const collegeName = (participant && participant.college)
      ? participant.college
      : (user.organizationName || null);

    const departmentName = (participant && participant.department)
      ? participant.department
      : null;

    const verificationUrl = `${env.FRONTEND_URL}/verify-certificate/${certId}`;
    const qrCodeUrl = await generateQrCode(verificationUrl);

    const cert = new Certificate({
      certificateId: certId,
      eventId: event.id,
      event: event._id,
      userId: booking.userId,
      user: user._id,
      recipientName,
      collegeName,
      departmentName,
      eventName: event.eventName,
      participantId: user.userCode || String(booking.userId),
      participantEmail: user.email,
      certificateType: 'PARTICIPATION',
      organizerName: event.organizerName || 'Organizer',
      organizationName: event.collegeName || 'CollegeEvents',
      verificationUrl,
      qrCodeUrl,
      pdfUrl: `/api/certificates/download/${certId}`,
      issuedAt: new Date(),
      status: 'GENERATED',
    });

    return cert.save();
  }

  /**
   * Unique Certificate ID generator: CERT-YYYY-XXXXXX
   */
  async generateCertificateId() {
    const year = new Date().getFullYear();
    let count = await Certificate.countDocuments();
    let uniqueId;
    let exists = true;

    while (exists) {
      count++;
      uniqueId = `CERT-${year}-${String(count).padStart(6, '0')}`;
      const found = await Certificate.findOne({ certificateId: uniqueId });
      if (!found) exists = false;
    }

    return uniqueId;
  }

  /**
   * Get user's certificates (paginated with optional search query).
   */
  async getUserCertificates(userId, page = 0, size = 10, q = null) {
    const pageNum = Math.max(0, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(size, 10)));

    const filter = { userId: Number(userId) };
    if (q && q.trim()) {
      filter.eventName = { $regex: q.trim(), $options: 'i' };
    }

    const totalElements = await Certificate.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / pageSize) || 0;

    const content = await Certificate.find(filter)
      .populate('event')
      .sort({ issuedAt: -1 })
      .skip(pageNum * pageSize)
      .limit(pageSize);

    return {
      content,
      page: pageNum,
      size: pageSize,
      totalElements,
      totalPages,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
    };
  }

  /**
   * Public certificate verification by certificateId.
   */
  async getCertificateById(certificateId) {
    const cert = await Certificate.findOne({ certificateId: certificateId.trim() })
      .populate('event')
      .populate('user');

    if (!cert) {
      throw new NotFoundError(`Certificate not found: ${certificateId}`);
    }

    cert.verificationCount = (cert.verificationCount || 0) + 1;
    await cert.save();

    return cert;
  }

  /**
   * Organizer retrieval of all certificates for an event.
   */
  async getEventCertificates(eventId, organizerId) {
    await this.getOwnedEvent(eventId, organizerId);
    return Certificate.find({ eventId: Number(eventId) }).sort({ issuedAt: -1 });
  }

  /**
   * Organizer retrieval of participant eligibility rows.
   */
  async getEventParticipants(eventId, organizerId, q = null, department = null, college = null) {
    const event = await this.getOwnedEvent(eventId, organizerId);
    const bookings = await Booking.find({
      eventId: Number(eventId),
      bookingStatus: 'CONFIRMED',
    }).populate('user');

    const certificates = await Certificate.find({ eventId: Number(eventId) });
    const certMap = new Map(certificates.map((c) => [c.userId, c]));

    const rows = [];
    for (const booking of bookings) {
      const user = booking.user || {};
      const participant = (booking.participants && booking.participants.length > 0)
        ? booking.participants[0]
        : null;

      const eligibility = await this.checkEligibility(event, booking);
      const cert = certMap.get(booking.userId);

      const row = {
        userId: booking.userId,
        participantName: participant?.name || user.name || 'Participant',
        participantId: user.userCode || String(booking.userId),
        email: user.email || '',
        department: participant?.department || null,
        college: participant?.college || user.organizationName || null,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        certificateId: cert ? cert.certificateId : null,
        certificateStatus: cert ? cert.status : null,
      };

      // Filter matches
      if (q && q.trim()) {
        const query = q.trim().toLowerCase();
        const matchesName = row.participantName.toLowerCase().includes(query);
        const matchesEmail = row.email.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) continue;
      }
      if (department && department.trim() && row.department !== department.trim()) {
        continue;
      }
      if (college && college.trim() && row.college !== college.trim()) {
        continue;
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Release certificates to attendees and dispatch emails.
   */
  async releaseCertificates(eventId, organizerId) {
    const event = await this.getOwnedEvent(eventId, organizerId);
    const certificates = await Certificate.find({
      eventId: Number(eventId),
      status: { $ne: 'REVOKED' },
    }).populate('user');

    let released = 0;
    const now = new Date();

    for (const cert of certificates) {
      cert.status = 'RELEASED';
      cert.releasedAt = now;
      await cert.save();

      // Dispatch certificate ready email
      if (cert.user && cert.user.email) {
        try {
          await emailService.sendCertificateEmail(
            cert.user.email,
            cert.recipientName,
            cert.certificateId,
            cert.verificationUrl,
            event.eventName
          );
          cert.emailSent = true;
          cert.emailSentAt = now;
          cert.emailAttemptCount = (cert.emailAttemptCount || 0) + 1;
          await cert.save();
        } catch (err) {
          logger.warn({ err }, `[CertificateService] Failed email for ${cert.certificateId}`);
        }
      }
      released++;
    }

    return { released };
  }

  /**
   * Organizer revocation of a certificate.
   */
  async revokeCertificate(certificateId, organizerId, reason = null) {
    const cert = await Certificate.findOne({ certificateId: certificateId.trim() }).populate('event');
    if (!cert) throw new NotFoundError('Certificate not found');

    if (cert.event && cert.event.organizerId !== organizerId) {
      throw new ForbiddenError('Access denied: You do not own this event');
    }

    cert.status = 'REVOKED';
    cert.revokedAt = new Date();
    cert.revokeReason = reason || 'Revoked by organizer';
    return cert.save();
  }

  /**
   * Organizer resend email.
   */
  async resendEmail(certificateId, organizerId) {
    const cert = await Certificate.findOne({ certificateId: certificateId.trim() })
      .populate('event')
      .populate('user');
    if (!cert) throw new NotFoundError('Certificate not found');

    if (cert.event && cert.event.organizerId !== organizerId) {
      throw new ForbiddenError('Access denied');
    }

    if (cert.user && cert.user.email) {
      await emailService.sendCertificateEmail(
        cert.user.email,
        cert.recipientName,
        cert.certificateId,
        cert.verificationUrl,
        cert.eventName
      );
      cert.emailSent = true;
      cert.emailSentAt = new Date();
      cert.emailAttemptCount = (cert.emailAttemptCount || 0) + 1;
      await cert.save();
    }

    return cert;
  }

  /**
   * Secure PDF Download with ownership and revocation checks.
   */
  async downloadCertificatePdf(certificateId, userId, isPrivileged = false) {
    const cert = await Certificate.findOne({ certificateId: certificateId.trim() }).populate('event');
    if (!cert) throw new NotFoundError('Certificate not found');

    if (!isPrivileged && cert.userId !== userId) {
      throw new ForbiddenError('Access denied: You do not own this certificate');
    }

    if (cert.status === 'REVOKED') {
      throw new BadRequestError('Certificate has been revoked');
    }

    cert.downloadCount = (cert.downloadCount || 0) + 1;
    await cert.save();

    return this.generateCertificatePdfBytes(cert);
  }

  /**
   * Render in-memory certificate PDF using pdf-lib.
   */
  async generateCertificatePdfBytes(cert) {
    const pdfDoc = await PDFDocument.create();
    // Landscape A4 dimensions: 841.89 x 595.28 points
    const page = pdfDoc.addPage([841.89, 595.28]);
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Decorative double border
    page.drawRectangle({
      x: 20,
      y: 20,
      width: width - 40,
      height: height - 40,
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 3,
    });
    page.drawRectangle({
      x: 25,
      y: 25,
      width: width - 50,
      height: height - 50,
      borderColor: rgb(0.85, 0.65, 0.13), // Gold inner border
      borderWidth: 1.5,
    });

    // Header Title
    const title = 'COLLEGEEVENTS';
    const titleWidth = fontBold.widthOfTextAtSize(title, 16);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 70,
      size: 16,
      font: fontBold,
      color: rgb(0.2, 0.4, 0.8),
    });

    const certType = `CERTIFICATE OF ${(cert.certificateType || 'PARTICIPATION').toUpperCase()}`;
    const certTypeWidth = fontBold.widthOfTextAtSize(certType, 26);
    page.drawText(certType, {
      x: (width - certTypeWidth) / 2,
      y: height - 120,
      size: 26,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.2),
    });

    const subtitle = 'This certificate is proudly presented to';
    const subWidth = fontRegular.widthOfTextAtSize(subtitle, 14);
    page.drawText(subtitle, {
      x: (width - subWidth) / 2,
      y: height - 165,
      size: 14,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Recipient Name
    const recipient = cert.recipientName || 'Participant';
    const recipientWidth = fontBold.widthOfTextAtSize(recipient, 28);
    page.drawText(recipient, {
      x: (width - recipientWidth) / 2,
      y: height - 215,
      size: 28,
      font: fontBold,
      color: rgb(0.05, 0.2, 0.5),
    });

    const forPart = 'for successfully participating in';
    const forPartWidth = fontRegular.widthOfTextAtSize(forPart, 13);
    page.drawText(forPart, {
      x: (width - forPartWidth) / 2,
      y: height - 255,
      size: 13,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Event Name
    const eventName = cert.eventName || 'College Event';
    const eventWidth = fontBold.widthOfTextAtSize(eventName, 20);
    page.drawText(eventName, {
      x: (width - eventWidth) / 2,
      y: height - 295,
      size: 20,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.2),
    });

    if (cert.collegeName) {
      const collegeWidth = fontRegular.widthOfTextAtSize(cert.collegeName, 13);
      page.drawText(cert.collegeName, {
        x: (width - collegeWidth) / 2,
        y: height - 325,
        size: 13,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    // Embed QR Code in center bottom
    try {
      const qrTarget = cert.verificationUrl || `${env.FRONTEND_URL}/verify-certificate/${cert.certificateId}`;
      const qrBuffer = await generateQrCodeBuffer(qrTarget);
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      page.drawImage(qrImage, {
        x: (width - 80) / 2,
        y: 80,
        width: 80,
        height: 80,
      });

      const scanLabel = 'Scan to Verify';
      const scanWidth = fontRegular.widthOfTextAtSize(scanLabel, 9);
      page.drawText(scanLabel, {
        x: (width - scanWidth) / 2,
        y: 68,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
    } catch (qrErr) {
      logger.warn({ qrErr }, '[CertificateService] Could not embed QR in PDF');
    }

    // Left Footer Details
    const issueDateStr = cert.issuedAt ? cert.issuedAt.toISOString().split('T')[0] : 'N/A';
    page.drawText(`Certificate ID: ${cert.certificateId}`, {
      x: 60,
      y: 130,
      size: 10,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(`Issue Date: ${issueDateStr}`, {
      x: 60,
      y: 112,
      size: 10,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });

    // Right Footer Signatures
    const orgSignName = cert.organizerName || 'Authorized Organizer';
    const orgSignWidth = fontBold.widthOfTextAtSize(orgSignName, 12);
    page.drawText(orgSignName, {
      x: width - 60 - orgSignWidth,
      y: 130,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.2),
    });
    const organizationName = cert.organizationName || 'Organizer';
    const orgWidth = fontRegular.widthOfTextAtSize(organizationName, 10);
    page.drawText(organizationName, {
      x: width - 60 - orgWidth,
      y: 112,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Verification link text at very bottom
    const verifyNote = cert.verificationUrl || '';
    const verifyWidth = fontRegular.widthOfTextAtSize(verifyNote, 8);
    page.drawText(verifyNote, {
      x: (width - verifyWidth) / 2,
      y: 40,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ── Admin operations ───────────────────────────────────────────────────────

  async adminSearch(q = null, page = 0, size = 20) {
    const pageNum = Math.max(0, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(size, 10)));

    const filter = {};
    if (q && q.trim()) {
      const regex = { $regex: q.trim(), $options: 'i' };
      filter.$or = [
        { certificateId: regex },
        { recipientName: regex },
        { eventName: regex },
        { participantEmail: regex },
      ];
    }

    const totalElements = await Certificate.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / pageSize) || 0;

    const content = await Certificate.find(filter)
      .populate('event')
      .sort({ issuedAt: -1 })
      .skip(pageNum * pageSize)
      .limit(pageSize);

    return {
      content,
      page: pageNum,
      size: pageSize,
      totalElements,
      totalPages,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
    };
  }

  async adminStats() {
    const all = await Certificate.find({});
    const totalDownloaded = all.reduce((sum, c) => sum + (c.downloadCount || 0), 0);
    const totalVerified = all.reduce((sum, c) => sum + (c.verificationCount || 0), 0);
    const failedEmails = all.filter((c) => !c.emailSent && (c.emailAttemptCount || 0) > 0).length;

    return {
      certificatesGenerated: all.length,
      certificatesDownloaded: totalDownloaded,
      verificationRequests: totalVerified,
      failedEmails,
    };
  }

  async adminDeleteInvalid(certificateId) {
    const cert = await Certificate.findOne({ certificateId: certificateId.trim() });
    if (!cert) throw new NotFoundError('Certificate not found');

    cert.status = 'REVOKED';
    cert.revokeReason = 'Revoked by admin';
    cert.revokedAt = new Date();
    await cert.save();
    return cert;
  }

  async getOwnedEvent(eventId, organizerId) {
    const event = await Event.findOne({ id: Number(eventId) });
    if (!event) throw new NotFoundError('Event not found');
    if (event.organizerId !== organizerId) {
      throw new ForbiddenError('Access denied: You do not own this event');
    }
    return event;
  }

  async uploadCertificateTemplate(eventId, organizerId, templateUrl, signatureName = '') {
    await this.getOwnedEvent(eventId, organizerId);
    return templateUrl;
  }

  async uploadOrganizerSignature(eventId, organizerId, signatureUrl) {
    await this.getOwnedEvent(eventId, organizerId);
    return signatureUrl;
  }
}

export const certificateService = new CertificateService();
export default certificateService;
