import mongoose from 'mongoose';
import { Attendance, Booking, Event, Payment, Membership } from '../models/index.js';
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from '../utils/errors.js';

export class AttendanceService {
  /**
   * Transforms booking and attendance records into the standardized AttendanceResponse shape.
   */
  static toAttendanceResponse(booking, message = null) {
    if (!booking) return null;
    const doc = booking.toObject ? booking.toObject() : booking;

    const eventDoc = doc.event && typeof doc.event === 'object' ? doc.event : null;
    const userDoc = doc.user && typeof doc.user === 'object' ? doc.user : null;
    const participant = (doc.participants && doc.participants.length > 0) ? doc.participants[0] : null;

    return {
      bookingId: doc.id,
      ticketId: doc.ticketId,
      eventId: eventDoc ? eventDoc.id : doc.eventId,
      eventName: eventDoc ? eventDoc.eventName : null,
      userId: userDoc ? userDoc.id : doc.userId,
      participantName: participant ? participant.name : (userDoc ? userDoc.name : null),
      participantEmail: participant ? participant.email : (userDoc ? userDoc.email : null),
      attendanceStatus: doc.attendanceStatus,
      checkInTime: doc.checkInTime,
      checkedInAt: doc.checkInTime,
      checkedInBy: doc.checkedInBy,
      verifiedBy: doc.checkedInBy,
      certificateEligible: Boolean(doc.certificateEligible),
      message: message || null,
    };
  }

  static async membershipSnapshot(userId) {
    const now = new Date();
    const membership = await Membership.findOne({
      userId: Number(userId),
      status: 'ACTIVE',
      $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
    }).sort({ validUntil: -1 }).select('memberNumber validUntil').lean();
    return {
      isActiveMember: Boolean(membership),
      memberNumber: membership?.memberNumber || null,
      membershipValidUntil: membership?.validUntil || null,
    };
  }

  /**
   * Internal validation of scan eligibility.
   */
  static async validateScan(booking, eventId, organizerId) {
    let event = null;
    if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
      event = await Event.findById(eventId);
    } else if (!isNaN(Number(eventId))) {
      event = await Event.findOne({ id: Number(eventId) });
    }
    if (!event) {
      throw new BadRequestError('Invalid ticket: Does not belong to this event.');
    }
    if (event.organizerId !== Number(organizerId) && String(event.organizer) !== String(organizerId)) {
      throw new ForbiddenError('Invalid ticket: Unauthorized scanner for this event.');
    }

    const bookingEventId = booking.eventId || (booking.event && booking.event.id);
    const bookingEventRef = booking.event && booking.event._id ? booking.event._id : booking.event;
    const matches =
      (bookingEventId && bookingEventId === event.id) ||
      (bookingEventRef && String(bookingEventRef) === String(event._id));
    if (!matches) {
      throw new BadRequestError('Invalid ticket: Does not belong to this event.');
    }

    if (booking.bookingStatus !== 'CONFIRMED') {
      throw new BadRequestError('Invalid ticket: Booking is not confirmed.');
    }

    if (booking.ticketStatus === 'CANCELLED') {
      throw new BadRequestError('Invalid ticket: Ticket has been cancelled.');
    }

    // Payment validation: paid events require a SUCCESSFUL payment
    if (event.ticketPrice > 0) {
      const successfulPayment = await Payment.findOne({
        $or: [{ bookingId: booking.id }, { booking: booking._id }],
        paymentStatus: { $in: ['SUCCESSFUL', 'SUCCESS'] },
      });
      if (!successfulPayment) {
        throw new BadRequestError('Invalid ticket: Payment was not completed.');
      }
    }

