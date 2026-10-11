import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const sponsorshipSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    sponsorshipCode: { type: String, unique: true, index: true },
    campaignId: { type: Number, required: true, index: true },
    sponsorName: { type: String, required: true, trim: true, maxlength: 200 },
    sponsorContact: { type: String, default: null, trim: true },
    sponsorEmail: { type: String, default: null, trim: true, lowercase: true },
    tier: {
      type: String,
      enum: ['TITLE', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'PARTNER'],
      default: 'BRONZE',
      index: true,
    },
    promisedAmount: { type: Number, required: true, min: 1 },
    receivedAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    academicTerm: { type: String, default: '2026-2027', trim: true, index: true },
    status: {
      type: String,
      enum: ['PROMISED', 'PARTIALLY_RECEIVED', 'VERIFIED_RECEIVED', 'REJECTED', 'CANCELLED'],
      default: 'PROMISED',
      index: true,
    },
    paymentEvidenceUrl: { type: String, default: null, trim: true },
    paymentReference: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    verifiedBy: { type: Number, default: null, index: true },
    verifiedAt: { type: Date, default: null },
    createdBy: { type: Number, required: true, index: true },
  },
  {
    collection: 'sponsorships',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

sponsorshipSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('sponsorships');
    }
    if (!this.sponsorshipCode) {
      this.sponsorshipCode = `SPN-${new Date().getFullYear()}-${String(this.id).padStart(4, '0')}`;
    }
  }
});

export const Sponsorship = mongoose.model('Sponsorship', sponsorshipSchema);
export default Sponsorship;
