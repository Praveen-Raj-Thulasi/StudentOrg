import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const certificateTemplateSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    templateUrl: { type: String, required: true },
    originalFileName: { type: String, default: null },
    contentType: { type: String, default: null },
    active: { type: Boolean, default: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'certificate_templates',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

certificateTemplateSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('certificate_templates');
  }
  next();
});

export const CertificateTemplate = mongoose.model('CertificateTemplate', certificateTemplateSchema);
export default CertificateTemplate;
