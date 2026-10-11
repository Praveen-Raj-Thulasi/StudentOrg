import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const volunteerTaskSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: '' },
    eventId: { type: Number, default: null, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    volunteerId: { type: Number, required: true, index: true },
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedBy: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'COMPLETED'],
      default: 'PENDING',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
    },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completionNotes: { type: String, default: null, trim: true },
    evidenceUrl: { type: String, default: null, trim: true },
    evidenceNotes: { type: String, default: null, trim: true },
    pointsAwarded: { type: Number, default: 0 },
    verifiedBy: { type: Number, default: null, index: true },
    verifiedAt: { type: Date, default: null },
  },
  {
    collection: 'volunteer_tasks',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

volunteerTaskSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('volunteer_tasks');
  }
  next();
});

export const VolunteerTask = mongoose.model('VolunteerTask', volunteerTaskSchema);
export default VolunteerTask;
