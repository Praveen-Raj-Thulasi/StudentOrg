import { AgentTool } from './agentTool.interface.js';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';

export class PaymentTool extends AgentTool {
  name() {
    return 'paymentTool';
  }

  description() {
    return 'Fetches user payment history, payment status, refund status, and transaction details.';
  }

  async execute(input = {}, principal = null) {
    if (!principal || !principal.id) {
      return { error: 'Authentication required to view payments.' };
    }

    try {
      const userId = principal.id;
      const userBookings = await Booking.find({ userId }).select('id _id').lean();
      const bookingIds = userBookings.map((b) => b.id);
      const bookingObjectIds = userBookings.map((b) => b._id);

      const payments = await Payment.find({
        $or: [
          { bookingId: { $in: bookingIds } },
          { booking: { $in: bookingObjectIds } },
        ],
      })
        .populate({
          path: 'booking',
          populate: { path: 'event', select: 'eventName' },
        })
        .sort({ paidAt: -1 })
        .limit(10)
        .lean();

      const paymentList = payments.map((p) => ({
        transactionId: p.transactionId,
        amount: p.amount,
        paymentStatus: p.paymentStatus,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        eventName: p.booking?.event?.eventName || 'N/A',
      }));

      const refunds = await Refund.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const refundList = refunds.map((r) => ({
        refundReference: r.refundReference,
        refundAmount: r.refundAmount,
        refundStatus: r.refundStatus,
        reason: r.reason,
      }));

      const successful = payments.filter((p) => p.paymentStatus === 'SUCCESSFUL').length;

      return {
        payments: paymentList,
        refunds: refundList,
        totalPayments: paymentList.length,
        successfulPayments: successful,
      };
    } catch (err) {
      return { error: `Could not fetch payment data: ${err.message}` };
    }
  }
}

export const paymentTool = new PaymentTool();
export default paymentTool;
