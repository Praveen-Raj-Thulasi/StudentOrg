import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const eventRatingSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bookingId: { type: Number, default: null },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    overallRating: { type: Number, required: true, min: 1, max: 5 },
    speakerRating: { type: Number, min: 1, max: 5, default: null },
    venueRating: { type: Number, min: 1, max: 5, default: null },
    foodRating: { type: Number, min: 1, max: 5, default: null },
    organizationRating: { type: Number, min: 1, max: 5, default: null },
    timeManagementRating: { type: Number, min: 1, max: 5, default: null },
    contentQualityRating: { type: Number, min: 1, max: 5, default: null },
    valueForMoneyRating: { type: Number, min: 1, max: 5, default: null },
    accommodationRating: { type: Number, min: 1, max: 5, default: null },
    eventQualityRating: { type: Number, min: 1, max: 5, default: null },
    reviewText: { type: String, default: null },
    photoUrls: [{ type: String }],
    suggestions: { type: String, default: null },
    anonymous: { type: Boolean, default: false },
    isVerifiedAttendance: { type: Boolean, default: false, index: true },
    moderationStatus: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'APPROVED',
      index: true,
    },
    moderationNote: { type: String, default: null },
    isFakeFlagged: { type: Boolean, default: false },
    sentiment: { type: String, default: null },
    sentimentScore: { type: Number, default: null },
    isTestimonialCandidate: { type: Boolean, default: false },
  },
  {
    collection: 'event_ratings',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

eventRatingSchema.index({ userId: 1, eventId: 1 }, { unique: true });

eventRatingSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('event_ratings');
  }
  next();
});

export const EventRating = mongoose.model('EventRating', eventRatingSchema);
export default EventRating;
