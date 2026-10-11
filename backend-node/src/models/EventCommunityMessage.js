import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const eventCommunityMessageSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    eventId: { type: Number, required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    senderId: { type: Number, required: true, index: true },
    senderRole: { type: String, required: true },
    senderName: { type: String, required: true },
    messageType: {
      type: String,
      enum: ['TEXT', 'IMAGE', 'FILE', 'ANNOUNCEMENT'],
      default: 'TEXT',
    },
    message: { type: String, required: true },
    content: { type: String, default: null },
    attachmentUrl: { type: String, default: null },
    pinned: { type: Boolean, default: false },
    announcement: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    moderationStatus: { type: String, default: 'CLEAN' },
    sentAt: { type: Date, default: Date.now, index: true },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'event_community_messages',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

eventCommunityMessageSchema.index({ eventId: 1, sentAt: -1 });

eventCommunityMessageSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('event_community_messages');
  }
  if (!this.content && this.message) {
    this.content = this.message;
  }
  next();
});

export const EventCommunityMessage = mongoose.model(
  'EventCommunityMessage',
  eventCommunityMessageSchema
);
export default EventCommunityMessage;
