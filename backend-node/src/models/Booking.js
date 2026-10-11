import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const participantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    department: { type: String, trim: true, default: null },
    college: { type: String, trim: true, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const bookingSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    ticketId: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    quantity: { type: Number, required: true, min: 1 },
    totalAmount: { type: Number, required: true, min: 0 },
    ticketUnitPrice: { type: Number, min: 0, default: null },
    membershipPricingApplied: { type: Boolean, default: false },
    bookingStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
    ticketStatus: {
      type: String,
      enum: ['ACTIVE', 'VALID', 'CHECKED_IN', 'EXPIRED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    attendanceStatus: {
      type: String,
      enum: ['NOT_ATTENDED', 'PRESENT', 'ABSENT'],
      default: 'NOT_ATTENDED',
      index: true,
    },
    qrCodePath: { type: String, default: null },
    checkInTime: { type: Date, default: null },
    checkedInBy: { type: Number, default: null },
    certificateEligible: { type: Boolean, default: false },
    cancellationReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
    bookedAt: { type: Date, default: Date.now, index: true },
    participants: { type: [participantSchema], default: [] },
  },
  {
    collection: 'bookings',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

// Indexes
bookingSchema.index({ userId: 1, eventId: 1, bookingStatus: 1 });
bookingSchema.index({ eventId: 1, bookingStatus: 1 });

// Pre-save hook: auto-assign sequential numeric id
bookingSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('bookings');
  }
  next();
});

export const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
