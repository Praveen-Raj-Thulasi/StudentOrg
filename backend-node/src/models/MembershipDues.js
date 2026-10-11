import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const membershipDuesSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    membershipId: { type: Number, required: true, index: true },
    membership: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true, trim: true, default: 'Annual Student Association Membership Dues' },
    academicTerm: { type: String, required: true, trim: true, default: '2026-2027' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    paidAt: { type: Date, default: null },
    paymentId: { type: Number, default: null },
    paymentReference: { type: String, default: null },
    assessedBy: { type: Number, default: null },
    waivedBy: { type: Number, default: null },
    waiverReason: { type: String, trim: true, default: null },
  },
  {
    collection: 'membership_dues',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

membershipDuesSchema.index({ userId: 1, academicTerm: 1 });
membershipDuesSchema.index({ userId: 1, status: 1 });

membershipDuesSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('membership_dues');
  }
  next();
});

export const MembershipDues = mongoose.model('MembershipDues', membershipDuesSchema);
export default MembershipDues;
