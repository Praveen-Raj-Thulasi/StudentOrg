import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const attendanceSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    ticketId: { type: String, required: true, unique: true, index: true },
    bookingId: { type: Number, required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    checkedInAt: { type: Date, required: true, default: Date.now },
    scannedByOrganizerId: { type: Number, default: null },
    scannedByOrganizer: { type: mongoose.Schema.Types.ObjectId, ref: 'Organizer' },
    scanMethod: {
      type: String,
      enum: ['QR_CAMERA', 'BARCODE_SCANNER', 'MANUAL'],
      default: 'MANUAL',
    },
  },
  {
    collection: 'attendance',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

attendanceSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('attendance');
  }
  next();
});

export const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
