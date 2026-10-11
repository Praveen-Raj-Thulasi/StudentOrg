import crypto from 'crypto';
import { Booking, Event, User, Payment, Refund, BookingQueueEntry, Membership } from '../models/index.js';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors.js';
import { generateTicketId } from '../utils/ticketGenerator.js';

export class BookingService {
  /**
   * Formats a Booking document to BookingResponse.
   */
  static toBookingResponse(booking) {
    if (!booking) return null;
    const doc = booking.toObject ? booking.toObject() : booking;

    const eventDoc = doc.event && typeof doc.event === 'object' ? doc.event : null;
    const userDoc = doc.user && typeof doc.user === 'object' ? doc.user : null;

    let eventInfo = null;
    if (eventDoc) {
      const eventDateStr = eventDoc.eventDate instanceof Date
        ? eventDoc.eventDate.toISOString().split('T')[0]
        : (eventDoc.eventDate ? String(eventDoc.eventDate).split('T')[0] : null);

      eventInfo = {
        id: eventDoc.id,
        eventName: eventDoc.eventName,
        category: eventDoc.category,
        status: eventDoc.status,
        eventDate: eventDateStr,
        eventTime: eventDoc.eventTime,
        location: eventDoc.location,
        venueName: eventDoc.venueName,
        eventBanner: eventDoc.eventBanner,
      };
    }

    let userInfo = null;
    if (userDoc) {
      userInfo = {
        id: userDoc.id,
        name: userDoc.name,
        email: userDoc.email,
      };
    }

    const isActionable = doc.ticketStatus === 'ACTIVE'
      && doc.bookingStatus !== 'CANCELLED'
      && doc.bookingStatus !== 'EXPIRED';

    const participantsList = (doc.participants || []).map((p) => ({
      id: p.id || p._id,
      name: p.name,
      email: p.email,
      department: p.department || null,
      college: p.college || null,
    }));

    return {
      id: doc.id,
      ticketId: doc.ticketId,
      quantity: doc.quantity,
      totalAmount: doc.totalAmount,
      ticketUnitPrice: doc.ticketUnitPrice ?? null,
      membershipPricingApplied: Boolean(doc.membershipPricingApplied),
      bookingStatus: doc.bookingStatus,
      ticketStatus: doc.ticketStatus,
      attendanceStatus: doc.attendanceStatus,
      checkInTime: doc.checkInTime,
      checkedInBy: doc.checkedInBy,
      certificateEligible: Boolean(doc.certificateEligible),
      certificateId: null,
      certificateStatus: null,
      qrCodePath: doc.qrCodePath,
      bookedAt: doc.bookedAt,
      cancelledAt: doc.cancelledAt,
      expiredAt: doc.expiredAt,
      cancellationReason: doc.cancellationReason,
      actionable: isActionable,
      participants: participantsList,
      event: eventInfo,
      user: userInfo,
    };
  }

  /**
   * Book tickets with atomic seat reservation, participant validation, and pending payment creation.
   */
  static async bookTickets(userId, request) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    const event = await Event.findOne({ id: request.eventId });
    if (!event) throw new NotFoundError('Event not found');

    // 1. Verify Event is bookable
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventDate = new Date(event.eventDate);
    if (eventDate < today) {
      throw new BadRequestError('Booking is not available for this event: Event date has passed');
    }
    if (event.registrationDeadline && new Date(event.registrationDeadline) < today) {
      throw new BadRequestError('Booking is not available for this event: Registration deadline has passed');
    }

    const openStatuses = ['PUBLISHED', 'UPCOMING', 'LIVE', 'ONGOING', 'APPROVED'];
    if (!openStatuses.includes(event.status)) {
      throw new BadRequestError(`Booking is not available for this event (status: ${event.status})`);
    }

