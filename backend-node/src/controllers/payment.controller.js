import { paymentService } from '../services/payment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { razorpayVerifySchema, paymentStatusUpdateSchema } from '../validators/payment.validator.js';

export class PaymentController {
  /**
   * GET /api/payments - history
   */
  static async history(req, res, next) {
    try {
      const page = req.query.page || 0;
      const size = req.query.size || 10;
      const data = await paymentService.history(req.user.id, page, size);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bookings/:bookingId/processing
   */
  static async markProcessing(req, res, next) {
    try {
      const { bookingId } = req.params;
      const validated = paymentStatusUpdateSchema.parse(req.body || {});
      const data = await paymentService.markProcessing(bookingId, req.user.id, validated);
      return ApiResponse.success(res, data, 'Payment processing');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bookings/:bookingId/razorpay/order
   */
  static async createRazorpayOrder(req, res, next) {
    try {
      const { bookingId } = req.params;
      const data = await paymentService.createRazorpayOrder(bookingId, req.user.id);
      return ApiResponse.success(res, data, 'Razorpay order created');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bookings/:bookingId/razorpay/verify
   */
  static async verifyRazorpayPayment(req, res, next) {
    try {
      const { bookingId } = req.params;
      const validated = razorpayVerifySchema.parse(req.body);
      const data = await paymentService.verifyRazorpayPayment(bookingId, req.user.id, validated);
      return ApiResponse.success(res, data, 'Payment verified');
    } catch (err) {
      next(err);
    }
  }

  static async createMerchandiseRazorpayOrder(req, res, next) {
    try {
      const data = await paymentService.createRazorpayOrderForMerchandise(req.params.orderId, req.user.id);
      return ApiResponse.success(res, data, 'Razorpay merchandise order created');
    } catch (err) {
      next(err);
    }
  }

  static async verifyMerchandiseRazorpayPayment(req, res, next) {
    try {
      const validated = razorpayVerifySchema.parse(req.body);
      const data = await paymentService.verifyMerchandisePayment(req.params.orderId, req.user.id, validated);
      return ApiResponse.success(res, data, 'Merchandise payment verified');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bookings/:bookingId/success
   */
  static async markSuccess(req, res, next) {
    try {
      const { bookingId } = req.params;
      const payment = await paymentService.getPayment(bookingId);
      if (payment.amount > 0 && payment.paymentStatus !== 'SUCCESSFUL') {
        return ApiResponse.error(res, {
          message: 'Paid bookings require verified payment gateway confirmation. Client-side confirmation is not trusted.',
          statusCode: 400,
          errorCode: 'UNVERIFIED_PAYMENT',
        });
      }
      const validated = paymentStatusUpdateSchema.parse(req.body || {});
      const data = await paymentService.markSuccessful(bookingId, req.user.id, validated);
      return ApiResponse.success(res, data, 'Booking Successful');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/bookings/:bookingId/failed
   */
  static async markFailed(req, res, next) {
    try {
      const { bookingId } = req.params;
      const validated = paymentStatusUpdateSchema.parse(req.body || {});
      const data = await paymentService.markFailed(bookingId, req.user.id, validated);
      return ApiResponse.success(res, data, 'Payment failed');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payments/:paymentId/refunds
   */
  static async refundsByPayment(req, res, next) {
    try {
      const { paymentId } = req.params;
      const data = await paymentService.byPayment(paymentId, req.user.id, req.user.role);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/payments/refunds/my
   */
  static async myRefunds(req, res, next) {
    try {
      const data = await paymentService.myRefunds(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/webhook
   */
  static async webhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const result = await paymentService.handleWebhook(rawBody, signature);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export default PaymentController;
