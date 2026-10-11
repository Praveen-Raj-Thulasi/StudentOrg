import mongoose from 'mongoose';

const sentimentAnalysisSchema = new mongoose.Schema(
  {
    eventId: { type: Number, required: true, unique: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    positiveCount: { type: Number, default: 0 },
    neutralCount: { type: Number, default: 0 },
    negativeCount: { type: Number, default: 0 },
    satisfactionScore: { type: Number, default: 0 },
    strengths: { type: String, default: null },
    weaknesses: { type: String, default: null },
    improvementSuggestions: { type: String, default: null },
    improvementReport: { type: String, default: null },
    aiTestimonial: { type: String, default: null },
    totalReviewsAnalyzed: { type: Number, default: 0 },
  },
  {
    collection: 'sentiment_analyses',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

export const SentimentAnalysis = mongoose.model('SentimentAnalysis', sentimentAnalysisSchema);
export default SentimentAnalysis;
