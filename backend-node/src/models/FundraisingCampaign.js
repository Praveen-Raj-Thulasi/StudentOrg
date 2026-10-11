import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const fundraisingCampaignSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    campaignCode: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR', uppercase: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    ownerId: { type: Number, required: true, index: true },
    category: { type: String, default: 'COMMUNITY', trim: true },
  },
  {
    collection: 'fundraising_campaigns',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

fundraisingCampaignSchema.pre('validate', async function () {
  if (this.isNew) {
    if (!this.id) {
      this.id = await getNextSequenceValue('fundraising_campaigns');
    }
    if (!this.campaignCode) {
      this.campaignCode = `FND-${new Date().getFullYear()}-${String(this.id).padStart(4, '0')}`;
    }
  }
});

export const FundraisingCampaign = mongoose.model('FundraisingCampaign', fundraisingCampaignSchema);
export default FundraisingCampaign;
