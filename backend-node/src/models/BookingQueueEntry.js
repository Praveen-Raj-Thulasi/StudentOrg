import mongoose from 'mongoose';

const bookingQueueEntrySchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    eventId: { type: Number, required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    requestTimestamp: { type: Date, required: true, default: Date.now },
    bookingStatus: {
      type: String,
      enum: [
        'RECEIVED',
        'PROCESSING',
        'PAYMENT_PENDING',
        'BOOKING_SUCCESSFUL',
        'PAYMENT_FAILED',
        'TICKETS_SOLD_OUT',
        'EXPIRED',
        'FAILED',
      ],
      default: 'RECEIVED',
      index: true,
    },
    bookingId: { type: Number, default: null },
    message: { type: String, default: null },
  },
  {
    collection: 'booking_queue',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

bookingQueueEntrySchema.index({ eventId: 1, requestTimestamp: 1 });

export const BookingQueueEntry = mongoose.model(
  'BookingQueueEntry',
  bookingQueueEntrySchema
);
export default BookingQueueEntry;
