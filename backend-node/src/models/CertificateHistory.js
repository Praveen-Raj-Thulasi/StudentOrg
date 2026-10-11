import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const certificateHistorySchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    certificateId: { type: String, required: true, index: true },
    certificateDbId: { type: Number, default: null, index: true },
    action: { type: String, required: true },
    actorId: { type: Number, default: null },
    actorRole: { type: String, default: null },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'certificate_history',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

certificateHistorySchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('certificate_history');
  }
  next();
});

export const CertificateHistory = mongoose.model('CertificateHistory', certificateHistorySchema);
export default CertificateHistory;
