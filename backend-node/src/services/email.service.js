import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { EmailLog } from '../models/EmailLog.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    const isRealCredential =
      env.MAIL_USERNAME &&
      !env.MAIL_USERNAME.includes('placeholder') &&
      env.MAIL_PASSWORD &&
      !env.MAIL_PASSWORD.includes('placeholder') &&
      process.env.NODE_ENV !== 'test';

    if (isRealCredential) {
      try {
        this.transporter = nodemailer.createTransport({
          host: env.MAIL_HOST || 'smtp.gmail.com',
          port: env.MAIL_PORT || 587,
          secure: env.MAIL_PORT === 465,
          auth: {
            user: env.MAIL_USERNAME,
            pass: env.MAIL_PASSWORD,
          },
        });
        logger.info('[EmailService] SMTP transporter initialized');
      } catch (err) {
        logger.warn({ err }, `[EmailService] Failed to initialize SMTP transporter: ${err.message}`);
      }
    } else {
      logger.info('[EmailService] SMTP operating in simulated/mock mode for test/development');
    }
  }

  /**
   * Generic sender with graceful failure recovery.
   */
  async sendMail({ to, subject, text, html, emailType = 'GENERAL' }) {
    logger.info({ to, subject, emailType }, `[EmailService] Dispatching email to ${to}`);
    let sent = false;
    let errorMessage = null;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"CollegeEvents" <${env.MAIL_USERNAME || 'no-reply@collegeevents.edu'}>`,
          to,
          subject,
          text,
          html,
        });
        sent = true;
      } catch (err) {
        errorMessage = err.message;
        logger.warn({ err, to }, `[EmailService] SMTP transport failed for ${to}: ${err.message}`);
      }
    } else {
      // In simulation mode without credentials, treat as sent log
      sent = true;
    }

    try {
      await EmailLog.create({
        recipient: to,
        subject,
        emailType,
        status: sent ? 'SENT' : 'FAILED',
        errorMessage,
      });
    } catch (logErr) {
      logger.error({ logErr }, `[EmailService] Failed to write EmailLog: ${logErr.message}`);
    }

    return sent;
  }

  /**
   * Dispatches an OTP verification email.
   */
  async sendOtpEmail(to, name, otp) {
    const subject = 'Your One-Time Password (OTP)';
    const text = `Hello ${name || 'User'},\n\nYour OTP verification code is: ${otp}\nThis code is valid for 10 minutes.\n\nBest regards,\nCollegeEvents Team`;
    return this.sendMail({ to, subject, text, emailType: 'OTP' });
  }

  /**
   * Dispatches a password reset link email.
   */
  async sendPasswordResetEmail(to, name, resetToken) {
    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = 'Reset Your Password';
    const text = `Hello ${name || 'User'},\n\nPlease reset your password using the following link:\n${resetLink}\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nCollegeEvents Team`;
    return this.sendMail({ to, subject, text, emailType: 'PASSWORD_RESET' });
  }

  /**
   * Dispatches an account email verification email.
   */
  async sendVerificationEmail(to, name, token, role = 'USER') {
    const verificationLink = `${env.FRONTEND_URL}/verify-email?token=${token}&role=${role}`;
    const subject = 'Verify Your Email Address';
    const text = `Hello ${name || 'User'},\n\nPlease verify your CollegeEvents account by clicking the link below:\n${verificationLink}\n\nBest regards,\nCollegeEvents Team`;
    return this.sendMail({ to, subject, text, emailType: 'VERIFICATION' });
  }

  /**
   * Dispatches booking confirmation email.
   */
  async sendBookingConfirmation(userEmail, userName, ticketId, quantity, totalAmt, eventName, eventDate, eventTime, venue) {
    const subject = `Booking Confirmed: ${eventName || 'College Event'}`;
    const text = `Dear ${userName || 'Attendee'},\n\n` +
      `Your booking for "${eventName}" has been confirmed!\n\n` +
      `Ticket ID: ${ticketId}\n` +
      `Seats Reserved: ${quantity}\n` +
      `Amount Paid: ₹${Number(totalAmt).toFixed(2)}\n` +
      `Event Date: ${eventDate || 'N/A'}\n` +
      `Event Time: ${eventTime || 'N/A'}\n` +
      `Venue: ${venue || 'N/A'}\n\n` +
      `You can view your QR ticket and booking details anytime on your CollegeEvents dashboard.\n\n` +
      `Best regards,\nCollegeEvents Team`;

    return this.sendMail({ to: userEmail, subject, text, emailType: 'BOOKING_CONFIRMATION' });
  }

  /**
   * Dispatches certificate readiness notification email.
   */
  async sendCertificateEmail(userEmail, recipientName, certificateId, verificationUrl, eventName) {
    const subject = `Your Certificate for ${eventName} is Ready`;
    const text = `Dear ${recipientName},\n\n` +
      `Congratulations! Your certificate of participation for "${eventName}" is ready.\n\n` +
      `Certificate ID: ${certificateId}\n` +
      `Verification Link: ${verificationUrl}\n` +
      `Download Link: ${env.APP_BASE_URL}/api/certificates/download/${certificateId}\n\n` +
      `Best regards,\nCollegeEvents Team`;

    return this.sendMail({ to: userEmail, subject, text, emailType: 'CERTIFICATE' });
  }

  /**
   * Simple generic email sender helper.
   */
  async sendSimpleEmail(to, subject, body) {
    return this.sendMail({ to, subject, text: body, emailType: 'GENERAL' });
  }
}

export const emailService = new EmailService();
export default emailService;
