import mongoose from 'mongoose';

const organizerScoreSchema = new mongoose.Schema(
  {
    organizerId: { type: Number, required: true, unique: true, index: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'Organizer' },
    averageRating: { type: Number, default: 0 },
    totalEvents: { type: Number, default: 0 },
    completedEvents: { type: Number, default: 0 },
    totalRegistrations: { type: Number, default: 0 },
    totalAttendance: { type: Number, default: 0 },
    attendanceRate: { type: Number, default: 0 },
    refundRatio: { type: Number, default: 0 },
    cancellationRate: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0 },
    badge: { type: String, default: 'NONE' },
    isFeatured: { type: Boolean, default: false },
  },
  {
    collection: 'organizer_scores',
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

export const OrganizerScore = mongoose.model('OrganizerScore', organizerScoreSchema);
export default OrganizerScore;
