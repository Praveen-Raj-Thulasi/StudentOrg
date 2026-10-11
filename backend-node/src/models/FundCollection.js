import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const fundCollectionSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    collectionNumber: { type: String, unique: true, index: true },
    campaignId: { type: Number, required: true, index: true },
    sponsorshipId: { type: Number, default: null, index: true },
    collectorId: { type: Number, required: true, index: true },
    collectorName: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: ['SPONSORSHIP', 'DIRECT_DONATION', 'CROWDFUNDING', 'EVENT_STALL', 'ALUMNI_GIFT', 'OTHER'],
      default: 'DIRECT_DONATION',
      index: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR', uppercase: true },
    academicTerm: { type: String, default: '2026-2027', trim: true, index: true },
    evidenceUrl: { type: String, default: null, trim: true },
    receiptReference: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ['RECORDED', 'VERIFIED', 'REJECTED', 'REFUNDED'],
      default: 'RECORDED',
      index: true,
    },
    verifiedBy: { type: Number, default: null, index: true },
    verifiedAt: { type: Date, default: null },
    verificationNotes: { type: String, default: null, trim: true },
    ledgerEntryId: { type: Number, default: null, index: true },
    idempotencyKey: { type: String, unique: true, sparse: true, index: true },
  },
  {
    collection: 'fund_collections',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

fundCollectionSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('fund_collections');
    }
    if (!this.collectionNumber) {
      this.collectionNumber = `COL-${new Date().getFullYear()}-${String(this.id).padStart(4, '0')}`;
    }
    if (!this.idempotencyKey) {
      this.idempotencyKey = `COLL_${this.collectionNumber || this.id}_${Date.now()}`;
    }
  }
});

export const FundCollection = mongoose.model('FundCollection', fundCollectionSchema);
export default FundCollection;
