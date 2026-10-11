import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const budgetAdjustmentSchema = new mongoose.Schema(
  {
    adjustmentAmount: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    adjustedBy: { type: Number, required: true },
    adjustedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const budgetSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    budgetCode: { type: String, unique: true, index: true },
    academicTerm: { type: String, required: true, trim: true, default: '2026-2027', index: true },
    category: {
      type: String,
      enum: ['SUPPLIES', 'MARKETING', 'FACILITIES', 'HONORARIUM', 'REFRESHMENTS', 'EQUIPMENT', 'OPERATIONS', 'OTHER'],
      required: true,
      index: true,
    },
    allocatedAmount: { type: Number, required: true, min: 0 },
    approvedAdjustments: { type: Number, default: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    description: { type: String, trim: true, default: '' },
    adjustmentHistory: [budgetAdjustmentSchema],
    createdBy: { type: Number, required: true },
  },
  {
    collection: 'budgets',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

budgetSchema.index({ academicTerm: 1, category: 1 }, { unique: true });

budgetSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('budgets');
    }
    if (!this.budgetCode) {
      this.budgetCode = `BDG-${this.academicTerm || '2026'}-${this.category}`;
    }
  }
});

export const Budget = mongoose.model('Budget', budgetSchema);
export default Budget;
