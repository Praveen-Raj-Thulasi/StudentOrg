import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const certificateSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    certificateId: { type: String, required: true, unique: true, index: true },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipientName: { type: String, required: true, trim: true },
    collegeName: { type: String, trim: true, default: null },
    departmentName: { type: String, trim: true, default: null },
    eventName: { type: String, required: true, trim: true },
    issuedAt: { type: Date, default: Date.now, index: true },
    pdfUrl: { type: String, default: null },
    qrCodeUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    verificationToken: { type: String, index: true, default: null },
    certificateType: { type: String, default: 'PARTICIPATION' },
    participantId: { type: String, default: null },
    participantEmail: { type: String, default: null },
    organizerName: { type: String, default: null },
    organizationName: { type: String, default: null },
    verificationUrl: { type: String, default: null },
    releaseDate: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: null },
    downloadCount: { type: Number, default: 0 },
    verificationCount: { type: Number, default: 0 },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
    emailAttemptCount: { type: Number, default: 0 },
    emailFailureReason: { type: String, default: null },
    status: {
      type: String,
      enum: ['PENDING', 'GENERATED', 'ISSUED', 'RELEASED', 'EMAILED', 'FAILED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },
  },
  {
    collection: 'certificates',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

certificateSchema.index({ eventId: 1, userId: 1 }, { unique: true });

certificateSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('certificates');
  }
  next();
});

export const Certificate = mongoose.model('Certificate', certificateSchema);
export default Certificate;
