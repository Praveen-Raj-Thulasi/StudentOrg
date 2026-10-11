import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const eventRecommendationSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    recommendationCategory: { type: String, default: null, index: true },
    matchScore: { type: Number, default: 0 },
    reason: { type: String, default: null },
    rankPosition: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null, index: true },
  },
  {
    collection: 'event_recommendations',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

eventRecommendationSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('event_recommendations');
  }
  next();
});

export const EventRecommendation = mongoose.model(
  'EventRecommendation',
  eventRecommendationSchema
);
export default EventRecommendation;
