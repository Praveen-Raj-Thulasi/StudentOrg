import mongoose from 'mongoose';
import { getNextSequenceValue } from '../utils/sequenceHelper.js';

const aiVectorDocumentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    sourceType: { type: String, required: true, index: true },
    sourceId: { type: String, required: true, index: true },
    chunkIndex: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 220 },
    content: { type: String, required: true },
    contentHash: { type: String, required: true, index: true },
    embedding: { type: [Number], default: [] },
  },
  {
    collection: 'ai_vector_documents',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true },
  }
);

aiVectorDocumentSchema.index({ sourceType: 1, sourceId: 1, chunkIndex: 1 }, { unique: true });

aiVectorDocumentSchema.pre('save', async function (next) {
  if (this.isNew && !this.id) {
    this.id = await getNextSequenceValue('ai_vector_documents');
  }
  next();
});

export const AiVectorDocument = mongoose.model('AiVectorDocument', aiVectorDocumentSchema);
export default AiVectorDocument;
