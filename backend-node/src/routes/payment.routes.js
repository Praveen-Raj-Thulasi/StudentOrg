import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const router = Router();

// Public / webhook route (signature verified inside controller)
router.post('/payments/webhook', PaymentController.webhook);

// User-authenticated endpoints
router.get('/payments', authenticateToken, requireRole('USER'), PaymentController.history);
router.post('/payments/bookings/:bookingId/processing', authenticateToken, requireRole('USER'), PaymentController.markProcessing);
router.post('/payments/bookings/:bookingId/razorpay/order', authenticateToken, requireRole('USER'), PaymentController.createRazorpayOrder);
router.post('/payments/bookings/:bookingId/razorpay/verify', authenticateToken, requireRole('USER'), PaymentController.verifyRazorpayPayment);
router.post('/payments/merchandise/orders/:orderId/razorpay/order', authenticateToken, requireRole('USER'), PaymentController.createMerchandiseRazorpayOrder);
router.post('/payments/merchandise/orders/:orderId/razorpay/verify', authenticateToken, requireRole('USER'), PaymentController.verifyMerchandiseRazorpayPayment);
router.post('/payments/bookings/:bookingId/success', authenticateToken, requireRole('USER'), PaymentController.markSuccess);
router.post('/payments/bookings/:bookingId/failed', authenticateToken, requireRole('USER'), PaymentController.markFailed);

// Refund endpoints
router.get('/payments/refunds/my', authenticateToken, requireRole('USER'), PaymentController.myRefunds);
router.get('/payments/:paymentId/refunds', authenticateToken, requireRole(['USER', 'ADMIN']), PaymentController.refundsByPayment);

export default router;
