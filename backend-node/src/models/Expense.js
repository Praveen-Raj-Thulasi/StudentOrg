import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const expenseSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    reference: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    payee: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: ['SUPPLIES', 'MARKETING', 'FACILITIES', 'HONORARIUM', 'REFRESHMENTS', 'EQUIPMENT', 'OPERATIONS', 'OTHER'],
      default: 'OPERATIONS',
      index: true,
    },
    academicTerm: { type: String, required: true, trim: true, default: '2026-2027', index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR', uppercase: true },
    dueDate: { type: Date, default: null },
    receiptUrl: { type: String, default: null, trim: true },
    createdBy: { type: Number, required: true, index: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Number, default: null, index: true },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvalStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    rejectionReason: { type: String, default: null, trim: true },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID', 'CANCELLED'],
      default: 'UNPAID',
      index: true,
    },
    paidAt: { type: Date, default: null },
    paymentReference: { type: String, default: null, trim: true },
    paidBy: { type: Number, default: null },
  },
  {
    collection: 'expenses',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

expenseSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('expenses');
    }
    if (!this.reference) {
      this.reference = `EXP-${this.academicTerm || '2026'}-${String(this.id).padStart(4, '0')}`;
    }
  }
});

export const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