    // 2. Prevent duplicate active bookings by the same user
    const existingBooking = await Booking.findOne({
      userId,
      eventId: event.id,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] },
    });
    if (existingBooking) {
      throw new ConflictError('You already have an active booking for this event');
    }

    // 3. Normalize & validate participants
    let participants = request.participants || [];
    if (!participants || participants.length === 0) {
      participants = [
        {
          name: user.name,
          email: user.email,
          department: null,
          college: user.organizationName || null,
        },
      ];
    }

    if (participants.length !== request.quantity) {
      throw new BadRequestError('Participant count must match booking quantity');
    }

    const emailsSet = new Set();
    for (const p of participants) {
      const email = (p.email || '').trim().toLowerCase();
      if (!email) throw new BadRequestError('Participant email is required');
      if (emailsSet.has(email)) {
        throw new ConflictError(`Duplicate participant email in this booking: ${email}`);
      }
      emailsSet.add(email);

      // Check if participant is already registered for this event in an active booking
      const duplicateParticipant = await Booking.findOne({
        eventId: event.id,
        bookingStatus: { $in: ['PENDING', 'CONFIRMED'] },
        'participants.email': email,
      });
      if (duplicateParticipant) {
        throw new ConflictError(`Participant already registered for this event: ${email}`);
      }
    }

    // 4. Concurrency-Safe Atomic Seat Reservation
    // If availableSeats < request.quantity, reserveSeats throws CapacityError
    try {
      await Event.reserveSeats(event.id, request.quantity);
    } catch (err) {
      if (err.code === 'SEATS_UNAVAILABLE' || err.name === 'CapacityError') {
        throw new BadRequestError('Tickets Sold Out');
      }
      throw err;
    }

    // 5. Generate secure identifiers and calculate total amount on server
    const ticketId = generateTicketId();
    const activeMembership = event.memberTicketPrice !== null && event.memberTicketPrice !== undefined
      ? await Membership.findOne({
        userId: user.id,
        status: 'ACTIVE',
        $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }],
      }).select('_id').lean()
      : null;
    const ticketUnitPrice = activeMembership ? Number(event.memberTicketPrice) : Number(event.ticketPrice || 0);
    const totalAmount = Number((ticketUnitPrice * request.quantity).toFixed(2));

    // 6. Create Booking in PENDING state
    const booking = new Booking({
      ticketId,
      userId: user.id,
      user: user._id,
      eventId: event.id,
      event: event._id,
      quantity: request.quantity,
      totalAmount,
      ticketUnitPrice,
      membershipPricingApplied: Boolean(activeMembership),
      bookingStatus: 'PENDING',
      ticketStatus: 'ACTIVE',
      attendanceStatus: 'NOT_ATTENDED',
      participants: participants.map((p) => ({
        name: p.name.trim(),
        email: p.email.trim().toLowerCase(),
        department: p.department || null,
        college: p.college || null,
      })),
      bookedAt: new Date(),
    });

    const savedBooking = await booking.save();

    // 7. Initialize Payment in PENDING state
    const txnId = `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const payment = new Payment({
      transactionId: txnId,
      bookingId: savedBooking.id,
      booking: savedBooking._id,
      amount: totalAmount,
      paymentStatus: 'PENDING',
      paymentMethod: 'ONLINE',
    });
    await payment.save();

    // 8. Queue entry for monitoring
    const queueEntry = new BookingQueueEntry({
      requestId: `BR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      userId: user.id,
      eventId: event.id,
      quantity: request.quantity,
      bookingStatus: 'PAYMENT_PENDING',
      bookingId: savedBooking.id,
      message: 'Payment Pending',
      requestTimestamp: new Date(),
    });
    await queueEntry.save();

    // Populate for response
    await savedBooking.populate(['event', 'user']);
    return BookingService.toBookingResponse(savedBooking);
  }

  /**
   * Retrieve paginated booking history for a user.
   */
  static async getUserBookings(userId, page = 0, size = 10) {
    const pageNum = Math.max(0, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(size, 10)));

    const filter = { userId };
    const totalElements = await Booking.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / pageSize) || 0;

    const bookings = await Booking.find(filter)
      .populate('event')
      .populate('user')
      .sort({ bookedAt: -1 })
      .skip(pageNum * pageSize)
      .limit(pageSize);

    return {
      content: bookings.map((b) => BookingService.toBookingResponse(b)),
      page: pageNum,
      size: pageSize,
      totalElements,
      totalPages,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
    };
  }

  /**
   * Retrieve single booking by ID with ownership verification.
   */
  static async getBookingById(bookingId, userId) {
    const booking = await Booking.findOne({ id: Number(bookingId), userId })
      .populate('event')
      .populate('user');
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    return BookingService.toBookingResponse(booking);
  }

  /**
   * Retrieve booking by ticketId with ownership verification.
   */
  static async getByTicketId(ticketId, userId) {
    const booking = await Booking.findOne({ ticketId: ticketId.trim() })
      .populate('event')
      .populate('user');
    if (!booking) {
      throw new NotFoundError(`Ticket not found: ${ticketId}`);
    }
    if (booking.userId !== userId) {
      throw new ForbiddenError('Unauthorized Access');
    }
    return BookingService.toBookingResponse(booking);
  }

  /**
   * Cancel booking and atomically release held capacity.
   */
  static async cancelBooking(bookingId, userId, reason = 'User requested cancellation') {
    const booking = await Booking.findOne({ id: Number(bookingId) })
      .populate('event')
      .populate('user');
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.userId !== userId) {
      throw new ForbiddenError('Unauthorized Access');
    }

    if (booking.bookingStatus === 'CANCELLED') {
      throw new BadRequestError('Booking is already cancelled');
    }

    booking.bookingStatus = 'CANCELLED';
    booking.ticketStatus = 'CANCELLED';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    booking.qrCodePath = null;
    await booking.save();

    // Atomically restore available seats back to the event
    await Event.releaseSeats(booking.eventId, booking.quantity);

    // If payment was SUCCESSFUL, create refund request
    const payment = await Payment.findOne({
      bookingId: booking.id,
      paymentStatus: 'SUCCESSFUL',
    });
    if (payment) {
      const refCode = `REF-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      const refund = new Refund({
        paymentId: payment.id,
        payment: payment._id,
        refundAmount: payment.amount,
        refundStatus: 'REFUND_REQUESTED',
        reason,
        refundReference: refCode,
      });
      await refund.save();

      payment.paymentStatus = 'REFUNDED';
      await payment.save();
    }

    return BookingService.toBookingResponse(booking);
  }

  /**
   * Background release of reservations pending payment longer than 10 minutes.
   */
  static async releaseExpiredReservations() {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const expiredBookings = await Booking.find({
      bookingStatus: 'PENDING',
      bookedAt: { $lt: cutoff },
    });

    let releasedCount = 0;
    for (const booking of expiredBookings) {
      try {
        booking.bookingStatus = 'EXPIRED';
        booking.ticketStatus = 'EXPIRED';
        booking.expiredAt = new Date();
        await booking.save();

        await Event.releaseSeats(booking.eventId, booking.quantity);

        // Also mark payment as FAILED if still pending/processing
        const payment = await Payment.findOne({
          bookingId: booking.id,
          paymentStatus: { $in: ['PENDING', 'PROCESSING'] },
        });
        if (payment) {
          payment.paymentStatus = 'FAILED';
          payment.failureReason = 'Payment window expired (10 minutes)';
          await payment.save();
        }

        releasedCount++;
      } catch (err) {
        // Continue processing others
      }
    }
    return releasedCount;
  }
}

export default BookingService;
