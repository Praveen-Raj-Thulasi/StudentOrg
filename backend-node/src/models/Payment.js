import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const paymentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    transactionId: { type: String, required: true, unique: true, index: true },
    bookingId: { type: Number, default: null, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    duesId: { type: Number, default: null, index: true },
    dues: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipDues', default: null },
    orderId: { type: Number, default: null, index: true },
    campaignId: { type: Number, default: null, index: true },
    userId: { type: Number, default: null, index: true },
    paymentType: { type: String, enum: ['BOOKING', 'DUES', 'MERCHANDISE', 'DONATION'], default: 'BOOKING' },
    amount: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
      required: true,
      index: true,
    },
    paymentMethod: { type: String, default: 'ONLINE' },
    gatewayReference: { type: String, default: null },
    gatewayOrderId: { type: String, index: true, default: null },
    failureReason: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  {
    collection: 'payments',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

paymentSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('payments');
  }
  next();
});

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
