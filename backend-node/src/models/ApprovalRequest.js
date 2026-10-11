import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const approvalRequestSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    organizerId: { type: Number, required: true, index: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'Organizer' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'MODIFICATION_REQUESTED'],
      default: 'PENDING',
      index: true,
    },
    reviewNote: { type: String, default: null },
    reviewedBy: { type: Number, default: null },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
  },
  {
    collection: 'approval_requests',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

approvalRequestSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('approval_requests');
  }
  next();
});

export const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
export default ApprovalRequest;
