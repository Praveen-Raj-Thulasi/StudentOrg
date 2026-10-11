import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const reimbursementSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    claimNumber: { type: String, unique: true, index: true },
    claimantId: { type: Number, required: true, index: true },
    claimant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    eventId: { type: Number, default: null, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    category: {
      type: String,
      enum: ['TRAVEL', 'SUPPLIES', 'FOOD_EVENT', 'EQUIPMENT', 'OTHER'],
      default: 'SUPPLIES',
      index: true,
    },
    academicTerm: { type: String, required: true, default: '2026-2027', index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR', uppercase: true },
    description: { type: String, required: true, trim: true },
    receiptUrl: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'],
      default: 'SUBMITTED',
      index: true,
    },
    reviewerId: { type: Number, default: null, index: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID', 'CANCELLED'],
      default: 'UNPAID',
      index: true,
    },
    paidAt: { type: Date, default: null },
    paidBy: { type: Number, default: null },
    disbursementMethod: { type: String, default: 'DIRECT_TRANSFER' },
    paymentReference: { type: String, default: null, trim: true },
  },
  {
    collection: 'reimbursements',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

reimbursementSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('reimbursements');
    }
    if (!this.claimNumber) {
      this.claimNumber = `RMB-${this.academicTerm || '2026'}-${String(this.id).padStart(4, '0')}`;
    }
  }
});

export const Reimbursement = mongoose.model('Reimbursement', reimbursementSchema);
export default Reimbursement;
