import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const volunteerApplicationSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    volunteerId: { type: Number, required: true, index: true },
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    category: { type: String, default: 'GENERAL', trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
      default: 'PENDING',
      index: true,
    },
    notes: { type: String, default: null, trim: true },
    reviewedBy: { type: Number, default: null, index: true },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null, trim: true },
  },
  {
    collection: 'volunteer_applications',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

volunteerApplicationSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('volunteer_applications');
  }
  next();
});

export const VolunteerApplication = mongoose.model('VolunteerApplication', volunteerApplicationSchema);
export default VolunteerApplication;
