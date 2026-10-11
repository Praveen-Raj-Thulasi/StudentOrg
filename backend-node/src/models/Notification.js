import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: Number, required: true, index: true },
    recipientType: { type: String, required: true, enum: ['USER', 'ORGANIZER'], default: 'USER' },
    notificationType: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    actionUrl: { type: String, default: null },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'notifications',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

notificationSchema.index({ recipientId: 1, recipientType: 1, read: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
