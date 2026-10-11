import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const directMessageSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    senderId: { type: Number, required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiverId: { type: Number, required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, required: true },
    messageType: { type: String, default: 'TEXT' },
    voiceUrl: { type: String, default: null },
    voiceDurationSeconds: { type: Number, default: 0 },
    attachmentUrl: { type: String, default: null },
    read: { type: Boolean, default: false, index: true },
    edited: { type: Boolean, default: false },
    deletedForSender: { type: Boolean, default: false },
    deletedForReceiver: { type: Boolean, default: false },
    deletedForEveryone: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'direct_messages',
    timestamps: false,
    toJSON: { virtuals: true },
  }
);

directMessageSchema.index({ senderId: 1, receiverId: 1, sentAt: -1 });

directMessageSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('direct_messages');
  }
  next();
});

export const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);
export default DirectMessage;
