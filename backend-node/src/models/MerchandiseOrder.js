import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: String, default: 'ONE_SIZE' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const merchandiseOrderSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    orderNumber: { type: String, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    orderStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    paymentId: { type: Number, default: null, index: true },
    transactionId: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
  },
  {
    collection: 'merchandise_orders',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

merchandiseOrderSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('merchandise_orders');
    }
    if (!this.orderNumber) {
      this.orderNumber = `ORD-${new Date().getFullYear()}-${String(this.id).padStart(5, '0')}`;
    }
  }
});

export const MerchandiseOrder = mongoose.model('MerchandiseOrder', merchandiseOrderSchema);
export default MerchandiseOrder;
