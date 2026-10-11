import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const ledgerEntrySchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    entryNumber: { type: String, unique: true, index: true },
    entryType: {
      type: String,
      enum: ['INCOME', 'EXPENSE', 'REFUND', 'REIMBURSEMENT', 'ADJUSTMENT'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR', uppercase: true },
    academicTerm: { type: String, required: true, default: '2026-2027', index: true },
    category: {
      type: String,
      enum: ['MEMBERSHIP_DUES', 'TICKET_SALES', 'MERCHANDISE_SALES', 'DONATION', 'SPONSORSHIP', 'SUPPLIES', 'MARKETING', 'FACILITIES', 'HONORARIUM', 'REFRESHMENTS', 'EQUIPMENT', 'OPERATIONS', 'REIMBURSEMENT', 'REFUND', 'OTHER'],
      default: 'OPERATIONS',
      index: true,
    },
    description: { type: String, required: true, trim: true },
    sourceReference: { type: String, required: true, index: true },
    sourceModel: {
      type: String,
      enum: ['Payment', 'Expense', 'Reimbursement', 'Refund', 'Order', 'Adjustment', 'Sponsorship', 'FundCollection'],
      required: true,
    },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    postedBy: { type: Number, required: true },
    status: {
      type: String,
      enum: ['POSTED', 'REVERSED'],
      default: 'POSTED',
      index: true,
    },
    isReversal: { type: Boolean, default: false },
    reversedEntryId: { type: Number, default: null, index: true },
    reversalReason: { type: String, default: null },
    postedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'ledger_entries',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

ledgerEntrySchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('ledger_entries');
    }
    if (!this.entryNumber) {
      this.entryNumber = `TXN-LEDGER-${String(this.id).padStart(6, '0')}`;
    }
  }
});

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
export default LedgerEntry;