    return event;
  }

  /**
   * Check in an attendee via QR camera, barcode scanner, or manual lookup.
   * Returns { alreadyRecorded: true/false, data }
   */
  static async scanTicket(organizerId, { eventId, ticketId, scanMethod = 'MANUAL' }) {
    const cleanTicketId = (ticketId || '').trim();
    const booking = await Booking.findOne({ ticketId: cleanTicketId })
      .populate('event')
      .populate('user');

    if (!booking) {
      throw new NotFoundError('Invalid ticket.');
    }

    await AttendanceService.validateScan(booking, eventId, organizerId);

    // Duplicate check: if already PRESENT or already exists in Attendance collection
    const existingAttendance = await Attendance.findOne({ ticketId: cleanTicketId });
    if (booking.attendanceStatus === 'PRESENT' || existingAttendance) {
      const data = AttendanceService.toAttendanceResponse(booking, 'Attendance already recorded.');
      return {
        alreadyRecorded: true,
        data: { ...data, ...(await AttendanceService.membershipSnapshot(booking.userId)) },
      };
    }

    const now = new Date();
    const attendance = new Attendance({
      ticketId: cleanTicketId,
      bookingId: booking.id,
      booking: booking._id,
      eventId: booking.eventId,
      event: booking.event?._id,
      checkedInAt: now,
      scannedByOrganizerId: organizerId,
      scanMethod: scanMethod.toUpperCase(),
    });
    await attendance.save();

    booking.attendanceStatus = 'PRESENT';
    booking.checkInTime = now;
    booking.checkedInBy = organizerId;
    booking.certificateEligible = true;
    booking.ticketStatus = 'EXPIRED';
    booking.expiredAt = now;
    await booking.save();

    const data = AttendanceService.toAttendanceResponse(booking, 'Attendance recorded successfully.');
    return {
      alreadyRecorded: false,
      data: { ...data, ...(await AttendanceService.membershipSnapshot(booking.userId)) },
    };
  }

  /**
   * Manual check-in by organizer from dashboard.
   */
  static async markPresentManually(organizerId, eventId, bookingId) {
    const booking = await Booking.findOne({ id: Number(bookingId) })
      .populate('event')
      .populate('user');

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    await AttendanceService.validateScan(booking, eventId, organizerId);

    const existingAttendance = await Attendance.findOne({ ticketId: booking.ticketId });
    if (booking.attendanceStatus === 'PRESENT' || existingAttendance) {
      const data = AttendanceService.toAttendanceResponse(booking, 'Attendance already recorded.');
      return {
        alreadyRecorded: true,
        data: { ...data, ...(await AttendanceService.membershipSnapshot(booking.userId)) },
      };
    }

    const now = new Date();
    const attendance = new Attendance({
      ticketId: booking.ticketId,
      bookingId: booking.id,
      booking: booking._id,
      eventId: booking.eventId,
      event: booking.event?._id,
      checkedInAt: now,
      scannedByOrganizerId: organizerId,
      scanMethod: 'MANUAL',
    });
    await attendance.save();

    booking.attendanceStatus = 'PRESENT';
    booking.checkInTime = now;
    booking.checkedInBy = organizerId;
    booking.certificateEligible = true;
    booking.ticketStatus = 'EXPIRED';
    booking.expiredAt = now;
    await booking.save();

    const data = AttendanceService.toAttendanceResponse(booking, 'Participant marked present.');
    return {
      alreadyRecorded: false,
      data: { ...data, ...(await AttendanceService.membershipSnapshot(booking.userId)) },
    };
  }

  /**
   * Retrieve list of confirmed attendees and their attendance status for an event.
   */
  static async getEventAttendance(organizerId, eventId) {
    const numericEventId = Number(eventId);
    const event = await Event.findOne({ id: numericEventId });
    if (!event || event.organizerId !== organizerId) {
      throw new ForbiddenError('Unauthorized Access: You do not own this event');
    }

    const bookings = await Booking.find({
      eventId: numericEventId,
      bookingStatus: 'CONFIRMED',
    })
      .populate('event')
      .populate('user')
      .sort({ bookedAt: 1 });

    return bookings.map((b) => AttendanceService.toAttendanceResponse(b));
  }

  /**
   * Calculate live attendance statistics for an event.
   */
  static async getEventAttendanceStats(organizerId, eventId) {
    const numericEventId = Number(eventId);
    const event = await Event.findOne({ id: numericEventId });
    if (!event || event.organizerId !== organizerId) {
      throw new ForbiddenError('Unauthorized Access: You do not own this event');
    }

    const bookings = await Booking.find({
      eventId: numericEventId,
      bookingStatus: 'CONFIRMED',
    });

    const registered = bookings.length;
    const present = bookings.filter((b) => b.attendanceStatus === 'PRESENT').length;
    const absent = Math.max(0, registered - present);
    const percentage = registered === 0 ? 0.0 : Math.round((present * 10000.0) / registered) / 100.0;

    return {
      registeredParticipants: registered,
      checkedInParticipants: present,
      absentParticipants: absent,
      attendancePercentage: percentage,
      liveAttendanceCount: present,
    };
  }

  /**
   * Retrieve attendance detail for a user's booking.
   */
  static async getBookingAttendance(userId, bookingId) {
    const booking = await Booking.findOne({ id: Number(bookingId), userId })
      .populate('event')
      .populate('user');

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    return AttendanceService.toAttendanceResponse(booking);
  }
}

export default AttendanceService;
