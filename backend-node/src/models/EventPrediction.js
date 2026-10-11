import mongoose from 'mongoose';

const eventPredictionSchema = new mongoose.Schema(
  {
    eventId: { type: Number, required: true, unique: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    predictedRegistrations: { type: Number, default: 0 },
    predictedAttendance: { type: Number, default: 0 },
    predictedNoShowRate: { type: Number, default: 0 },
    predictedRevenue: { type: Number, default: 0 },
    predictedFoodCount: { type: Number, default: 0 },
    predictedCertificateCount: { type: Number, default: 0 },
    successScore: { type: Number, default: 0 },
    aiSuggestions: { type: String, default: null },
    budgetEstimate: { type: Number, default: 0 },
    expectedRevenue: { type: Number, default: 0 },
    breakEvenPoint: { type: Number, default: 0 },
    estimatedProfit: { type: Number, default: 0 },
  },
  {
    collection: 'event_predictions',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

export const EventPrediction = mongoose.model('EventPrediction', eventPredictionSchema);
export default EventPrediction;
