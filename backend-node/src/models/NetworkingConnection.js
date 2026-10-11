import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const networkingConnectionSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    requesterId: { type: Number, required: true, index: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiverId: { type: Number, required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    matchReason: { type: String, default: null },
    matchScore: { type: Number, default: null },
  },
  {
    collection: 'networking_connections',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

networkingConnectionSchema.index({ requesterId: 1, receiverId: 1 }, { unique: true });

networkingConnectionSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('networking_connections');
  }
  next();
});

export const NetworkingConnection = mongoose.model(
  'NetworkingConnection',
  networkingConnectionSchema
);
export default NetworkingConnection;
