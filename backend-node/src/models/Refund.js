import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const refundSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    refundReference: { type: String, required: true, unique: true, index: true },
    paymentId: { type: Number, required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    bookingId: { type: Number, index: true, default: null },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    userId: { type: Number, index: true, default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refundAmount: { type: Number, required: true, min: 0 },
    refundStatus: {
      type: String,
      enum: ['INITIATED', 'REFUND_REQUESTED', 'UNDER_VERIFICATION', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'],
      default: 'INITIATED',
      index: true,
    },
    reason: { type: String, default: null },
    refundDate: { type: Date, default: Date.now },
  },
  {
    collection: 'refunds',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

refundSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('refunds');
  }
  next();
});

export const Refund = mongoose.model('Refund', refundSchema);
export default Refund;
