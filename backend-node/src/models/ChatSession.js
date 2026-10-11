import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, index: true, default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userRole: { type: String, default: 'GUEST' },
    title: { type: String, default: 'Chat' },
    messages: { type: [chatMessageSchema], default: [] },
  },
  {
    collection: 'chat_sessions',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

chatSessionSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('chat_sessions');
  }
  next();
});

export const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
export default ChatSession;
