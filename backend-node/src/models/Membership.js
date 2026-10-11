import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const membershipSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    memberNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['NOT_APPLIED', 'PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    statement: { type: String, trim: true, default: null },
    department: { type: String, trim: true, default: null },
    yearOfStudy: { type: String, trim: true, default: null },
    appliedAt: { type: Date, default: Date.now },
    reviewedBy: { type: Number, default: null },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewerNote: { type: String, trim: true, default: null },
    rejectionReason: { type: String, trim: true, default: null },
    activatedAt: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    renewalReminderDaysSent: { type: [Number], default: [] },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, trim: true, default: null },
  },
  {
    collection: 'memberships',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

membershipSchema.index({ userId: 1, status: 1 });
membershipSchema.index({ memberNumber: 1 });

membershipSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('memberships');
  }
  next();
});

export const Membership = mongoose.model('Membership', membershipSchema);
export default Membership;
