import crypto from 'crypto';
import { Payment } from '../models/Payment.js';
import { Booking } from '../models/Booking.js';
import { Refund } from '../models/Refund.js';
import { AuditLog } from '../models/AuditLog.js';
import { MembershipDues } from '../models/MembershipDues.js';
import { MerchandiseOrder } from '../models/MerchandiseOrder.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { generateQRCode } from '../utils/qrGenerator.js';
import { notificationService } from './notification.service.js';
import { emailService } from './email.service.js';
import { BookingService } from './booking.service.js';
import { MembershipService } from './membership.service.js';
import { MerchandiseService } from './merchandise.service.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';

class PaymentService {
  /**
   * Paginated payment history for a user.
   */
  async history(userId, page = 0, size = 10) {
    const pageNum = Math.max(0, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(size, 10)));

    // Find all bookings for this user
    const userBookings = await Booking.find({ userId }).select('id');
    const bookingIds = userBookings.map((b) => b.id);

    const filter = { bookingId: { $in: bookingIds } };
    const totalElements = await Payment.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / pageSize) || 0;

    const payments = await Payment.find(filter)
      .populate({
        path: 'booking',
        populate: ['event', 'user'],
      })
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(pageNum * pageSize)
      .limit(pageSize);

    return {
      content: payments.map((p) => this.toResponse(p)),
      page: pageNum,
      size: pageSize,
      totalElements,
      totalPages,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
    };
  }

  /**
   * Create Razorpay order for an existing booking.
   */
  async createRazorpayOrder(bookingId, userId) {
    const booking = await this.getOwnedBooking(bookingId, userId);
    const payment = await this.getPayment(bookingId);

    if (booking.bookingStatus === 'CANCELLED' || booking.bookingStatus === 'EXPIRED') {
      throw new BadRequestError(
        `This booking is ${booking.bookingStatus.toLowerCase()}. Please create a new booking before paying.`
      );
    }

    // Free event handling (Zero amount)
    if (payment.amount <= 0) {
      if (booking.totalAmount > 0) {
        throw new BadRequestError('Payment amount mismatch: zero payment cannot confirm paid booking.', 'AMOUNT_MISMATCH');
      }
      await this.markSuccessful(bookingId, userId, {
        paymentMethod: 'FREE',
        gatewayTransactionId: `FREE-${booking.ticketId}`,
        verifiedByGateway: true,
      });

      return {
        bookingId: Number(bookingId),
        displayAmount: 0,
        currency: env.RAZORPAY_CURRENCY || 'INR',
        eventName: booking.event ? booking.event.eventName : 'Event',
        customerName: booking.user ? booking.user.name : 'Customer',
        customerEmail: booking.user ? booking.user.email : '',
      };
    }

    if (payment.paymentStatus === 'SUCCESSFUL') {
      throw new BadRequestError('Payment is already successful');
    }
    if (payment.paymentStatus === 'REFUNDED' || payment.paymentStatus === 'PARTIALLY_REFUNDED') {
      throw new BadRequestError('This booking payment was refunded and cannot be paid again.');
    }

    this.ensureRazorpayConfigured();

    const amountInPaise = Math.round(payment.amount * 100);
    const receipt = `booking_${bookingId}_${payment.id}`;

    let razorpayOrderId;
    if (env.NODE_ENV === 'test' || env.RAZORPAY_KEY_ID?.includes('placeholder')) {
      razorpayOrderId = `order_mock_${Date.now()}`;
    } else {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
        const res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: env.RAZORPAY_CURRENCY || 'INR',
            receipt,
            payment_capture: 1,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const description = errorData?.error?.description || 'Razorpay order creation failed';
          logger.error({ errorData }, `[PaymentService] Razorpay order creation failed: ${description}`);
          throw new BadRequestError(`Could not create Razorpay order: ${description}`);
        }

        const orderData = await res.json();
        razorpayOrderId = orderData.id;
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
        logger.error({ err }, '[PaymentService] Network error during Razorpay order creation');
        throw new BadRequestError('Could not create Razorpay order. Please check payment configuration.');
      }
    }

    payment.paymentStatus = 'PROCESSING';
    payment.paymentMethod = 'RAZORPAY';
    payment.gatewayOrderId = razorpayOrderId;
    payment.failureReason = null;
    await payment.save();

    await this.recordAudit(
      userId,
      'USER',
      'RAZORPAY_ORDER_CREATED',
      'PAYMENT',
      String(payment.id),
      `Razorpay order created for booking ${bookingId}`
    );

    return {
      keyId: env.RAZORPAY_KEY_ID,
      orderId: razorpayOrderId,
      currency: env.RAZORPAY_CURRENCY || 'INR',
      amount: amountInPaise,
      displayAmount: payment.amount,
      bookingId: Number(bookingId),
      eventName: booking.event ? booking.event.eventName : 'Event',
      customerName: booking.user ? booking.user.name : 'Customer',
      customerEmail: booking.user ? booking.user.email : '',
    };
  }

  /**
   * Verify Razorpay payment signature securely on the server.
   */
  async verifyRazorpayPayment(bookingId, userId, request) {
    this.ensureRazorpayConfigured();
    const payment = await this.getPayment(bookingId);
    const booking = await this.getOwnedBooking(bookingId, userId);

    if (booking.bookingStatus === 'CANCELLED' || booking.bookingStatus === 'EXPIRED') {
      throw new BadRequestError(`Cannot confirm payment for ${booking.bookingStatus.toLowerCase()} booking`);
    }

    if (!payment.gatewayOrderId || payment.gatewayOrderId !== request.razorpayOrderId) {
      await this.recordFailedVerification(payment, userId, 'Razorpay order mismatch');
      throw new BadRequestError('Razorpay order mismatch');
    }

    if (!/^[0-9a-f]{64}$/i.test(request.razorpaySignature)) {
      await this.recordFailedVerification(payment, userId, 'Invalid Razorpay signature format');
      throw new BadRequestError('Razorpay signature must be a valid SHA-256 hex digest');
    }

    const payload = `${request.razorpayOrderId}|${request.razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    const expected = Buffer.from(expectedSignature, 'hex');
    const actual = Buffer.from(request.razorpaySignature, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      await this.recordFailedVerification(payment, userId, 'Razorpay signature verification failed');
      throw new BadRequestError('Razorpay signature verification failed');
    }

    return this.markSuccessful(bookingId, userId, {
      paymentMethod: request.paymentMethod || 'RAZORPAY',
      gatewayTransactionId: request.razorpayPaymentId,
      verifiedByGateway: true,
    });
  }

  /** Create a gateway order for an owned merchandise reservation. */
  async createRazorpayOrderForMerchandise(orderId, userId) {
    const order = await MerchandiseOrder.findOne({ id: Number(orderId), userId: Number(userId) });
    if (!order) throw new NotFoundError('Merchandise order not found');
    if (order.orderStatus !== 'PENDING' || order.paymentStatus !== 'PENDING') {
      throw new BadRequestError(`Cannot pay an order in ${order.orderStatus}/${order.paymentStatus} status`);
    }
    const payment = await Payment.findOne({ orderId: order.id, paymentType: 'MERCHANDISE', userId: Number(userId) });
    if (!payment) throw new NotFoundError('Payment record not found for merchandise order');

    if (payment.amount <= 0) {
      await MerchandiseService.confirmOrderPayment(order.id, { verifiedByGateway: true, gatewayReference: `FREE-${order.orderNumber}` });
      return { orderId: order.id, amount: 0, displayAmount: 0, currency: order.currency, status: 'PAID' };
    }

    this.ensureRazorpayConfigured();
    const amountInPaise = Math.round(payment.amount * 100);
    let razorpayOrderId;
    if (env.NODE_ENV === 'test' || env.RAZORPAY_KEY_ID?.includes('placeholder')) {
      razorpayOrderId = `order_merch_mock_${Date.now()}`;
    } else {
      const authHeader = 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInPaise, currency: order.currency || 'INR', receipt: `merch_${order.orderNumber}`, payment_capture: 1 }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new BadRequestError(errorData?.error?.description || 'Could not create merchandise payment order');
      }
      razorpayOrderId = (await response.json()).id;
    }

    payment.paymentStatus = 'PROCESSING';
    payment.paymentMethod = 'RAZORPAY';
    payment.gatewayOrderId = razorpayOrderId;
    await payment.save();
    return {
      keyId: env.RAZORPAY_KEY_ID,
      orderId: razorpayOrderId,
      currency: order.currency || 'INR',
      amount: amountInPaise,
      displayAmount: payment.amount,
      merchandiseOrderId: order.id,
      customerName: '',
      customerEmail: '',
    };
  }

  /** Verify Razorpay's checkout signature before finalizing merchandise inventory. */
  async verifyMerchandisePayment(orderId, userId, request) {
    const order = await MerchandiseOrder.findOne({ id: Number(orderId), userId: Number(userId) });
    if (!order) throw new NotFoundError('Merchandise order not found');
    const payment = await Payment.findOne({ orderId: order.id, paymentType: 'MERCHANDISE', userId: Number(userId) });
    if (!payment) throw new NotFoundError('Payment record not found for merchandise order');
    if (payment.paymentStatus === 'SUCCESSFUL') return order;
    if (!payment.gatewayOrderId || payment.gatewayOrderId !== request.razorpayOrderId) {
      throw new BadRequestError('Razorpay order mismatch');
    }
    if (!/^[0-9a-f]{64}$/i.test(request.razorpaySignature)) {
      throw new BadRequestError('Razorpay signature must be a valid SHA-256 hex digest');
    }
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${request.razorpayOrderId}|${request.razorpayPaymentId}`)
      .digest('hex');
    const expected = Buffer.from(expectedSignature, 'hex');
    const actual = Buffer.from(request.razorpaySignature, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new BadRequestError('Razorpay signature verification failed');
    }
    return MerchandiseService.confirmOrderPayment(order.id, {
      verifiedByGateway: true,
      gatewayReference: request.razorpayPaymentId,
      transactionId: request.razorpayPaymentId,
    });
  }

  /**
   * Create Razorpay order for membership dues obligation.
   */
  async createRazorpayOrderForDues(duesId, userId) {
    const due = await MembershipDues.findOne({ id: Number(duesId) });
    if (!due) throw new NotFoundError('Dues record not found');

    if (due.userId !== userId) {
      throw new ForbiddenError('Unauthorized: You do not own this dues obligation');
    }

    if (due.status === 'PAID') {
      throw new BadRequestError('Dues obligation is already paid');
    }
    if (due.status === 'WAIVED' || due.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot pay dues in ${due.status} status`);
    }

    // Free / Zero dues handling
    if (due.amount <= 0) {
      const settled = await MembershipService.settleDues(due.id, userId, {
        paymentMethod: 'FREE',
        gatewayTransactionId: `FREE-DUES-${due.id}`,
        verifiedByGateway: true,
      });

      return {
        duesId: Number(duesId),
        displayAmount: 0,
        currency: env.RAZORPAY_CURRENCY || 'INR',
        status: settled.status,
      };
    }

    this.ensureRazorpayConfigured();

    let payment = await Payment.findOne({ duesId: Number(duesId), paymentType: 'DUES' });
    if (!payment) {
      payment = new Payment({
        transactionId: `TXN-DUES-${due.id}-${Date.now()}`,
        duesId: Number(due.id),
        dues: due._id,
        userId,
        paymentType: 'DUES',
        amount: due.amount,
        paymentStatus: 'PENDING',
        paymentMethod: 'RAZORPAY',
      });
    }

    const amountInPaise = Math.round(due.amount * 100);
    const receipt = `dues_${due.id}_${payment.id || Date.now()}`;

    let razorpayOrderId;
    if (env.NODE_ENV === 'test' || env.RAZORPAY_KEY_ID?.includes('placeholder')) {
      razorpayOrderId = `order_dues_mock_${Date.now()}`;
    } else {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
        const res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: env.RAZORPAY_CURRENCY || 'INR',
            receipt,
            payment_capture: 1,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const description = errorData?.error?.description || 'Razorpay dues order creation failed';
          logger.error({ errorData }, `[PaymentService] Razorpay dues order creation failed: ${description}`);
          throw new BadRequestError(`Could not create Razorpay order for dues: ${description}`);
        }

        const orderData = await res.json();
        razorpayOrderId = orderData.id;
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
        logger.error({ err }, '[PaymentService] Network error during Razorpay dues order creation');
        throw new BadRequestError('Could not create Razorpay order for dues. Please check payment configuration.');
      }
    }

    payment.paymentStatus = 'PROCESSING';
    payment.paymentMethod = 'RAZORPAY';
    payment.gatewayOrderId = razorpayOrderId;
    payment.amount = due.amount;
    payment.failureReason = null;
    await payment.save();

    await this.recordAudit(
      userId,
      'USER',
      'RAZORPAY_DUES_ORDER_CREATED',
      'PAYMENT',
      String(payment.id),
      `Razorpay order created for dues obligation ${duesId}`
    );

    return {
      keyId: env.RAZORPAY_KEY_ID,
      orderId: razorpayOrderId,
      currency: env.RAZORPAY_CURRENCY || 'INR',
      amount: amountInPaise,
      displayAmount: due.amount,
      duesId: Number(duesId),
      title: due.title,
    };
  }

  /**
   * Verify Razorpay payment signature for dues obligation securely on the server.
   */
  async verifyRazorpayDuesPayment(duesId, userId, request) {
    this.ensureRazorpayConfigured();
    const due = await MembershipDues.findOne({ id: Number(duesId) });
    if (!due) throw new NotFoundError('Dues record not found');

    if (due.userId !== userId) {
      throw new ForbiddenError('Unauthorized: You do not own this dues obligation');
    }

    const payment = await Payment.findOne({ duesId: Number(duesId), paymentType: 'DUES' });
    if (!payment) {
      throw new NotFoundError('Payment record not found for dues');
    }

    if (!payment.gatewayOrderId || payment.gatewayOrderId !== request.razorpayOrderId) {
      await this.recordFailedVerification(payment, userId, 'Razorpay order mismatch');
      throw new BadRequestError('Razorpay order mismatch');
    }

    const payload = `${request.razorpayOrderId}|${request.razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    if (expectedSignature !== request.razorpaySignature) {
      await this.recordFailedVerification(payment, userId, 'Razorpay signature verification failed');
      throw new BadRequestError('Razorpay signature verification failed');
    }

    payment.paymentStatus = 'SUCCESSFUL';
    payment.paidAt = new Date();
    payment.gatewayReference = request.razorpayPaymentId;
    this.applyGatewayFields(payment, request);
    await payment.save();

    // Settle the dues obligation with trusted gateway verification flag
    const settled = await MembershipService.settleDues(due.id, userId, {
      paymentMethod: request.paymentMethod || 'RAZORPAY',
      gatewayTransactionId: request.razorpayPaymentId,
      verifiedByGateway: true,
    });

    return settled;
  }

  /**
   * Mark payment processing.
   */
  async markProcessing(bookingId, userId, request = {}) {
    await this.getOwnedBooking(bookingId, userId);
    const payment = await this.getPayment(bookingId);

    if (
      payment.paymentStatus !== 'PENDING' &&
      payment.paymentStatus !== 'FAILED' &&
      payment.paymentStatus !== 'PROCESSING'
    ) {
      throw new BadRequestError(`Payment cannot be moved to processing from ${payment.paymentStatus}`);
    }

    payment.paymentStatus = 'PROCESSING';
    payment.failureReason = null;
    this.applyGatewayFields(payment, request);
    await payment.save();

    await this.recordAudit(
      userId,
      'USER',
      'PAYMENT_PROCESSING',
      'PAYMENT',
      String(payment.id),
      `Payment processing for booking ${bookingId}`
    );

    return this.toResponse(payment);
  }

  /**
   * Mark payment successful and confirm booking atomically.
   */
  async markSuccessful(bookingId, userId, request = {}) {
    const booking = await this.getOwnedBooking(bookingId, userId);
    const payment = await this.getPayment(bookingId);

    // Prevent duplicate processing if already successful
    if (payment.paymentStatus === 'SUCCESSFUL' && booking.bookingStatus === 'CONFIRMED') {
      return BookingService.toBookingResponse(booking);
    }

    if (payment.paymentStatus === 'REFUNDED' || payment.paymentStatus === 'PARTIALLY_REFUNDED') {
      throw new BadRequestError(`Payment cannot be marked successful from ${payment.paymentStatus}`);
    }

    // Verify gateway authenticity for paid bookings
    if (payment.amount > 0 && payment.paymentStatus !== 'SUCCESSFUL') {
      if (request.verifiedByGateway !== true && request.paymentMethod !== 'RAZORPAY_WEBHOOK') {
        throw new BadRequestError(
          'Paid bookings require verified payment gateway confirmation. Client-side confirmation is not trusted.',
          'UNVERIFIED_PAYMENT'
        );
      }
    }

    // Ensure zero payment cannot confirm paid booking
    if (payment.amount <= 0 && booking.totalAmount > 0) {
      throw new BadRequestError(
        'Payment amount mismatch: zero payment cannot confirm paid booking.',
        'AMOUNT_MISMATCH'
      );
    }

    booking.bookingStatus = 'CONFIRMED';
    booking.ticketStatus = 'VALID';

    // Generate QR code for ticket
    try {
      booking.qrCodePath = await generateQRCode(booking.ticketId);
    } catch (err) {
      logger.warn({ err }, `[PaymentService] QR generation failed for ticket ${booking.ticketId}`);
    }

    payment.paymentStatus = 'SUCCESSFUL';
    payment.paidAt = new Date();
    this.applyGatewayFields(payment, request);

    if (!payment.gatewayReference) {
      payment.gatewayReference = `GW-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    }

    await payment.save();
    await booking.save();

    // Preserve audit log
    await this.recordAudit(
      userId,
      'USER',
      'PAYMENT_SUCCESSFUL',
      'PAYMENT',
      String(payment.id),
      `Payment completed for booking ${bookingId}`
    );

    // Send notifications and confirmation email without crashing booking workflow
    try {
      await notificationService.sendNotification(
        userId,
        'USER',
        'PAYMENT_SUCCESSFUL',
        'Payment successful',
        'Your payment is complete and ticket is confirmed.',
        `/bookings/${bookingId}`
      );
    } catch (err) {
      logger.warn({ err }, '[PaymentService] Notification dispatch failed');
    }

    try {
      const userEmail = booking.user ? booking.user.email : null;
      const userName = booking.user ? booking.user.name : null;
      const eventName = booking.event ? booking.event.eventName : 'Event';
      const eventDate = booking.event && booking.event.eventDate ? booking.event.eventDate.toISOString().split('T')[0] : '';
      const eventTime = booking.event && booking.event.eventTime ? booking.event.eventTime : '';
      const venue = booking.event ? (booking.event.venueName || booking.event.location || '') : '';

      if (userEmail) {
        await emailService.sendBookingConfirmation(
          userEmail,
          userName,
          booking.ticketId,
          booking.quantity,
          payment.amount,
          eventName,
          eventDate,
          eventTime,
          venue
        );
      }
    } catch (err) {
      logger.warn({ err }, '[PaymentService] Booking confirmation email failed');
    }

    return BookingService.toBookingResponse(booking);
  }

  /**
   * Mark payment failed.
   */
  async markFailed(bookingId, userId, request = {}) {
    await this.getOwnedBooking(bookingId, userId);
    const payment = await this.getPayment(bookingId);

    if (
      payment.paymentStatus === 'SUCCESSFUL' ||
      payment.paymentStatus === 'REFUNDED' ||
      payment.paymentStatus === 'PARTIALLY_REFUNDED'
    ) {
      throw new BadRequestError(`Payment cannot be marked failed from ${payment.paymentStatus}`);
    }

    payment.paymentStatus = 'FAILED';
    this.applyGatewayFields(payment, request);
    payment.failureReason = request.failureReason || 'Payment failed';
    await payment.save();

    await this.recordAudit(
      userId,
      'USER',
      'PAYMENT_FAILED',
      'PAYMENT',
      String(payment.id),
      payment.failureReason
    );

    return this.toResponse(payment);
  }

  /**
   * Idempotent webhook processing.
   */
  async handleWebhook(rawBody, signature) {
    if (!signature) {
      throw new BadRequestError('Webhook signature missing');
    }

    // Verify webhook signature with secret
    const webhookSecret = env.RAZORPAY_KEY_SECRET;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedWebhookSignature = Buffer.from(expectedSignature, 'hex');
    const actualWebhookSignature = /^[0-9a-f]{64}$/i.test(String(signature))
      ? Buffer.from(signature, 'hex')
      : Buffer.alloc(0);
    if (expectedWebhookSignature.length !== actualWebhookSignature.length
      || !crypto.timingSafeEqual(expectedWebhookSignature, actualWebhookSignature)) {
      logger.warn('[PaymentService] Webhook signature verification failed');
      throw new BadRequestError('Invalid webhook signature');
    }

    let event;
    try {
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      throw new BadRequestError('Malformed webhook body');
    }

    const eventType = event.event;
    logger.info({ eventType }, `[PaymentService] Processing Razorpay webhook: ${eventType}`);

    if (eventType === 'order.paid' || eventType === 'payment.captured') {
      const orderId = event.payload?.order?.entity?.id || event.payload?.payment?.entity?.order_id;
      const paymentId = event.payload?.payment?.entity?.id;

      if (!orderId) {
        return { status: 'ignored', reason: 'No order_id in webhook payload' };
      }

      const payment = await Payment.findOne({ gatewayOrderId: orderId }).populate('booking').populate('dues');
      if (!payment) {
        return { status: 'ignored', reason: 'Payment not found for orderId' };
      }

      // Idempotency check: if already successful, do not duplicate actions
      if (payment.paymentStatus === 'SUCCESSFUL') {
        logger.info(`[PaymentService] Webhook idempotent skip: Payment ${payment.id} already SUCCESSFUL`);
        return { status: 'ok', idempotent: true };
      }

      if (payment.paymentType === 'DUES' || payment.duesId) {
        payment.paymentStatus = 'SUCCESSFUL';
        payment.paidAt = new Date();
        payment.gatewayReference = paymentId || orderId;
        await payment.save();

        await MembershipService.settleDues(payment.duesId, payment.userId, {
          paymentMethod: 'RAZORPAY_WEBHOOK',
          gatewayTransactionId: paymentId || orderId,
          verifiedByGateway: true,
        });

        return { status: 'ok', processed: true };
      }

      if (payment.paymentType === 'MERCHANDISE') {
        const order = await MerchandiseOrder.findOne({ id: payment.orderId });
        if (!order) return { status: 'ignored', reason: 'Merchandise order not found' };
        await MerchandiseService.confirmOrderPayment(order.id, {
          verifiedByGateway: true,
          gatewayReference: paymentId || orderId,
          transactionId: paymentId || orderId,
        });
        return { status: 'ok', processed: true };
      }

      const booking = payment.booking;
      if (booking) {
        await this.markSuccessful(booking.id, booking.userId, {
          paymentMethod: 'RAZORPAY_WEBHOOK',
          gatewayTransactionId: paymentId || orderId,
          verifiedByGateway: true,
        });
      }
      return { status: 'ok', processed: true };
    }

    if (eventType === 'payment.failed') {
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) {
        const payment = await Payment.findOne({ gatewayOrderId: orderId }).populate('booking');
        if (payment && payment.paymentStatus !== 'SUCCESSFUL') {
          const reason = event.payload?.payment?.entity?.error_description || 'Payment failed via webhook';
          payment.paymentStatus = 'FAILED';
          payment.failureReason = reason;
          await payment.save();
        }
      }
      return { status: 'ok', processed: true };
    }

    return { status: 'ok', unhandled: eventType };
  }

  /**
   * Retrieve refunds for a specific payment with ownership enforcement.
   */
  async byPayment(paymentId, userId, role = 'USER') {
    const payment = await Payment.findOne({ id: Number(paymentId) }).populate('booking');
    if (!payment) throw new NotFoundError('Payment not found');

    if (role !== 'ADMIN') {
      if (!payment.booking || payment.booking.userId !== userId) {
        throw new ForbiddenError('Unauthorized Access');
      }
    }

    const refunds = await Refund.find({ paymentId: Number(paymentId) })
      .populate({
        path: 'payment',
        populate: { path: 'booking', populate: 'event' },
      })
      .sort({ refundDate: -1 });

    return refunds.map((r) => this.toRefundResponse(r));
  }

  /**
   * Retrieve all refunds for current logged-in user.
   */
  async myRefunds(userId) {
    const userBookings = await Booking.find({ userId }).select('id');
    const bookingIds = userBookings.map((b) => b.id);
    const userPayments = await Payment.find({ bookingId: { $in: bookingIds } }).select('id');
    const paymentIds = userPayments.map((p) => p.id);

    const refunds = await Refund.find({
      $or: [{ userId }, { paymentId: { $in: paymentIds } }],
    })
      .populate({
        path: 'payment',
        populate: { path: 'booking', populate: 'event' },
      })
      .sort({ refundDate: -1 });

    return refunds.map((r) => this.toRefundResponse(r));
  }

  /**
   * Admin update of refund status.
   */
  async updateRefundStatus(refundId, status, adminId, note = null) {
    const refund = await Refund.findOne({ id: Number(refundId) }).populate('payment');
    if (!refund) throw new NotFoundError('Refund not found');

    refund.refundStatus = status;
    if (note && note.trim()) {
      refund.reason = refund.reason ? `${refund.reason} | ${note.trim()}` : note.trim();
    }
    await refund.save();

    // Update parent payment status if refunds completed
    if (refund.payment) {
      await this.updatePaymentRefundStatus(refund.payment);
    }

    await this.recordAudit(
      adminId,
      'ADMIN',
      'REFUND_STATUS_UPDATED',
      'REFUND',
      String(refund.id),
      `Refund status changed to ${status}`
    );

    return this.toRefundResponse(refund);
  }

  async updatePaymentRefundStatus(payment) {
    const completedRefunds = await Refund.find({
      paymentId: payment.id,
      refundStatus: 'COMPLETED',
    });

    const sum = completedRefunds.reduce((acc, r) => acc + (r.refundAmount || 0), 0);
    if (sum <= 0) return;

    payment.paymentStatus = sum >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await payment.save();
  }

  // ── Helper methods ─────────────────────────────────────────────────────────

  async getOwnedBooking(bookingId, userId) {
    const booking = await Booking.findOne({ id: Number(bookingId), userId })
      .populate('event')
      .populate('user');
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    return booking;
  }

  async getPayment(bookingId) {
    const payment = await Payment.findOne({ bookingId: Number(bookingId) });
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    return payment;
  }

  applyGatewayFields(payment, request) {
    if (!request) return;
    if (request.paymentMethod && request.paymentMethod.trim()) {
      payment.paymentMethod = request.paymentMethod.trim();
    }
    if (request.gatewayTransactionId && request.gatewayTransactionId.trim()) {
      payment.gatewayReference = request.gatewayTransactionId.trim();
    }
  }

  async recordFailedVerification(payment, userId, reason) {
    if (
      payment.paymentStatus === 'SUCCESSFUL' ||
      payment.paymentStatus === 'REFUNDED' ||
      payment.paymentStatus === 'PARTIALLY_REFUNDED'
    ) {
      return;
    }
    payment.paymentStatus = 'FAILED';
    payment.failureReason = reason;
    await payment.save();

    await this.recordAudit(
      userId,
      'USER',
      'RAZORPAY_VERIFICATION_FAILED',
      'PAYMENT',
      String(payment.id),
      reason
    );
  }

  async recordAudit(userId, userType, action, entityType, entityId, details) {
    try {
      await AuditLog.create({
        actorId: userId,
        actorType: userType,
        action,
        targetType: entityType,
        targetId: entityId,
        details,
        createdAt: new Date(),
      });
    } catch (err) {
      logger.warn({ err }, '[PaymentService] Audit log write failed');
    }
  }

  ensureRazorpayConfigured() {
    if (env.NODE_ENV === 'test' || env.RAZORPAY_KEY_ID?.includes('placeholder')) return;
    if (
      !env.RAZORPAY_KEY_ID ||
      env.RAZORPAY_KEY_ID.includes('REPLACE_WITH') ||
      !env.RAZORPAY_KEY_SECRET ||
      env.RAZORPAY_KEY_SECRET.includes('REPLACE_WITH')
    ) {
      throw new BadRequestError(
        'Razorpay Test Mode is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before starting.'
      );
    }
  }

  toResponse(p) {
    const statusLabels = {
      PENDING: 'Pending',
      PROCESSING: 'Processing',
      SUCCESSFUL: 'Successful',
      FAILED: 'Failed',
      REFUNDED: 'Refunded',
      PARTIALLY_REFUNDED: 'Partially Refunded',
    };

    const booking = p.booking || {};
    const event = booking.event || {};

    const dateStr = p.paidAt ? p.paidAt.toISOString().split('T')[0] : null;
    const timeStr = p.paidAt ? p.paidAt.toTimeString().split(' ')[0] : null;

    return {
      paymentId: p.id,
      gatewayTransactionId: p.gatewayReference || p.transactionId,
      gatewayOrderId: p.gatewayOrderId,
      dateTime: p.paidAt,
      date: dateStr,
      time: timeStr,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      status: p.paymentStatus,
      statusLabel: statusLabels[p.paymentStatus] || p.paymentStatus,
      bookingId: booking.id || p.bookingId,
      eventName: event.eventName || null,
      ticketId: booking.ticketId || null,
    };
  }

  toRefundResponse(r) {
    const refundDate = r.refundDate || new Date();
    const expected = new Date(refundDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    let eventName = null;
    let transactionRef = null;
    if (r.payment) {
      transactionRef = r.payment.transactionId || r.payment.gatewayReference;
      if (r.payment.booking && r.payment.booking.event) {
        eventName = r.payment.booking.event.eventName;
      }
    }

    return {
      id: r.id,
      refundId: r.refundReference,
      amount: r.refundAmount,
      status: r.refundStatus,
      eventName,
      requestedAt: refundDate,
      expectedRefundDate: expected.toISOString().split('T')[0],
      acknowledgement: 'Refunds generally take 3–7 business days depending on your payment provider.',
      reason: r.reason,
      transactionRef,
    };
  }
}

export const paymentService = new PaymentService();
export default paymentService;
