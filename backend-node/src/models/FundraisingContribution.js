import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const fundraisingContributionSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    contributionNumber: { type: String, unique: true, index: true },
    campaignId: { type: Number, required: true, index: true },
    donorUserId: { type: Number, default: null, index: true },
    donorName: { type: String, required: true, trim: true },
    donorEmail: { type: String, required: true, trim: true, lowercase: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR', uppercase: true },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    isAnonymous: { type: Boolean, default: false },
    transactionId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: Number, default: null, index: true },
    receiptNumber: { type: String, default: null },
    message: { type: String, default: null, trim: true },
  },
  {
    collection: 'fundraising_contributions',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

fundraisingContributionSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('fundraising_contributions');
    }
    if (!this.contributionNumber) {
      this.contributionNumber = `DON-${new Date().getFullYear()}-${String(this.id).padStart(5, '0')}`;
    }
  }
});

export const FundraisingContribution = mongoose.model('FundraisingContribution', fundraisingContributionSchema);
export default FundraisingContribution;
