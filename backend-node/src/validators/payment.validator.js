import { z } from 'zod';

export const paymentStatusUpdateSchema = z.object({
  paymentMethod: z.string().optional(),
  gatewayTransactionId: z.string().optional(),
  failureReason: z.string().optional(),
});

export const razorpayVerifySchema = z.object({
  razorpayOrderId: z.string().min(1, 'razorpayOrderId is required'),
  razorpayPaymentId: z.string().min(1, 'razorpayPaymentId is required'),
  razorpaySignature: z.string().min(1, 'razorpaySignature is required'),
  paymentMethod: z.string().optional(),
});

export const refundStatusUpdateSchema = z.object({
  status: z.enum(['INITIATED', 'REFUND_REQUESTED', 'UNDER_VERIFICATION', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED']),
  note: z.string().optional(),
});
