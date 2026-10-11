import mongoose from 'mongoose';

const collegeRankingSchema = new mongoose.Schema(
  {
    collegeName: { type: String, required: true, unique: true, index: true },
    totalParticipants: { type: Number, default: 0 },
    totalEventsAttended: { type: Number, default: 0 },
    totalCertificates: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0.0 },
    overallScore: { type: Number, default: 0.0 },
    rankPosition: { type: Number, default: 0 },
  },
  {
    collection: 'college_rankings',
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

export const CollegeRanking = mongoose.model('CollegeRanking', collegeRankingSchema);
export default CollegeRanking;
